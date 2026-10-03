export type LegacyCardId =
  'academy' | 'religion' | 'elites' | 'tax' | 'reform' | 'foundation' | 'noop';
export type CardId =
  LegacyCardId | 'relief' | 'convoy' | 'trade' | 'diplomacy' | 'intelligence' | 'evacuation';
export type StoryChoiceId = 'aid' | 'bargain' | 'defer';
export type Action = { card: CardId; target?: number; eventChoice?: StoryChoiceId };
export type Phase = 0 | 1 | 2 | 3;
export type LegacyField = 'diplomacy' | 'trade' | 'secrecy';
export interface ChronicleState {
  diplomacy: number;
  trade: number;
  secrecy: number;
  resolved: Record<
    string,
    { choice: StoryChoiceId; label: string; success: boolean; turn: number }
  >;
}
export interface World {
  layout?: 'atlas';
  seed: string;
  n: number;
  x: Float64Array;
  y: Float64Array;
  distance: Float64Array;
  weights: Float64Array;
  neighbors: number[][];
  edges: [number, number][];
  names: string[];
  capital: number;
  terminus: number;
}
export interface State {
  strategic?: StrategicState;
  turn: number;
  pressure: Float64Array;
  prosperity: Float64Array;
  elites: Float64Array;
  legitimacy: Float64Array;
  openness: Float64Array;
  faction: Float64Array;
  religion: Float64Array;
  education: Float64Array;
  garrison: Float64Array;
  phase: Uint8Array;
  sermons: Uint8Array;
  treasury: number;
  governance: number;
  tax: number;
  foundation: number;
  influence: number;
  reform: number;
  baseTax: number;
  taxReliefTurns: number;
  muleOccurred: boolean;
  lastStory: string | null;
  chronicle?: ChronicleState;
}
export const STRATEGIC_KEYS = ['supply', 'trade', 'intelligence', 'autonomy', 'fatigue'] as const;
export interface StrategicState {
  supply: Float64Array;
  trade: Float64Array;
  intelligence: Float64Array;
  autonomy: Float64Array;
  fatigue: Float64Array;
}
export interface Event {
  sector: number;
  from: Phase;
  to: Phase;
}
export interface StepResult {
  state: State;
  events: Event[];
  shock: number;
  reformFailed: boolean;
  muleEvent: boolean;
  impact?: State;
  story?: {
    id: string;
    title: string;
    target: number;
    choice: StoryChoiceId;
    label: string;
    success: boolean;
    text: string;
  };
}
export interface ForecastPoint {
  mean: number;
  median: number;
  lo50: number;
  hi50: number;
  lo90: number;
  hi90: number;
}
export interface DesignStats {
  deff: number;
  effectiveN: number;
  rho: number;
  localCV: number;
  totalCV: number;
}
export interface ScalePoint {
  n: number;
  width: number;
  reference: number;
  plateau: number;
}
export interface ForecastResult {
  M: number;
  H: number;
  points: ForecastPoint[];
  histogram: number[];
  probabilities: number[];
  design: DesignStats;
  scale: ScalePoint[];
  finalSamples: Uint8Array[];
  projection: {
    Q: number;
    S: number;
    F: number;
    treasury: number;
    darkness: number;
    complete: boolean;
    horizon: number;
  };
}
export interface Comparison {
  meanDelta: number;
  standardError: number;
  finalDelta: number;
  foundationDelta: number;
  scoreDelta: number;
  scoreStandardError: number;
  darknessDelta: number;
  stabilityDelta: number;
  treasuryDelta: number;
}
export interface CardEstimate {
  card: CardId;
  target?: number;
  comparison: Comparison;
  samples: number;
}
export interface TargetEffect {
  target: number;
  crisisDelta: number;
}
export interface Observation {
  probability: number;
  outcome: number;
}
export interface Reveal {
  turn: number;
  actual: number;
  mean: number;
  lo90: number;
  hi90: number;
  percentile: number;
  pit: number;
  covered: boolean;
  pitCovered: boolean;
}
export interface HistoryPoint {
  turn: number;
  crisis: number;
  stable: number;
  independent: number;
  foundation: number;
}
export const ARRAY_KEYS = [
  'pressure',
  'prosperity',
  'elites',
  'legitimacy',
  'openness',
  'faction',
  'religion',
  'education',
  'garrison',
  'phase',
  'sermons',
] as const;
export function cloneState(s: State): State {
  const copy = { ...s };
  if (s.strategic) {
    copy.strategic = { ...s.strategic };
    for (const k of STRATEGIC_KEYS) copy.strategic[k] = s.strategic[k].slice();
  }
  if (s.chronicle) copy.chronicle = { ...s.chronicle, resolved: { ...s.chronicle.resolved } };
  for (const k of ARRAY_KEYS) (copy[k] as Float64Array | Uint8Array) = s[k].slice();
  return copy;
}
export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
/** Active crisis = unrest or rebellion. Independent sectors remain lost, but are no longer active crises. */
export function counts(s: State) {
  let stable = 0,
    unrest = 0,
    rebellion = 0,
    independent = 0;
  for (const v of s.phase) {
    if (v === 0) stable++;
    else if (v === 1) unrest++;
    else if (v === 2) rebellion++;
    else independent++;
  }
  return { stable, unrest, rebellion, independent, crisis: unrest + rebellion };
}
