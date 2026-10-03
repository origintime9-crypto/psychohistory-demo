import { CARDS, drawHand, validateAction } from '../engine/cards';
import { initialChronicle } from '../engine/campaign';
import { step } from '../engine/dynamics';
import { describeEvent, turnHeadline } from '../engine/flavor';
import { revealForecast } from '../engine/forecast';
import { DEFAULT_PARAMS, TOTAL_TURNS, type Params } from '../engine/params';
import { Rng, stream } from '../engine/rng';
import { previewStoryChoice, storyBudget, storyEvent, storyUnavailable } from '../engine/story';
import {
  counts,
  type Action,
  type Event,
  type ForecastResult,
  type HistoryPoint,
  type Observation,
  type Reveal,
  type State,
  type StoryChoiceId,
  type World,
} from '../engine/types';
import { generateWorld, initialState } from '../engine/worldgen';
import { initialStrategy } from '../engine/strategy';
import type { DecadeChapter } from '../engine/decade';
import type { LogEntry } from './EventLog';
import { turnOutcome, type TurnOutcome } from './turnOutcome';

export interface Session {
  world: World;
  state: State;
  params: Params;
  reality: Rng;
  calibration: Rng;
  history: HistoryPoint[];
  reveals: Reveal[];
  observations: Observation[];
  actions: Action[];
  logs: LogEntry[];
  events: Event[];
  finalContext: { state: State; action: Action } | null;
  lastOutcome: TurnOutcome | null;
  chapters: DecadeChapter[];
}
export interface Game {
  session: Session | null;
  action: Action;
  sector: number | undefined;
  view: 'empire' | 'law' | 'briefing';
  status: 'setup' | 'playing' | 'revealing' | 'ended' | 'reviewing';
  contagion: boolean;
  commonShock: boolean;
  reveal: Reveal | null;
  revealedForecast: ForecastResult | null;
  muleRevealed: boolean;
  tutorialStep: number | null;
  tutorialDone: boolean;
  error: string | null;
}
export type GameAction =
  | { type: 'START'; seed: string; n: number; mule: boolean }
  | { type: 'SELECT_ACTION'; action: Action }
  | { type: 'SELECT_EVENT'; choice: StoryChoiceId }
  | { type: 'OPEN_GUIDE' }
  | { type: 'SELECT_SECTOR'; sector: number }
  | { type: 'VIEW'; view: Game['view'] }
  | { type: 'TOGGLE'; channel: 'contagion' | 'shock'; value: boolean }
  | { type: 'ADVANCE'; turn: number; forecast: ForecastResult }
  | { type: 'FINISH_REVEAL' }
  | { type: 'CLEAR_REVEAL' }
  | { type: 'END' }
  | { type: 'REVIEW' }
  | { type: 'RESET' }
  | { type: 'TUTORIAL_NEXT' }
  | { type: 'TUTORIAL_DISMISS' };

export function emptyGame(tutorialDone = false): Game {
  return {
    session: null,
    action: { card: 'noop' },
    sector: undefined,
    view: 'empire',
    status: 'setup',
    contagion: true,
    commonShock: true,
    reveal: null,
    revealedForecast: null,
    muleRevealed: false,
    tutorialStep: null,
    tutorialDone,
    error: null,
  };
}
export function createSession(seed: string, n: number, params: Params): Session {
  const world = generateWorld(seed, { n, atlas: params.atlas });
  return {
    world,
    state: {
      ...initialState(world),
      ...(params.campaign ? { chronicle: initialChronicle() } : {}),
      ...(params.strategic ? { strategic: initialStrategy(world) } : {}),
    },
    params: { ...params },
    reality: stream(seed, 'reality'),
    calibration: stream(seed, 'calibration'),
    history: [],
    reveals: [],
    observations: [],
    actions: [],
    logs: [],
    events: [],
    finalContext: null,
    lastOutcome: null,
    chapters: [],
  };
}

