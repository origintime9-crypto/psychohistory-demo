import { step } from '../engine/dynamics';
import { DEFAULT_PARAMS } from '../engine/params';
import { stream } from '../engine/rng';
import { counts, type HistoryPoint } from '../engine/types';
import { generateWorld, initialState } from '../engine/worldgen';

export const CARD_CONTEXTS = ['natural-turn-4', 'fiscal-buffer', 'elite-competition'] as const;
export type CardContext = (typeof CARD_CONTEXTS)[number];

/** Predeclared synthetic situations; interventions do not get to inspect future reality draws. */
export function cardContext(seed: string, context: CardContext, n = 50) {
  const world = generateWorld(seed, { n }),
    reality = stream(seed, 'reality');
  let state = initialState(world);
  const history: HistoryPoint[] = [];
  for (let turn = 0; turn < 4; turn++) {
    state = step(world, state, { card: 'noop' }, reality).state;
    const c = counts(state);
    history.push({
      turn: state.turn,
      stable: c.stable / n,
      crisis: c.crisis,
      independent: c.independent / n,
      foundation: state.foundation,
    });
  }
  state.influence = 8;
  if (context === 'fiscal-buffer') {
    state.treasury = 0.98;
    for (let i = 0; i < n; i++)
      if (state.phase[i] !== 3) state.legitimacy[i] = Math.min(state.legitimacy[i], 0.45);
  }
  if (context === 'elite-competition') {
    state.treasury = 0.9;
    for (let i = 0; i < n; i++)
      if (state.phase[i] !== 3) {
        state.elites[i] = 0.82;
        state.faction[i] = 0.8;
        state.openness[i] = 0.5;
      }
  }
  return { world, state, history, params: { ...DEFAULT_PARAMS, mule: false } };
}
