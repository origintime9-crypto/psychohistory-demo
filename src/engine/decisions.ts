import { applyAction, CARDS } from './cards';
import { ambiguity, neighborhood, onsetProbability, transitionProbabilities } from './hazard';
import type { Params } from './params';
import type { Action, CardId, State, TargetEffect, World } from './types';

export function expectedOutcomes(world: World, state: State, params: Params) {
  let crisis = 0,
    stable = 0,
    lost = 0;
  for (let i = 0; i < world.n; i++) {
    const p = transitionProbabilities(world, state, i, 0, params);
    stable += p[0];
    crisis += p[1] + p[2];
    lost += p[3];
  }
  return { crisis, stable, lost };
}

/** A conditional zero-shock estimate for heatmaps, not a terminal Monte Carlo forecast. */
export function targetEffects(
  world: World,
  state: State,
  card: CardId,
  params: Params,
): (TargetEffect & { rank: number })[] {
  if (!CARDS[card].targeted) return [];
  const base = expectedOutcomes(world, state, params);
  return Array.from({ length: world.n }, (_, target) => target)
    .filter((i) => state.phase[i] !== 3)
    .map((target) => {
      const next = applyAction(world, state, { card, target }, 0, params).state;
      const expected = expectedOutcomes(world, next, params);
      let delayed = 0;
      for (const i of [target, ...world.neighbors[target]]) {
        if (state.phase[i] === 3) continue;
        const onset = onsetProbability(
          state,
          i,
          neighborhood(world, state, i, params)[0],
          0,
          params,
        );
        const sensitivity =
          state.phase[i] === 0 ? -Math.log1p(-Math.min(0.999, onset)) * (1 - onset) : 0.2;
        const channel =
          params.legitimacy * params.religionLegitimacy +
          params.mixedFaction * ambiguity(state.openness[i]) * params.religionFaction;
        delayed +=
          sensitivity * channel * (next.religion[i] - state.religion[i]) +
          0.25 * (state.elites[i] - next.elites[i]) +
          0.12 * (state.pressure[i] - next.pressure[i]);
        if (params.strategic && state.strategic && next.strategic)
          delayed +=
            0.18 * (next.strategic.trade[i] - state.strategic.trade[i]) +
            0.14 * (next.strategic.supply[i] - state.strategic.supply[i]) +
            0.16 * (next.strategic.intelligence[i] - state.strategic.intelligence[i]) +
            0.12 * (next.strategic.autonomy[i] - state.strategic.autonomy[i]);
      }
      return {
        target,
        crisisDelta: expected.crisis - base.crisis,
        rank: expected.stable - base.stable - 0.3 * (expected.lost - base.lost) + delayed,
      };
    });
}

export function shortlistTargets(
  world: World,
  state: State,
  card: CardId,
  params: Params,
  limit = 3,
): Action[] {
  return targetEffects(world, state, card, params)
    .sort((a, b) => b.rank - a.rank || a.target - b.target)
    .slice(0, limit)
    .map((e) => ({ card, target: e.target }));
}
