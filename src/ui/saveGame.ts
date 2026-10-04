import { CARDS, LEGACY_CARDS } from '../engine/cards';
import { DEFAULT_PARAMS, MODEL_VERSION, TOTAL_TURNS, type Params } from '../engine/params';
import { hashSeed } from '../engine/rng';
import type { Action, Observation, Reveal, StoryChoiceId } from '../engine/types';
import { storyEvent, storyUnavailable } from '../engine/story';
import { advanceSession, createSession, emptyGame, type Game } from './gameReducer';

export const SAVE_KEY = 'psychohistory:save:v3';
export const GUIDE_KEY = 'psychohistory:guide:v3';
export interface SavedGame {
  format: 3;
  model: string;
  fingerprint: string;
  seed: string;
  sectors: number;
  params: Params;
  actions: Action[];
  reveals: Reveal[];
  observations: Observation[];
  tutorialStep: number | null;
  tutorialDone: boolean;
  pendingEventChoice?: StoryChoiceId;
  pendingChapter?: boolean;
}
export function modelFingerprint(params: Params): string {
  return hashSeed(
    JSON.stringify({
      model: MODEL_VERSION,
      protocol: `${params.strategic ? 'strategic-deck-v1/transport-v1/adaptive-events-v1' : 'weighted-deck-v2'}/fixed-5+9N/mule-stream-v3/${params.campaign ? 'story-v4-campaign' : 'story-v3'}/score-floor-0.1/turns-${TOTAL_TURNS}${params.evolving ? '/decision-memory-v1/branching-letters-v1' : ''}`,
      params,
      cards: params.strategic ? CARDS : LEGACY_CARDS,
    }),
  )
    .toString(16)
    .padStart(8, '0');
}
export function serializeGame(game: Game): string | null {
  if (!game.session) return null;
  const s = game.session;
  const data: SavedGame = {
    format: 3,
    model: MODEL_VERSION,
    fingerprint: modelFingerprint(s.params),
    seed: s.world.seed,
    sectors: s.world.n,
    params: s.params,
    actions: s.actions,
    reveals: s.reveals,
    observations: s.observations,
    tutorialStep: game.tutorialStep,
    tutorialDone: game.tutorialDone,
    pendingEventChoice: game.action.eventChoice,
    pendingChapter: !!s.params.strategic && game.status === 'revealing',
  };
  return JSON.stringify(data);
}
export function restoreGame(raw: string): Game {
  if (raw.length > 2_000_000) throw new Error('存档过大');
  const s = JSON.parse(raw) as SavedGame;
  if (
    s.format !== 3 ||
    s.model !== MODEL_VERSION ||
    !s.params ||
    s.fingerprint !== modelFingerprint(s.params)
  )
    throw new Error('存档版本或参数不兼容，请开始新推演');
  if (
    typeof s.seed !== 'string' ||
    !s.seed.length ||
    s.seed.length > 80 ||
    ![30, 50, 80].includes(s.sectors)
  )
    throw new Error('存档世界设置无效');
  if (
    !Array.isArray(s.actions) ||
    s.actions.length > TOTAL_TURNS ||
    !Array.isArray(s.reveals) ||
    s.reveals.length !== s.actions.length
  )
    throw new Error('存档行动或揭晓记录不完整');
  if (
    !Array.isArray(s.observations) ||
    s.observations.length !== s.actions.length * s.sectors ||
    s.observations.some(
      (o) =>
        !Number.isFinite(o.probability) ||
        o.probability < 0 ||
        o.probability > 1 ||
        (o.outcome !== 0 && o.outcome !== 1),
    )
  )
    throw new Error('存档预测记录无效');
  if (
    Object.keys(s.params).length !==
      Object.keys(DEFAULT_PARAMS).length +
        ['campaign', 'strategic', 'atlas', 'evolving'].filter((key) => Object.hasOwn(s.params, key))
          .length ||
    ['campaign', 'strategic', 'atlas', 'evolving'].some(
      (key) => Object.hasOwn(s.params, key) && typeof s.params[key as keyof Params] !== 'boolean',
    ) ||
    Object.entries(DEFAULT_PARAMS).some(([key, defaultValue]) => {
      const value = s.params[key as keyof Params];
      return (
        typeof value !== typeof defaultValue ||
        (typeof value === 'number' && !Number.isFinite(value))
      );
    })
  )
    throw new Error('存档参数无效');
  if (
    typeof s.tutorialDone !== 'boolean' ||
    (s.pendingChapter !== undefined && typeof s.pendingChapter !== 'boolean') ||
    (s.tutorialStep !== null && ![0, 1, 2].includes(s.tutorialStep))
  )
    throw new Error('存档引导记录无效');
  let session = createSession(s.seed, s.sectors, s.params);
  for (let i = 0; i < s.actions.length; i++) {
    const action = s.actions[i],
      reveal = s.reveals[i];
    if (
      !action ||
      !Object.hasOwn(CARDS, action.card) ||
      !reveal ||
      Object.values(reveal).some(
        (v) => typeof v !== 'boolean' && (typeof v !== 'number' || !Number.isFinite(v)),
      )
    )
      throw new Error('存档包含无效行动或统计值');
    session = advanceSession(session, action, undefined, reveal).session;
  }
  session.observations = s.observations;
  if (s.pendingEventChoice !== undefined) {
    const event = storyEvent(session.world, session.state, session.params);
    const option = event?.choices.find((c) => c.id === s.pendingEventChoice);
    if (!option || storyUnavailable(session.state, option)) throw new Error('存档事件选择无效');
  }
  return {
    ...emptyGame(s.tutorialDone),
    session,
    status:
      s.pendingChapter && session.params.strategic && session.state.turn > 0
        ? 'revealing'
        : session.state.turn === TOTAL_TURNS
          ? 'ended'
          : 'playing',
    reveal: s.pendingChapter && session.params.strategic ? (session.reveals.at(-1) ?? null) : null,
    tutorialStep: s.tutorialStep,
    view: s.tutorialStep !== null ? 'briefing' : 'empire',
    action: { card: 'noop', eventChoice: s.pendingEventChoice },
  };
}
