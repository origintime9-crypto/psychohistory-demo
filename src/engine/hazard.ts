import type { Params } from './params';
import type { State, World } from './types';
export const ambiguity = (openness: number) => 4 * openness * (1 - openness);
export function neighborhood(world: World, s: State, i: number, p: Params): [number, number] {
  if (!p.contagion) return [0, 0]; let crisis = 0, independent = 0;
  for (const j of world.neighbors[i]) { if (s.phase[j] === 1 || s.phase[j] === 2) crisis++; if (s.phase[j] === 3) independent++; }
  const len = world.neighbors[i].length; return [crisis / len, independent / len];
}
export function onsetProbability(s: State, i: number, neighborFraction: number, shock: number, p: Params): number {
  const a = ambiguity(s.openness[i]);
  const eta = p.beta0 + p.poverty * (1 - s.prosperity[i]) + p.mixed * a + p.mixedFaction * a * s.faction[i] + p.neighbor * neighborFraction - p.legitimacy * (s.legitimacy[i] - 0.5) + p.deficit * (1 - s.treasury) + shock;
  return -Math.expm1(-10 * Math.exp(eta));
}
export function competingProbabilities(rates: number[]): number[] {
  const total = rates.reduce((a, b) => a + b, 0);
  if (total <= 0) return [...rates.map(() => 0), 1];
  const exit = -Math.expm1(-10 * total); return [...rates.map(v => exit * v / total), Math.exp(-10 * total)];
}
/** Vector of probabilities for destinations [stable, unrest, rebellion, independent]. */
export function transitionProbabilities(world: World, s: State, i: number, shock: number, p: Params): [number, number, number, number] {
  const phase = s.phase[i]; if (phase === 3) return [0, 0, 0, 1];
  const [c, cIN] = neighborhood(world, s, i, p);
  if (phase === 0) { const onset = onsetProbability(s, i, c, shock, p); return [1 - onset, onset, 0, 0]; }
  const geff = s.governance * Math.exp(-world.distance[i] / 0.8);
  if (phase === 1) {
    const calm = Math.exp(p.calm0 + 1.5 * s.legitimacy[i] + geff + 0.8 * s.prosperity[i] - s.faction[i]);
    const escalate = Math.exp(p.escalation0 + 2 * s.elites[i] + c - geff - 1.5 * s.legitimacy[i] + shock);
    const [a, b, remain] = competingProbabilities([calm, escalate]); return [a, remain, b, 0];
  }
  const suppress = Math.exp(p.suppression0 + 1.5 * geff + s.treasury + s.garrison[i]);
  const secede = Math.exp(p.secession0 + cIN - 1.2 * geff - s.legitimacy[i] + shock);
  const [a, b, remain] = competingProbabilities([suppress, secede]); return [0, a, remain, b];
}
