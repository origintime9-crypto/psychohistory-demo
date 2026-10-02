/// <reference lib="webworker" />
import { prepareBaseline } from '../engine/forecast';
import {
  estimateCard,
  ForecastService,
  playableHand,
  requestOptions,
  type ForecastRequest,
} from './forecast.service';

const service = new ForecastService();
let handId = 0;
const latest = new Map<ForecastRequest['kind'], number>();
self.onmessage = async (event: MessageEvent<ForecastRequest>) => {
  const q = event.data,
    start = performance.now();
  if (q.session < service.session) return;
  service.session = q.session;
  latest.set(q.kind, q.id);
  // Coalesce already queued changes before spending time on a superseded forecast.
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (q.session !== service.session || latest.get(q.kind) !== q.id) return;
  try {
    if (q.kind !== 'hand') {
      const result = service.execute(q);
      if (result)
        self.postMessage({
          id: q.id,
          session: q.session,
          kind: q.kind,
          ...result,
          elapsedMs: performance.now() - start,
        });
      return;
    }
    handId = q.id;
    const baseline = prepareBaseline(q.world, q.state, requestOptions(q));
    for (const card of playableHand(q)) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (q.session < service.session || q.id !== handId || latest.get('hand') !== q.id) return;
      const result = estimateCard(q, card, baseline);
      self.postMessage({
        id: q.id,
        session: q.session,
        kind: q.kind,
        ...result,
        elapsedMs: performance.now() - start,
      });
    }
    if (q.session === service.session && q.id === handId)
      self.postMessage({ id: q.id, session: q.session, kind: q.kind, done: true });
  } catch (error) {
    self.postMessage({
      id: q.id,
      session: q.session,
      kind: q.kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
