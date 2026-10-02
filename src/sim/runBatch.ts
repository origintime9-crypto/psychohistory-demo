import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { step } from '../engine/dynamics';
import { DEFAULT_PARAMS, TOTAL_TURNS } from '../engine/params';
import { stream } from '../engine/rng';
import { score } from '../engine/scoring';
import { counts, type CardId, type HistoryPoint } from '../engine/types';
import { generateWorld, initialState } from '../engine/worldgen';
import { chooseAction, POLICY_NAMES, type PolicyName } from './policies';
function argument(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`); return process.argv.find(v => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? (i >= 0 ? process.argv[i + 1] : fallback);
}
const policyArg = argument('policy', 'all'), games = Number(argument('games', '500')), n = Number(argument('n', '50'));
const seedPrefix = argument('seed-prefix', 'balance-v1');
if (!Number.isInteger(games) || games < 1 || games > 10000) throw new Error('games 必须为 1–10000 的整数');
if (policyArg !== 'all' && !POLICY_NAMES.includes(policyArg as PolicyName)) throw new Error(`未知策略 ${policyArg}`);
const policies = policyArg === 'all' ? [...POLICY_NAMES] : [policyArg as PolicyName];
const average = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const median = (a: number[]) => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
const start = performance.now(); const reports = [];
for (const policy of policies) {
  const outcomes = []; const use: Partial<Record<CardId, number>> = {}; const curve = new Array(TOTAL_TURNS).fill(0) as number[];
  for (let game = 0; game < games; game++) {
    const seed = `${seedPrefix}:${game}`, world = generateWorld(seed, { n }); let s = initialState(world);
    const reality = stream(seed, 'reality'), choice = stream(seed, `policy:${policy}`); const history: HistoryPoint[] = [];
    for (let turn = 0; turn < TOTAL_TURNS; turn++) {
      const action = chooseAction(policy, world, s, choice); use[action.card] = (use[action.card] ?? 0) + 1;
      s = step(world, s, action, reality).state; const c = counts(s); curve[turn] += c.crisis / n / games;
      history.push({ turn: s.turn, crisis: c.crisis, stable: c.stable / n, independent: c.independent / n, foundation: s.foundation });
    }
    const c = counts(s); outcomes.push({ seed, ...score(s.foundation, history), independent: c.independent / n, treasury: s.treasury });
  }
  const q = outcomes.map(o => o.Q), meanQ = average(q), sdQ = Math.sqrt(average(q.map(v => (v - meanQ) ** 2)));
  const report = { policy, games, meanQ, medianQ: median(q), sdQ, medianF: median(outcomes.map(o => o.F)), medianS: median(outcomes.map(o => o.S)), medianIndependent: median(outcomes.map(o => o.independent)), fractionQ80: q.filter(v => v >= 0.8).length / games, crisisPeakTurn: curve.indexOf(Math.max(...curve)) + 1, crisisCurve: curve, cardUsage: Object.fromEntries(Object.entries(use).map(([k, v]) => [k, v! / (games * TOTAL_TURNS)])), outcomes };
  reports.push(report); console.log(JSON.stringify({ ...report, outcomes: undefined, crisisCurve: undefined }));
}
await mkdir('reports', { recursive: true });
const result = { generatedAt: new Date().toISOString(), seedProtocol: `${seedPrefix}:0…; same worlds/reality tapes across policies`, params: DEFAULT_PARAMS, n, elapsedSeconds: (performance.now() - start) / 1000, reports };
await writeFile(`reports/balance-${policyArg}-${games}.json`, JSON.stringify(result, null, 2));
const random = reports.find(r => r.policy === 'random'), greedy = reports.find(r => r.policy === 'greedyScore');
if (random && greedy) console.log(`Skill gap / random SD: ${((greedy.meanQ - random.meanQ) / random.sdQ).toFixed(3)}`);
console.log(`Saved reports/balance-${policyArg}-${games}.json (${result.elapsedSeconds.toFixed(1)} s)`);
