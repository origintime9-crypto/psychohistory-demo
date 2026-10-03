import { createHash } from 'node:crypto';
import { LEGACY_CARDS } from '../../src/engine/cards';
import { step } from '../../src/engine/dynamics';
import { DEFAULT_PARAMS, MODEL_VERSION, TOTAL_TURNS } from '../../src/engine/params';
import { stream } from '../../src/engine/rng';
import { score } from '../../src/engine/scoring';
import { counts, type Action, type HistoryPoint } from '../../src/engine/types';
import { generateWorld, initialState } from '../../src/engine/worldgen';
import { chooseAction } from '../../src/sim/policies';

export function goldenSnapshot() {
  const seed = 'golden-v3-fixed-seed',
    n = 50,
    params = { ...DEFAULT_PARAMS, mule: true };
  const world = generateWorld(seed, { n }),
    reality = stream(seed, 'reality'),
    choice = stream(seed, 'policy:random');
  let state = initialState(world);
  const actions: Action[] = [],
    history: HistoryPoint[] = [];
  for (let turn = 0; turn < TOTAL_TURNS; turn++) {
    const action = chooseAction('random', world, state, choice, params);
    actions.push(action);
    state = step(world, state, action, reality, params).state;
    const c = counts(state);
    history.push({
      turn: state.turn,
      stable: c.stable / n,
      independent: c.independent / n,
      crisis: c.crisis,
      foundation: state.foundation,
    });
  }
  const hash = (value: unknown) =>
    createHash('sha256')
      .update(
        JSON.stringify(value, (_, v) =>
          typeof v === 'number' && !Number.isInteger(v) ? Number(v.toFixed(8)) : v,
        ),
      )
      .digest('hex');
  return {
    model: MODEL_VERSION,
    seed,
    sectors: n,
    parameterSha256: hash({
      model: MODEL_VERSION,
      totalTurns: TOTAL_TURNS,
      protocol: 'story-v3/fixed-5+9N',
      params,
      cards: LEGACY_CARDS,
    }),
    stateAndHistorySha256: hash({ world, state, history, actions }),
    result: score(state.foundation, history),
    actions,
  };
}
