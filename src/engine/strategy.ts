import { clamp, type State, type World, type StrategicState } from './types';

export function initialStrategy(world: World): StrategicState {
  return {
    supply: Float64Array.from(world.distance, (d) => clamp(0.62 - 0.18 * d)),
    trade: Float64Array.from(world.distance, (d) => clamp(0.16 - 0.06 * d)),
    intelligence: new Float64Array(world.n),
    autonomy: new Float64Array(world.n),
    fatigue: new Float64Array(world.n),
  };
}

export function routeTo(world: World, s: State, target: number, source = world.capital): number[] {
  if (s.phase[source] === 3 || s.phase[target] === 3) return [];
  const distance = new Float64Array(world.n).fill(Infinity);
  const parent = new Int32Array(world.n).fill(-1);
  const visited = new Uint8Array(world.n);
  distance[source] = 0;
  for (let k = 0; k < world.n; k++) {
    let i = -1;
    for (let j = 0; j < world.n; j++)
      if (!visited[j] && Number.isFinite(distance[j]) && (i < 0 || distance[j] < distance[i]))
        i = j;
    if (i < 0 || i === target) break;
    visited[i] = 1;
    for (const j of world.neighbors[i]) {
      if (s.phase[j] === 3) continue;
      const length = Math.hypot(world.x[i] - world.x[j], world.y[i] - world.y[j]);
      const cost = ((0.1 + length) * (1 + s.phase[j] * 1.1)) / (1 + (s.strategic?.supply[j] ?? 0));
      if (distance[i] + cost < distance[j]) {
        distance[j] = distance[i] + cost;
        parent[j] = i;
      }
    }
  }
  if (!Number.isFinite(distance[target])) return [];
  const path = [target];
  while (path[0] !== source) path.unshift(parent[path[0]]);
  return path;
}

/** Bounded two-hop transmission; independent worlds cannot relay an intervention. */
export function impactTargets(world: World, s: State, target: number): [number, number][] {
  if (!s.strategic)
    return [[target, 1], ...world.neighbors[target].map((i): [number, number] => [i, 0.5])];
  const weights = new Map<number, number>([[target, 1]]);
  const link = (a: number, b: number) => {
    if (s.phase[a] === 3 || s.phase[b] === 3) return 0;
    const length = Math.hypot(world.x[a] - world.x[b], world.y[a] - world.y[b]);
    const network = 0.27 + 0.18 * s.strategic!.supply[a] + 0.12 * s.strategic!.trade[a];
    return Math.min(0.5, network * Math.exp(-1.7 * length) * (s.phase[a] === 2 ? 0.35 : 1));
  };
  for (const j of world.neighbors[target]) {
    const first = link(target, j);
    if (!first) continue;
    weights.set(j, Math.max(weights.get(j) ?? 0, first));
    for (const k of world.neighbors[j]) {
      const second = first * link(j, k) * 0.55;
      if (second >= 0.015) weights.set(k, Math.max(weights.get(k) ?? 0, second));
    }
  }
  return [...weights].sort((a, b) => a[0] - b[0]);
}

export function strategicProtection(s: State, i: number): number {
  const a = s.strategic;
  return a ? 0.7 * (a.supply[i] - 0.5) + 0.5 * a.trade[i] + 0.55 * a.intelligence[i] : 0;
}

/** Simultaneous conservative supply exchange and decaying long-lived investments. */
export function advanceStrategy(world: World, s: State): void {
  const a = s.strategic;
  if (!a) return;
  const nextSupply = a.supply.slice();
  for (let i = 0; i < world.n; i++) {
    if (s.phase[i] === 3) continue;
    let flow = 0;
    for (const j of world.neighbors[i]) {
      if (s.phase[j] === 3) continue;
      const throughput = s.phase[i] === 2 || s.phase[j] === 2 ? 0.25 : 1;
      flow +=
        ((a.supply[j] - a.supply[i]) * throughput) /
        Math.max(world.neighbors[i].length, world.neighbors[j].length);
    }
    const production = 0.5 + 0.15 * s.prosperity[i] + 0.12 * a.trade[i] - 0.12 * s.phase[i];
    nextSupply[i] = clamp(a.supply[i] + 0.2 * flow + 0.12 * (production - a.supply[i]));
    a.trade[i] *= s.phase[i] === 2 ? 0.86 : 0.97;
    a.intelligence[i] *= 0.9;
    a.autonomy[i] *= 0.94;
    a.fatigue[i] *= 0.65;
  }
  a.supply = nextSupply;
}
