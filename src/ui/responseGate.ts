import type { RequestKind } from '../worker/forecast.service';

/** A new game/turn rejects old successes AND old errors, independently in each channel. */
export class ResponseGate {
  private session = 0;
  private latest = new Map<RequestKind, number>();
  start(session: number) {
    this.session = session;
    this.latest.clear();
  }
  expect(kind: RequestKind, id: number) {
    this.latest.set(kind, id);
  }
  accepts(message: { session: number; kind: RequestKind; id: number }): boolean {
    return message.session === this.session && message.id === this.latest.get(message.kind);
  }
}
