import { step } from './dynamics';
import { DEFAULT_PARAMS, type Params } from './params';
import { Rng, stream } from './rng';
import { counts, type Action, type Comparison, type DesignStats, type ForecastPoint, type ForecastResult, type Reveal, type ScalePoint, type State, type World } from './types';
export interface ForecastOptions { M: number; H: number; seed: string | number; params?: Params; policy?: (world: World, state: State) => Action }
interface Rollout { totals: number[][]; first: Uint8Array[]; last: Uint8Array[]; foundation: number[] }
export interface ForecastBaseline { result: ForecastResult; rollout: Rollout }
export function quantile(sorted: number[], q: number): number { return sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1))))]; }
export function poissonBinomial(probs: ArrayLike<number>): number[] {
  const dist = new Array(probs.length + 1).fill(0) as number[]; dist[0] = 1;
  for (let i = 0; i < probs.length; i++) {
    const p = probs[i]; if (!Number.isFinite(p) || p < 0 || p > 1) throw new Error('概率须在 [0,1]');
    for (let k = i + 1; k >= 0; k--) dist[k] = (dist[k] ?? 0) * (1 - p) + (k > 0 ? dist[k - 1] * p : 0);
  }
  return dist;
}
function rollout(world: World, state: State, action: Action, options: ForecastOptions): Rollout {
  const { M, H } = options; if (!Number.isInteger(M) || M < 2 || M > 50000 || !Number.isInteger(H) || H < 1 || H > 18) throw new Error('预测采样数/时域无效');
  const totals: number[][] = Array.from({ length: H }, () => new Array(M));
  const first: Uint8Array[] = new Array(M), last: Uint8Array[] = new Array(M), foundation: number[] = new Array(M);
  for (let m = 0; m < M; m++) {
    const rng = stream(options.seed, `sample:${m}`); let s = state;
    for (let h = 0; h < H; h++) {
      const a = h === 0 ? action : options.policy?.(world, s) ?? { card: 'noop' };
      s = step(world, s, a, rng, options.params ?? DEFAULT_PARAMS).state;
      totals[h][m] = counts(s).crisis;
      if (h === 0) first[m] = Uint8Array.from(s.phase, v => v === 1 || v === 2 ? 1 : 0);
    }
    last[m] = Uint8Array.from(s.phase, v => v === 1 || v === 2 ? 1 : 0); foundation[m] = s.foundation;
  }
  return { totals, first, last, foundation };
}
export function designEffect(samples: ArrayLike<number>[]): DesignStats {
  const M = samples.length, n = samples[0]?.length ?? 0;
  if (M < 2 || n === 0) return { deff: 1, effectiveN: n, rho: 0, localCV: 0, totalCV: 0 };
  const means = new Float64Array(n), sums2 = new Float64Array(n); let totalMean = 0, total2 = 0;
  for (const row of samples) { let total = 0; for (let i = 0; i < n; i++) { means[i] += row[i]; sums2[i] += row[i] ** 2; total += row[i]; } totalMean += total; total2 += total * total; }
  totalMean /= M;
  let sumVar = 0, sumSD = 0, localCV = 0, localCount = 0;
  for (let i = 0; i < n; i++) {
    means[i] /= M; const variance = Math.max(0, (sums2[i] - M * means[i] ** 2) / (M - 1));
    sumVar += variance; sumSD += Math.sqrt(variance);
    if (means[i] > 0) { localCV += Math.sqrt(variance) / means[i]; localCount++; }
  }
  const totalVar = Math.max(0, (total2 - M * totalMean ** 2) / (M - 1));
  const deff = sumVar > 1e-12 ? totalVar / sumVar : 1;
  const denom = sumSD ** 2 - sumVar;
  const rho = denom > 1e-12 ? Math.max(-1, Math.min(1, (totalVar - sumVar) / denom)) : 0;
  return { deff, effectiveN: deff > 1e-12 ? n / deff : n, rho, localCV: localCount ? localCV / localCount : 0, totalCV: totalMean > 0 ? Math.sqrt(totalVar) / totalMean : 0 };
}
function scalePoints(samples: Uint8Array[], seed: string | number, design: DesignStats): ScalePoint[] {
  const n = samples[0].length, M = samples.length, rng = stream(seed, 'subsets');
  const sizes = [...new Set([1, 2, 5, 10, 20, 30, 50, n].filter(k => k <= n))].sort((a, b) => a - b);
  let variance = 0;
  for (let i = 0; i < n; i++) { let p = 0; for (const row of samples) p += row[i] / M; variance += p * (1 - p) / n; }
  return sizes.map(k => {
    let width = 0;
    for (let repeat = 0; repeat < 8; repeat++) {
      const ids = Array.from({ length: n }, (_, i) => i);
      for (let j = 0; j < k; j++) { const pick = j + rng.int(n - j); [ids[j], ids[pick]] = [ids[pick], ids[j]]; }
      const totals = samples.map(row => { let sum = 0; for (let j = 0; j < k; j++) sum += row[ids[j]]; return sum / k; }).sort((a, b) => a - b);
      width += (quantile(totals, 0.95) - quantile(totals, 0.05)) / 8;
    }
    return { n: k, width, reference: Math.min(1, 3.29 * Math.sqrt(variance / k)), plateau: Math.min(1, 3.29 * Math.sqrt(variance * Math.max(0, design.rho))) };
  });
}
function summarize(world: World, r: Rollout, options: ForecastOptions): ForecastResult {
  const points: ForecastPoint[] = r.totals.map(values => {
    const sorted = [...values].sort((a, b) => a - b);
    return { mean: values.reduce((a, b) => a + b, 0) / options.M, median: quantile(sorted, 0.5), lo50: quantile(sorted, 0.25), hi50: quantile(sorted, 0.75), lo90: quantile(sorted, 0.05), hi90: quantile(sorted, 0.95) };
  });
  const histogram: number[] = new Array(world.n + 1).fill(0); for (const k of r.totals[0]) histogram[k] += 1 / options.M;
  const probabilities = Array.from({ length: world.n }, (_, i) => r.first.reduce((sum, row) => sum + row[i], 0) / options.M);
  const design = designEffect(r.last);
  return { M: options.M, H: options.H, points, histogram, probabilities, design, scale: scalePoints(r.last, options.seed, design), finalSamples: r.last };
}
export function forecast(world: World, state: State, action: Action, options: ForecastOptions): ForecastResult { return summarize(world, rollout(world, state, action, options), options); }
export function prepareBaseline(world: World, state: State, options: ForecastOptions): ForecastBaseline {
  const samples = rollout(world, state, { card: 'noop' }, options); return { result: summarize(world, samples, options), rollout: samples };
}
export function previewAction(world: World, state: State, action: Action, options: ForecastOptions, cachedBaseline?: ForecastBaseline): { forecast: ForecastResult; comparison: Comparison } {
  const base = cachedBaseline?.rollout ?? rollout(world, state, { card: 'noop' }, options), candidate = rollout(world, state, action, options);
  const comparison = pairedComparison(base, candidate, options.M, options.H);
  return { forecast: summarize(world, candidate, options), comparison };
}
function pairedComparison(a: Rollout, b: Rollout, M: number, H: number): Comparison {
  const diffs = a.totals[0].map((v, i) => b.totals[0][i] - v); const meanDelta = diffs.reduce((s, v) => s + v, 0) / M;
  const variance = diffs.reduce((s, v) => s + (v - meanDelta) ** 2, 0) / (M - 1);
  return { meanDelta, standardError: Math.sqrt(variance / M), finalDelta: b.totals[H - 1].reduce((s, v, i) => s + v - a.totals[H - 1][i], 0) / M, foundationDelta: b.foundation.reduce((s, v, i) => s + v - a.foundation[i], 0) / M };
}
export function compareActions(world: World, state: State, a: Action, b: Action, options: ForecastOptions, paired = true): Comparison {
  return pairedComparison(rollout(world, state, a, options), rollout(world, state, b, paired ? options : { ...options, seed: `${options.seed}:independent` }), options.M, options.H);
}
export function revealForecast(result: ForecastResult, actual: number, turn: number, calibrationRng: Rng): Reveal {
  const p = result.points[0]; let below = 0;
  for (let k = 0; k < actual; k++) below += result.histogram[k] ?? 0;
  const mass = result.histogram[actual] ?? 0; const pit = Math.min(1, below + calibrationRng.uniform() * mass);
  return { turn, actual, mean: p.mean, lo90: p.lo90, hi90: p.hi90, percentile: below + mass / 2, pit, covered: actual >= p.lo90 && actual <= p.hi90, pitCovered: pit >= 0.05 && pit <= 0.95 };
}
