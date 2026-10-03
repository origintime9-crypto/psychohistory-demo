import { actionUnavailable, CARDS, drawHand } from '../engine/cards';
import { targetEffects } from '../engine/decisions';
import {
  forecast,
  prepareBaseline,
  previewAction,
  type ForecastBaseline,
  type ForecastOptions,
} from '../engine/forecast';
import { DEFAULT_PARAMS, type Params } from '../engine/params';
import { previewStoryChoice, storyBudget, storyEvent } from '../engine/story';
import type {
  Action,
  CardEstimate,
  CardId,
  HistoryPoint,
  State,
  TargetEffect,
  World,
} from '../engine/types';

export type RequestKind = 'baseline' | 'preview' | 'contrast' | 'hand';
export interface ForecastRequest {
  id: number;
  session: number;
  baselineId?: number;
  kind: RequestKind;
  world: World;
  state: State;
  action: Action;
  M: number;
  H: number;
  seed: string;
  params?: Params;
  history?: HistoryPoint[];
}
export function requestOptions(q: ForecastRequest): ForecastOptions {
  return {
    M: q.M,
    H: q.H,
    seed: q.seed,
    params: { ...(q.params ?? DEFAULT_PARAMS), mule: false },
    terminal: q.kind !== 'contrast',
    history: q.history,
    eventChoice: q.action.eventChoice,
  };
}
export class ForecastService {
  private cache: { session: number; id: number; key: string; baseline: ForecastBaseline } | null =
    null;
  session = 0;
  execute(q: ForecastRequest) {
    if (q.session < this.session) return null;
    this.session = q.session;
    const options = requestOptions(q);
    const key = JSON.stringify({ world: q.world.seed, n: q.world.n, state: q.state, options });
    if (q.kind === 'baseline') {
      const baseline = prepareBaseline(q.world, q.state, options);
      this.cache = { session: q.session, id: q.id, key, baseline };
      return { forecast: baseline.result };
    }
    if (q.kind === 'preview') {
      const cache = this.cache;
      return previewAction(
        q.world,
        q.state,
        q.action,
        options,
        cache?.session === q.session && cache.id === q.baselineId && cache.key === key
          ? cache.baseline
          : undefined,
      );
    }
    return { forecast: forecast(q.world, q.state, q.action, options) };
  }
}
export function estimateCard(
  q: ForecastRequest,
  card: CardId,
  baseline: ForecastBaseline,
): { estimate: CardEstimate; effects: TargetEffect[] } {
  const options = requestOptions(q);
  const eventState = previewStoryChoice(
    q.world,
    q.state,
    storyEvent(q.world, q.state, options.params),
    q.action.eventChoice,
  );
  const effects = CARDS[card].targeted
    ? targetEffects(q.world, eventState, card, options.params!)
    : [];
  const actions: Action[] = CARDS[card].targeted
    ? [...effects]
        .sort((a, b) => b.rank - a.rank || a.target - b.target)
        .slice(0, 3)
        .map((e) => ({ card, target: e.target, eventChoice: q.action.eventChoice }))
    : [{ card, eventChoice: q.action.eventChoice }];
  let best: CardEstimate | null = null;
  for (const action of actions) {
    const result = previewAction(q.world, q.state, action, options, baseline);
    if (!best || result.comparison.scoreDelta > best.comparison.scoreDelta)
      best = { ...action, comparison: result.comparison, samples: q.M };
  }
  if (!best) throw new Error('没有可估算的目标');
  return { estimate: best, effects };
}
export function playableHand(q: ForecastRequest): CardId[] {
  const eventState = previewStoryChoice(
    q.world,
    q.state,
    storyEvent(q.world, q.state, q.params),
    q.action.eventChoice,
  );
  const event = storyEvent(q.world, q.state, q.params);
  const choice = event?.choices.find((option) => option.id === (q.action.eventChoice ?? 'defer'));
  const budget = choice ? storyBudget(q.state, choice) : q.state;
  return drawHand(q.world, q.state.turn, q.params).filter(
    (card) =>
      !actionUnavailable(q.world, eventState, card) && !actionUnavailable(q.world, budget, card),
  );
}
