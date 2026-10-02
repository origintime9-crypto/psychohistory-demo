import { mkdir, writeFile } from 'node:fs/promises';
import { step } from '../engine/dynamics';
import { DEFAULT_PARAMS, TOTAL_TURNS, type Params } from '../engine/params';
import { stream } from '../engine/rng';
import { score } from '../engine/scoring';
import { counts, type HistoryPoint } from '../engine/types';
import { generateWorld, initialState } from '../engine/worldgen';
import { chooseAction, type PolicyName } from './policies';
const worlds = Array.from({ length: 40 }, (_, i) => generateWorld(`tune-v1:${i}`, { n: 50 }));
const median = (a: number[]) => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
function evaluate(p: Params, policy: PolicyName) {
  const qs: number[] = [],
    independent: number[] = [],
    stable: number[] = [],
    curve = new Array(TOTAL_TURNS).fill(0) as number[];
  for (const world of worlds) {
    let s = initialState(world);
    const rng = stream(world.seed, 'reality'),
      choice = stream(world.seed, `policy:${policy}`),
      history: HistoryPoint[] = [];
    for (let t = 0; t < TOTAL_TURNS; t++) {
      s = step(world, s, chooseAction(policy, world, s, choice, p), rng, p).state;
      const c = counts(s);
      curve[t] += c.crisis;
      history.push({
        turn: t + 1,
        stable: c.stable / world.n,
        crisis: c.crisis,
        independent: c.independent / world.n,
        foundation: s.foundation,
      });
    }
    qs.push(score(s.foundation, history).Q);
    independent.push(counts(s).independent / world.n);
    stable.push(history.slice(-3).reduce((sum, h) => sum + h.stable / 3, 0));
  }
  return {
    medianQ: median(qs),
    medianIndependent: median(independent),
    medianS: median(stable),
    peak: curve.indexOf(Math.max(...curve)) + 1,
  };
}
const candidates = [];
for (const expense of [0.058, 0.064, 0.07])
  for (const secession0 of [-2.3, -1.8, -1.3])
    for (const beta0 of [-6.7, -6.5, -6.3]) {
      const p = { ...DEFAULT_PARAMS, expense, secession0, beta0 };
      const noop = evaluate(p, 'noop');
      const penalty =
        Math.abs(noop.medianIndependent - 0.475) +
        (noop.peak > 12 ? 0.01 * (noop.peak - 12) : 0) +
        Math.max(0, 0.28 - noop.medianS);
      candidates.push({ p, noop, penalty });
    }
candidates.sort((a, b) => a.penalty - b.penalty);
const finalists = candidates.slice(0, 10).map((c) => ({
  ...c,
  greedyScore: evaluate(c.p, 'greedyScore'),
  random: evaluate(c.p, 'random'),
  foundationOnly: evaluate(c.p, 'foundationOnly'),
}));
await mkdir('reports', { recursive: true });
await writeFile(
  'reports/calibration-search-2.json',
  JSON.stringify(
    { seedProtocol: 'tune-v1:0…39; disjoint from 500-game validation', candidates, finalists },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    finalists.map((c) => ({
      params: { beta0: c.p.beta0, expense: c.p.expense, secession0: c.p.secession0 },
      noop: c.noop,
      greedyScore: c.greedyScore,
      random: c.random,
      foundationOnly: c.foundationOnly,
    })),
    null,
    2,
  ),
);