/** Cloned RNGs make this transformation pure, including React StrictMode's repeated reducer calls. */
export function advanceSession(
  session: Session,
  action: Action,
  forecast?: ForecastResult,
  restoredReveal?: Reveal,
): { session: Session; reveal: Reveal; muleEvent: boolean } {
  const { world, state, params } = session;
  if (state.turn >= TOTAL_TURNS || !drawHand(world, state.turn, params).includes(action.card))
    throw new Error('该行动不在当前手牌中');
  const reality = session.reality.clone(),
    calibration = session.calibration.clone();
  const result = step(world, state, action, reality, params, { captureImpact: true }),
    next = result.state,
    c = counts(next);
  let reveal: Reveal;
  if (forecast) reveal = revealForecast(forecast, c.crisis, next.turn, calibration);
  else {
    if (!restoredReveal || restoredReveal.turn !== next.turn || restoredReveal.actual !== c.crisis)
      throw new Error('存档中的揭晓记录与行动重放不一致');
    calibration.uniform();
    reveal = { ...restoredReveal };
  }
  const logs: LogEntry[] = [
    {
      turn: next.turn,
      text: `${CARDS[action.card].name}${CARDS[action.card].targeted ? ` · ${world.names[action.target!]}` : ''}。${turnHeadline(next.turn, c.independent, world.n)}`,
    },
  ];
  if (result.story)
    logs.push({
      turn: next.turn,
      text: `${result.story.title}：${result.story.label}。${result.story.text}`,
      tone: result.story.success ? 'normal' : 'warn',
    });
  if (result.muleEvent)
    logs.push({
      turn: next.turn,
      text: `“骡”出现了。它的影响未进入预测模型。实际危机 ${c.crisis}，事前 90% 区间 ${reveal.lo90}–${reveal.hi90}；${reveal.covered ? '本次仍落在区间内，但模型已遗漏冲击机制。' : '预测区间被击穿：更多星区也无法抵消模型未知的共同冲击。'}`,
      tone: 'warn',
    });
  else if (result.shock > 0.65)
    logs.push({ turn: next.turn, text: '继位危机震动川陀，所有星区面临共同压力。', tone: 'warn' });
  if (result.reformFailed)
    logs.push({ turn: next.turn, text: '行政改革失败。被排除的精英形成新的派系。', tone: 'warn' });
  if (state.taxReliefTurns > 0 && next.taxReliefTurns === 0)
    logs.push({ turn: next.turn, text: '限时减负结束，帝国恢复原税率。' });
  for (const event of result.events)
    logs.push({
      turn: next.turn,
      text: describeEvent(world, event),
      tone: event.to === 3 || event.to === 2 ? 'warn' : event.to === 0 ? 'good' : 'normal',
    });
  if (!result.events.length)
    logs.push({ turn: next.turn, text: '这十年没有星区改变状态。暗流仍在积累。' });
  const outcome = turnOutcome(world, state, action, result);
  return {
    reveal,
    muleEvent: result.muleEvent,
    session: {
      ...session,
      state: next,
      reality,
      calibration,
      actions: [...session.actions, { ...action }],
      reveals: [...session.reveals, reveal],
      observations: forecast
        ? [
            ...session.observations,
            ...forecast.probabilities.map((probability, i) => ({
              probability,
              outcome: next.phase[i] === 1 || next.phase[i] === 2 ? 1 : 0,
            })),
          ]
        : session.observations,
      history: [
        ...session.history,
        {
          turn: next.turn,
          crisis: c.crisis,
          stable: c.stable / world.n,
          independent: c.independent / world.n,
          foundation: next.foundation,
        },
      ],
      logs: [...session.logs, ...logs],
      events: result.events,
      finalContext: next.turn === TOTAL_TURNS ? { state, action: { ...action } } : null,
      lastOutcome: outcome,
      chapters: [...session.chapters, outcome.chapter],
    },
  };
}

