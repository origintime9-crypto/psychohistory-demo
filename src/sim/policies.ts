import { actionUnavailable, applyAction, CARDS, drawHand } from '../engine/cards';
import { shortlistTargets } from '../engine/decisions';
import { forecast } from '../engine/forecast';
import {
  ambiguity,
  neighborhood,
  onsetProbability,
  transitionProbabilities,
} from '../engine/hazard';
import { DEFAULT_PARAMS, TOTAL_TURNS, type Params } from '../engine/params';
import type { Rng } from '../engine/rng';
import { counts, type Action, type HistoryPoint, type State, type World } from '../engine/types';
export const POLICY_NAMES = [
  'noop',
  'random',
  'greedyCrisis',
  'greedyScore',
  'foundationOnly',
  'stabilityOnly',
  'scriptedFoundationReligion',
] as const;
export type PolicyName = (typeof POLICY_NAMES)[number];
function expectedCrisis(world: World, s: State, p: Params): number {
  let mean = 0;
  for (let i = 0; i < world.n; i++) {
    const v = transitionProbabilities(world, s, i, 0, p);
    mean += v[1] + v[2] + 2 * v[3];
  }
  return mean;
}
export function availableActions(world: World, s: State, p: Params = DEFAULT_PARAMS): Action[] {
  const actions: Action[] = [];
  for (const card of drawHand(world, s.turn, p)) {
    if (actionUnavailable(world, s, card)) continue;
    if (CARDS[card].targeted) {
      for (let i = 0; i < world.n; i++) if (s.phase[i] !== 3) actions.push({ card, target: i });
    } else actions.push({ card });
  }
  return actions;
}
/** Deterministic model-based heuristic, NOT an oracle that can see reality RNG or future hands. */
export function chooseAction(
  policy: PolicyName,
  world: World,
  s: State,
  rng: Rng,
  p: Params = DEFAULT_PARAMS,
  history: HistoryPoint[] = [],
): Action {
  if (policy === 'noop') return { card: 'noop' };
  const cards = drawHand(world, s.turn, p).filter((card) => !actionUnavailable(world, s, card));
  if (policy === 'random') {
    const card = cards[rng.int(cards.length)];
    const targets = Array.from(s.phase, (v, i) => (v < 3 ? i : -1)).filter((i) => i >= 0);
    return { card, ...(CARDS[card].targeted ? { target: targets[rng.int(targets.length)] } : {}) };
  }
  if (policy === 'foundationOnly')
    return { card: cards.includes('foundation') && s.foundation < 1 ? 'foundation' : 'noop' };
  if (policy === 'scriptedFoundationReligion') {
    if (cards.includes('foundation') && s.foundation < 1) return { card: 'foundation' };
    return cards.includes('religion')
      ? shortlistTargets(world, s, 'religion', p, 1)[0]
      : { card: 'noop' };
  }
  if (policy === 'greedyScore') {
    const candidates = cards.flatMap((card) =>
      CARDS[card].targeted ? shortlistTargets(world, s, card, p, 2) : [{ card }],
    );
    let best: Action = { card: 'noop' },
      bestValue = -Infinity;
    for (const action of candidates) {
      const result = forecast(world, s, action, {
        M: 8,
        H: 1,
        terminal: true,
        params: p,
        history,
        seed: `${world.seed}:policy-lookahead-v2:${s.turn}`,
      });
      // A declared reserve heuristic values influence only while future decisions remain.
      const reserve = Math.min(
        4,
        s.influence - CARDS[action.card].cost + (action.card === 'noop' ? 2 : 0),
      );
      const value =
        result.projection.Q +
        (0.004 * reserve * Math.max(0, TOTAL_TURNS - 1 - s.turn)) / TOTAL_TURNS;
      if (value > bestValue + 1e-12) {
        best = action;
        bestValue = value;
      }
    }
    return best;
  }
  const base = expectedCrisis(world, s, p);
  let best: Action = { card: 'noop' },
    bestGain = 0;
  for (const action of availableActions(world, s, p)) {
    if (action.card === 'foundation' || action.card === 'noop') continue;
    const updated = applyAction(world, s, action, 0, p).state;
    let risk = expectedCrisis(world, updated, p);
    if (action.card === 'reform')
      risk =
        0.7 * risk + 0.3 * expectedCrisis(world, applyAction(world, s, action, 0.99, p).state, p);
    // Religious influence and lower pressure act after this step; value their bounded delayed channels.
    let delayed = 0;
    if (policy !== 'greedyCrisis' && CARDS[action.card].targeted) {
      const ids =
        action.card === 'elites'
          ? [action.target!]
          : [action.target!, ...world.neighbors[action.target!]];
      for (const i of ids) {
        const onset = onsetProbability(s, i, neighborhood(world, s, i, p)[0], 0, p);
        const sensitivity =
          s.phase[i] === 0
            ? -Math.log1p(-Math.min(0.999, onset)) * (1 - onset)
            : s.phase[i] === 3
              ? 0
              : 0.2;
        const religiousChannel =
          p.legitimacy * (p.religionLegitimacy ?? 0.25) +
          p.mixedFaction * ambiguity(s.openness[i]) * (p.religionFaction ?? 0.3);
        delayed +=
          Math.min(6, TOTAL_TURNS - s.turn) *
            0.6 *
            sensitivity *
            religiousChannel *
            (updated.religion[i] - s.religion[i]) +
          0.3 * (s.elites[i] - updated.elites[i]) +
          0.12 * (s.pressure[i] - updated.pressure[i]);
      }
    }
    if (policy !== 'greedyCrisis' && action.card === 'reform')
      delayed +=
        0.7 *
        Math.min(8, TOTAL_TURNS - s.turn) *
        (p.reformGain ?? 0.12) *
        world.n *
        0.018 *
        (1 - Math.min(1, s.reform / 0.6));
    const gain = base - risk + delayed;
    if (gain > bestGain + 1e-12) {
      bestGain = gain;
      best = action;
    }
  }
  return best;
}
