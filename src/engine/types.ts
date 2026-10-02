export type CardId = 'academy' | 'religion' | 'elites' | 'tax' | 'reform' | 'foundation' | 'noop';
export type Action = { card: CardId; target?: number };
export type Phase = 0 | 1 | 2 | 3;
export interface World {
  seed: string; n: number; x: Float64Array; y: Float64Array; distance: Float64Array;
  weights: Float64Array; neighbors: number[][]; edges: [number, number][];
  names: string[]; capital: number; terminus: number;
}
export interface State {
  turn: number; pressure: Float64Array; prosperity: Float64Array; elites: Float64Array;
  legitimacy: Float64Array; openness: Float64Array; faction: Float64Array;
  religion: Float64Array; education: Float64Array; garrison: Float64Array;
  phase: Uint8Array; sermons: Uint8Array;
  treasury: number; governance: number; tax: number; foundation: number; influence: number; reform: number;
}
export interface Event { sector: number; from: Phase; to: Phase }
export interface StepResult { state: State; events: Event[]; shock: number; reformFailed: boolean }
export interface ForecastPoint {
  mean: number; median: number; lo50: number; hi50: number; lo90: number; hi90: number;
}
export interface DesignStats { deff: number; effectiveN: number; rho: number; localCV: number; totalCV: number }
export interface ScalePoint { n: number; width: number; reference: number; plateau: number }
export interface ForecastResult {
  M: number; H: number; points: ForecastPoint[]; histogram: number[]; probabilities: number[];
  design: DesignStats; scale: ScalePoint[]; finalSamples: Uint8Array[];
}
export interface Comparison {
  meanDelta: number; standardError: number; finalDelta: number; foundationDelta: number;
}
export interface Observation { probability: number; outcome: number }
export interface Reveal {
  turn: number; actual: number; mean: number; lo90: number; hi90: number;
  percentile: number; pit: number; covered: boolean; pitCovered: boolean;
}
export interface HistoryPoint { turn: number; crisis: number; stable: number; independent: number; foundation: number }
export const ARRAY_KEYS = ['pressure', 'prosperity', 'elites', 'legitimacy', 'openness', 'faction', 'religion', 'education', 'garrison', 'phase', 'sermons'] as const;
export function cloneState(s: State): State {
  const copy = { ...s };
  for (const k of ARRAY_KEYS) (copy[k] as Float64Array | Uint8Array) = s[k].slice();
  return copy;
}
export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
/** Active crisis = unrest or rebellion. Independent sectors remain lost, but are no longer active crises. */
export function counts(s: State) {
  let stable = 0, unrest = 0, rebellion = 0, independent = 0;
  for (const v of s.phase) { if (v === 0) stable++; else if (v === 1) unrest++; else if (v === 2) rebellion++; else independent++; }
  return { stable, unrest, rebellion, independent, crisis: unrest + rebellion };
}
