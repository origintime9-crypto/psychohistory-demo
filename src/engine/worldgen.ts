import { Delaunay } from 'd3-delaunay';
import { Rng, stream } from './rng';
import { clamp, type State, type World } from './types';
const NAMES = ['赫利孔', '安纳克里昂', '斯密尔诺', '科瑞尔', '卡尔甘', '奥罗拉', '达瑞尔', '山塔纳', '艾斯珀', '桑特', '新特兰托', '索拉利', '贝尔里奥', '西里斯', '塔泽达', '格莱恩', '锡纳克斯', '伊索斯', '斯特雷', '奥尼克斯'];
export function generateWorld(seed: string | number, { n }: { n: number }): World {
  if (!Number.isInteger(n) || n < 3 || n > 200) throw new Error('星区数量必须为 3–200 的整数');
  const rng = stream(seed, 'map'); const points: [number, number][] = [[0, 0]];
  const minDistance = 1.08 / Math.sqrt(n);
  for (let attempt = 0; points.length < n && attempt < 100000; attempt++) {
    const radius = Math.sqrt(rng.uniform()), angle = 2 * Math.PI * rng.uniform();
    const p: [number, number] = [radius * Math.cos(angle), radius * Math.sin(angle)];
    if (points.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) >= minDistance)) points.push(p);
  }
  if (points.length !== n) throw new Error('泊松盘采样失败，请更换种子');
  const x = Float64Array.from(points, p => p[0]), y = Float64Array.from(points, p => p[1]);
  const distance = Float64Array.from(points, p => Math.hypot(...p));
  const edges = new Set<string>(); const addEdge = (a: number, b: number) => { if (a !== b) edges.add(`${Math.min(a, b)},${Math.max(a, b)}`); };
  const delaunay = Delaunay.from(points); const cutoff = 3.2 / Math.sqrt(n);
  for (let i = 0; i < n; i++) for (const j of delaunay.neighbors(i)) if (Math.hypot(x[i] - x[j], y[i] - y[j]) <= cutoff) addEdge(i, j);
  // Euclidean MST via Prim. Union guarantees connectivity even after the distance cutoff.
  const joined = new Uint8Array(n); joined[0] = 1;
  const best = Float64Array.from(distance); const parent = new Int32Array(n);
  for (let k = 1; k < n; k++) {
    let next = -1, d = Infinity;
    for (let i = 1; i < n; i++) if (!joined[i] && best[i] < d) { d = best[i]; next = i; }
    joined[next] = 1; addEdge(next, parent[next]);
    for (let i = 1; i < n; i++) if (!joined[i]) { const d2 = Math.hypot(x[i] - x[next], y[i] - y[next]); if (d2 < best[i]) { best[i] = d2; parent[i] = next; } }
  }
  const pairs = [...edges].map(e => e.split(',').map(Number) as [number, number]);
  const neighbors: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of pairs) { neighbors[a].push(b); neighbors[b].push(a); }
  for (const row of neighbors) row.sort((a, b) => a - b);
  const weights = Float64Array.from({ length: n }, () => 0.7 + 0.6 * rng.uniform());
  const total = weights.reduce((a, b) => a + b, 0); for (let i = 0; i < n; i++) weights[i] /= total;
  const terminus = distance.indexOf(Math.max(...distance));
  const names = Array.from({ length: n }, (_, i) => i === 0 ? '川陀' : i === terminus ? '端点星' : `${NAMES[(i - 1) % NAMES.length]}${i > NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ''}`);
  return { seed: String(seed), n, x, y, distance, weights, edges: pairs, neighbors, names, capital: 0, terminus };
}
function beta(rng: Rng, a: number, b: number): number {
  let x = 0, y = 0;
  for (let i = 0; i < a; i++) x -= Math.log(Math.max(1e-12, rng.uniform()));
  for (let i = 0; i < b; i++) y -= Math.log(Math.max(1e-12, rng.uniform()));
  return x / (x + y);
}
export function initialState(world: World): State {
  const rng = stream(world.seed, 'initial'); const n = world.n;
  const array = () => new Float64Array(n);
  const s: State = { turn: 0, pressure: array(), prosperity: array(), elites: array(), legitimacy: array(), openness: array(), faction: array(), religion: array(), education: array(), garrison: array(), phase: new Uint8Array(n), sermons: new Uint8Array(n), treasury: 0.6, governance: 0.6, tax: 0.2, foundation: 0, influence: 4, reform: 0 };
  for (let i = 0; i < n; i++) {
    const d = world.distance[i]; s.pressure[i] = 0.7 + 0.2 * rng.uniform(); s.elites[i] = 0.4 + 0.2 * rng.uniform();
    s.prosperity[i] = clamp(0.85 - 0.24 * s.pressure[i] - 0.12 * d + 0.1 * rng.uniform());
    s.legitimacy[i] = clamp(0.84 - 0.35 * d + 0.05 * rng.uniform());
    const mix = rng.uniform(); s.openness[i] = mix < 0.6 ? beta(rng, 2, 8) : mix < 0.85 ? 0.4 + 0.2 * rng.uniform() : beta(rng, 8, 2);
    s.faction[i] = clamp(s.elites[i] + 0.1 * (rng.uniform() - 0.5)); s.garrison[i] = 0.08;
  }
  return s;
}