export function gameReducer(game: Game, event: GameAction): Game {
  try {
    switch (event.type) {
      case 'START':
        return {
          ...emptyGame(game.tutorialDone),
          session: createSession(event.seed, event.n, {
            ...DEFAULT_PARAMS,
            mule: event.mule,
            campaign: true,
            strategic: true,
            atlas: true,
          }),
          status: 'playing',
          tutorialStep: game.tutorialDone ? null : 0,
          view: game.tutorialDone ? 'empire' : 'briefing',
        };
      case 'RESET':
        return emptyGame(game.tutorialDone);
      case 'SELECT_ACTION':
        if (game.status !== 'playing') return game;
        return {
          ...game,
          action: { ...event.action, eventChoice: game.action.eventChoice },
          sector: event.action.target ?? game.sector,
          reveal: null,
          revealedForecast: null,
          muleRevealed: false,
          error: null,
        };
      case 'SELECT_SECTOR': {
        if (!game.session || event.sector < 0 || event.sector >= game.session.world.n) return game;
        const targetable =
          game.status === 'playing' &&
          CARDS[game.action.card].targeted &&
          game.session.state.phase[event.sector] !== 3;
        return {
          ...game,
          sector: event.sector,
          ...(targetable
            ? {
                action: { ...game.action, target: event.sector },
                reveal: null,
                revealedForecast: null,
                muleRevealed: false,
              }
            : {}),
        };
      }
      case 'SELECT_EVENT': {
        if (!game.session || game.status !== 'playing') return game;
        const s = game.session,
          dispatch = storyEvent(s.world, s.state, s.params);
        const option = dispatch?.choices.find((c) => c.id === event.choice);
        if (!option) throw new Error('当前事件没有这个选项');
        const unavailable = storyUnavailable(s.state, option);
        if (unavailable) throw new Error(unavailable);
        previewStoryChoice(s.world, s.state, dispatch!, event.choice);
        if (s.params.strategic) validateAction(s.world, storyBudget(s.state, option), game.action);
        return {
          ...game,
          action: {
            ...(s.params.strategic ? game.action : { card: 'noop' as const }),
            eventChoice: event.choice,
          },
          reveal: null,
          revealedForecast: null,
          muleRevealed: false,
          error: null,
        };
      }
      case 'OPEN_GUIDE':
        return { ...game, tutorialStep: 0, view: 'briefing' };
      case 'VIEW':
        return { ...game, view: event.view };
      case 'TOGGLE':
        return {
          ...game,
          ...(event.channel === 'contagion'
            ? { contagion: event.value }
            : { commonShock: event.value }),
        };
      case 'ADVANCE': {
        if (!game.session || game.status !== 'playing' || event.turn !== game.session.state.turn)
          return game;
        if (game.view === 'briefing') return game;
        if (
          storyEvent(game.session.world, game.session.state, game.session.params) &&
          !game.action.eventChoice
        )
          throw new Error('先回应本回合的事件，再推进十年');
        const next = advanceSession(game.session, game.action, event.forecast);
        return {
          ...game,
          session: next.session,
          action: { card: 'noop' },
          status: 'revealing',
          reveal: next.reveal,
          revealedForecast: event.forecast,
          muleRevealed: next.muleEvent,
          error: null,
        };
      }
      case 'FINISH_REVEAL':
        return game.status === 'revealing'
          ? { ...game, status: game.session!.state.turn === TOTAL_TURNS ? 'ended' : 'playing' }
          : game;
      case 'CLEAR_REVEAL':
        return { ...game, reveal: null, revealedForecast: null, muleRevealed: false };
      case 'END':
        return game.session?.state.turn === TOTAL_TURNS ? { ...game, status: 'ended' } : game;
      case 'REVIEW':
        return { ...game, status: 'reviewing', view: 'law' };
      case 'TUTORIAL_NEXT':
        return game.tutorialStep === null
          ? game
          : game.tutorialStep < 2
            ? { ...game, tutorialStep: game.tutorialStep + 1 }
            : { ...game, tutorialStep: null, tutorialDone: true, view: 'empire' };
      case 'TUTORIAL_DISMISS':
        return { ...game, tutorialStep: null, tutorialDone: true, view: 'empire' };
    }
  } catch (error) {
    return { ...game, error: error instanceof Error ? error.message : String(error) };
  }
}
