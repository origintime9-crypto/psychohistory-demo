import { useEffect, useRef, useState } from 'react';
import { CARDS } from '../engine/cards';
import { TOTAL_TURNS, type Params } from '../engine/params';
import type {
  Action,
  CardEstimate,
  CardId,
  Comparison,
  ForecastResult,
  HistoryPoint,
  State,
  TargetEffect,
  World,
} from '../engine/types';
import type { ForecastRequest, RequestKind } from '../worker/forecast.service';
import { ResponseGate } from './responseGate';

interface Result {
  id: number;
  session: number;
  kind: RequestKind;
  forecast?: ForecastResult;
  comparison?: Comparison;
  estimate?: CardEstimate;
  effects?: TargetEffect[];
  elapsedMs?: number;
  done?: boolean;
  error?: string;
}
interface View {
  baseline: ForecastResult | null;
  baselineSession: number;
  preview: ForecastResult | null;
  comparison: Comparison | null;
  contrast: ForecastResult | null;
  hand: Partial<Record<CardId, CardEstimate>>;
  targets: Partial<Record<CardId, TargetEffect[]>>;
  baselineBusy: boolean;
  previewBusy: boolean;
  contrastBusy: boolean;
  handBusy: boolean;
  error: string | null;
  handError: string | null;
  elapsed: number | null;
}
const emptyView = (): View => ({
  baseline: null,
  baselineSession: 0,
  preview: null,
  comparison: null,
  contrast: null,
  hand: {},
  targets: {},
  baselineBusy: false,
  previewBusy: false,
  contrastBusy: false,
  handBusy: false,
  error: null,
  handError: null,
  elapsed: null,
});
const ZERO: Comparison = {
  meanDelta: 0,
  standardError: 0,
  finalDelta: 0,
  foundationDelta: 0,
  scoreDelta: 0,
  scoreStandardError: 0,
  darknessDelta: 0,
  stabilityDelta: 0,
  treasuryDelta: 0,
};

export function useForecast(
  world: World | null,
  state: State | null,
  action: Action,
  params: Params,
  contrastParams: Params,
  history: HistoryPoint[],
) {
  const worker = useRef<Worker | null>(null);
  const gate = useRef(new ResponseGate());
  const ids = useRef({ next: 0, session: 0, baseline: 0 });
  const started = useRef(new Map<number, number>());
  const [view, setView] = useState<View>(emptyView);
  const send = (request: Omit<ForecastRequest, 'id' | 'session'>) => {
    const id = ++ids.current.next;
    gate.current.expect(request.kind, id);
    started.current.set(id, performance.now());
    worker.current?.postMessage({ ...request, id, session: ids.current.session });
    return id;
  };

  useEffect(() => {
    const w = new Worker(new URL('../worker/forecast.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.current = w;
    w.onmessage = (event: MessageEvent<Result>) => {
      const r = event.data;
      if (!gate.current.accepts(r)) {
        started.current.delete(r.id);
        return;
      }
      const elapsed = performance.now() - (started.current.get(r.id) ?? performance.now());
      if (r.done || r.kind !== 'hand' || r.error) started.current.delete(r.id);
      setView((previous) => {
        if (r.kind === 'hand')
          return {
            ...previous,
            ...(r.estimate
              ? {
                  hand: { ...previous.hand, [r.estimate.card]: r.estimate },
                  targets: { ...previous.targets, [r.estimate.card]: r.effects ?? [] },
                }
              : {}),
            handBusy: !r.done && !r.error,
            handError: r.error ?? previous.handError,
          };
        if (r.error)
          return {
            ...previous,
            error: r.error,
            baselineBusy: false,
            previewBusy: false,
            contrastBusy: false,
          };
        if (r.kind === 'baseline')
          return {
            ...previous,
            baseline: r.forecast!,
            baselineSession: r.session,
            baselineBusy: false,
          };
        if (r.kind === 'preview')
          return {
            ...previous,
            preview: r.forecast!,
            comparison: r.comparison!,
            previewBusy: false,
            elapsed,
          };
        return { ...previous, contrast: r.forecast!, contrastBusy: false };
      });
    };
    w.onerror = (e) =>
      setView((previous) => ({
        ...previous,
        error: e.message || '预测线程启动失败',
        baselineBusy: false,
        previewBusy: false,
        contrastBusy: false,
        handBusy: false,
      }));
    return () => {
      w.terminate();
      worker.current = null;
      started.current.clear();
    };
  }, []);

  useEffect(() => {
    ids.current.session++;
    gate.current.start(ids.current.session);
    started.current.clear();
    setView(emptyView());
    if (!world || !state || state.turn >= TOTAL_TURNS) return;
    setView((previous) => ({ ...previous, baselineBusy: true }));
    ids.current.baseline = send({
      kind: 'baseline',
      world,
      state,
      action: { card: 'noop', eventChoice: action.eventChoice },
      M: 96,
      H: Math.min(5, TOTAL_TURNS - state.turn),
      seed: `${world.seed}:prediction:${state.turn}`,
      params,
      history,
    });
  }, [world, state, params, history, action.eventChoice]);

  useEffect(() => {
    gate.current.expect('preview', ++ids.current.next);
    setView((previous) => ({
      ...previous,
      preview: null,
      comparison: null,
      error: null,
      elapsed: null,
      previewBusy: false,
    }));
    if (
      !world ||
      !state ||
      state.turn >= TOTAL_TURNS ||
      action.card === 'noop' ||
      (CARDS[action.card].targeted && action.target === undefined)
    )
      return;
    setView((previous) => ({ ...previous, previewBusy: true }));
    const timer = setTimeout(
      () =>
        send({
          kind: 'preview',
          baselineId: ids.current.baseline,
          world,
          state,
          action,
          M: 96,
          H: Math.min(5, TOTAL_TURNS - state.turn),
          seed: `${world.seed}:prediction:${state.turn}`,
          params,
          history,
        }),
      30,
    );
    return () => clearTimeout(timer);
  }, [world, state, action, params, history]);

  useEffect(() => {
    if (
      !view.baseline ||
      view.baselineSession !== ids.current.session ||
      !world ||
      !state ||
      state.turn >= TOTAL_TURNS
    )
      return;
    setView((previous) => ({ ...previous, handBusy: true }));
    send({
      kind: 'hand',
      world,
      state,
      action: { card: 'noop', eventChoice: action.eventChoice },
      M: 32,
      H: Math.min(5, TOTAL_TURNS - state.turn),
      seed: `${world.seed}:hand:${state.turn}`,
      params,
      history,
    });
  }, [view.baseline, world, state, params, history, action.eventChoice]);

  useEffect(() => {
    gate.current.expect('contrast', ++ids.current.next);
    setView((previous) => ({ ...previous, contrast: null, contrastBusy: false }));
    if (
      !world ||
      !state ||
      state.turn >= TOTAL_TURNS ||
      (contrastParams.contagion === params.contagion &&
        contrastParams.commonShock === params.commonShock &&
        contrastParams.fiscalFeedback === params.fiscalFeedback)
    )
      return;
    setView((previous) => ({ ...previous, contrastBusy: true }));
    send({
      kind: 'contrast',
      world,
      state,
      action: { card: 'noop' },
      M: 512,
      H: Math.min(5, TOTAL_TURNS - state.turn),
      seed: `${world.seed}:contrast:${state.turn}`,
      params: contrastParams,
      history,
    });
  }, [world, state, params, contrastParams, history, action.eventChoice]);

  return {
    ...view,
    active: action.card === 'noop' ? view.baseline : view.preview,
    comparison: action.card === 'noop' ? ZERO : view.comparison,
  };
}
