import { clamp, type HistoryPoint } from './types';
export function score(foundation: number, history: Pick<HistoryPoint, 'stable'>[]): { Q: number; F: number; S: number; darkness: number } {
  const last = history.slice(-3); const S = last.length ? last.reduce((s, h) => s + h.stable, 0) / last.length : 0;
  const F = clamp(foundation), Q = Math.sqrt(F * clamp(S));
  return { Q, F, S, darkness: Math.round(30000 * 30 ** (-Q)) };
}
