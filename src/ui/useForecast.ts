import { useEffect, useRef, useState } from 'react';
import type { Action, Comparison, ForecastResult, State, World } from '../engine/types';
import type { Params } from '../engine/params';
type Result = { id: number; kind: 'baseline' | 'preview' | 'contrast'; forecast?: ForecastResult; comparison?: Comparison; elapsedMs: number; error?: string };
export function useForecast(world: World | null, state: State | null, action: Action, params: Params, contrastParams: Params) {
  const worker = useRef<Worker | null>(null); const ids = useRef({ baseline: 0, preview: 0, contrast: 0 }); const sequence = useRef(0); const started = useRef(new Map<number, number>());
  const [baseline, setBaseline] = useState<ForecastResult | null>(null), [preview, setPreview] = useState<ForecastResult | null>(null), [comparison, setComparison] = useState<Comparison | null>(null);
  const [contrast, setContrast] = useState<ForecastResult | null>(null), [contrastBusy, setContrastBusy] = useState(false);
  const [baselineBusy, setBaselineBusy] = useState(false), [previewBusy, setPreviewBusy] = useState(false), [error, setError] = useState<string | null>(null), [elapsed, setElapsed] = useState<number | null>(null);
  useEffect(() => {
    const w = new Worker(new URL('../worker/forecast.worker.ts', import.meta.url), { type: 'module' }); worker.current = w;
    w.onmessage = (event: MessageEvent<Result>) => {
      const r = event.data; if (r.id !== ids.current[r.kind]) return;
      if (r.kind === 'baseline') setBaselineBusy(false); else if (r.kind === 'preview') setPreviewBusy(false); else setContrastBusy(false);
      if (r.error) { setError(r.error); return; }
      if (r.kind === 'baseline') setBaseline(r.forecast!);
      if (r.kind === 'preview') { setPreview(r.forecast!); setComparison(r.comparison!); setElapsed(performance.now() - (started.current.get(r.id) ?? performance.now())); }
      if (r.kind === 'contrast') setContrast(r.forecast!);
      started.current.delete(r.id);
    };
    w.onerror = e => { setError(e.message || '预测线程启动失败'); setBaselineBusy(false); setPreviewBusy(false); setContrastBusy(false); };
    return () => { w.terminate(); worker.current = null; };
  }, []);
  useEffect(() => {
    setBaseline(null); setPreview(null); setComparison(null); setError(null); setElapsed(null); setContrast(null);
    ids.current.preview = ++sequence.current;
    if (!world || !state || state.turn >= 18) { setBaselineBusy(false); return; }
    const id = ++sequence.current; ids.current.baseline = id; setBaselineBusy(true);
    worker.current?.postMessage({ id, kind: 'baseline', world, state, action: { card: 'noop' }, M: 256, H: Math.min(5, 18 - state.turn), seed: `${world.seed}:prediction:${state.turn}`, params });
  }, [world, state, params]);
  useEffect(() => {
    ids.current.preview = ++sequence.current; setPreview(null); setComparison(null); setError(null); setElapsed(null);
    if (!world || !state || state.turn >= 18 || action.card === 'noop' || (['academy', 'religion', 'elites'].includes(action.card) && action.target === undefined)) { setPreviewBusy(false); return; }
    setPreviewBusy(true);
    const timer = setTimeout(() => {
      const id = ++sequence.current; ids.current.preview = id; started.current.set(id, performance.now());
      worker.current?.postMessage({ id, baselineId: ids.current.baseline, kind: 'preview', world, state, action, M: 256, H: Math.min(5, 18 - state.turn), seed: `${world.seed}:prediction:${state.turn}`, params });
    }, 80);
    return () => clearTimeout(timer);
  }, [world, state, action, params]);
  useEffect(() => {
    ids.current.contrast = ++sequence.current; setContrast(null);
    if (!world || !state || state.turn >= 18 || (contrastParams.contagion === params.contagion && contrastParams.commonShock === params.commonShock && contrastParams.fiscalFeedback === params.fiscalFeedback)) { setContrastBusy(false); return; }
    setContrastBusy(true); const id = ++sequence.current; ids.current.contrast = id;
    worker.current?.postMessage({ id, kind: 'contrast', world, state, action: { card: 'noop' }, M: 512, H: Math.min(5, 18 - state.turn), seed: `${world.seed}:contrast:${state.turn}`, params: contrastParams });
  }, [world, state, params, contrastParams]);
  return { baseline, active: action.card === 'noop' ? baseline : preview, comparison: action.card === 'noop' ? { meanDelta: 0, standardError: 0, finalDelta: 0, foundationDelta: 0 } : comparison, baselineBusy, previewBusy, contrast, contrastBusy, error, elapsed };
}
