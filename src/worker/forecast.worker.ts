/// <reference lib="webworker" />
import { forecast, prepareBaseline, previewAction, type ForecastBaseline } from '../engine/forecast';
import { DEFAULT_PARAMS, type Params } from '../engine/params';
import type { Action, State, World } from '../engine/types';
export interface ForecastRequest { id: number; baselineId?: number; kind: 'baseline' | 'preview' | 'contrast'; world: World; state: State; action: Action; M: number; H: number; seed: string; params?: Params }
let cache: { id: number; baseline: ForecastBaseline } | null = null;
self.onmessage = (event: MessageEvent<ForecastRequest>) => {
  const q = event.data; const start = performance.now();
  try {
    const options = { M: q.M, H: q.H, seed: q.seed, params: q.params ?? DEFAULT_PARAMS };
    let result;
    if (q.kind === 'baseline') { const baseline = prepareBaseline(q.world, q.state, options); cache = { id: q.id, baseline }; result = { forecast: baseline.result }; }
    else if (q.kind === 'preview') result = previewAction(q.world, q.state, q.action, options, cache && cache.id === q.baselineId ? cache.baseline : undefined);
    else result = { forecast: forecast(q.world, q.state, q.action, options) };
    self.postMessage({ id: q.id, kind: q.kind, ...result, elapsedMs: performance.now() - start });
  } catch (error) { self.postMessage({ id: q.id, kind: q.kind, error: error instanceof Error ? error.message : String(error) }); }
};
