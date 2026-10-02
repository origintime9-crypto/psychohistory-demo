import { clamp, type HistoryPoint } from './types';
export function score(
  foundation: number,
  history: Pick<HistoryPoint, 'stable'>[],
): { Q: number; F: number; F_eff: number; S: number; darkness: number } {
  const last = history.slice(-3);
  const S = last.length ? last.reduce((s, h) => s + h.stable, 0) / last.length : 0;
  const F = clamp(foundation),
    F_eff = 0.1 + 0.9 * F,
    Q = Math.sqrt(F_eff * clamp(S));
  return { Q, F, F_eff, S, darkness: Math.round(30000 * 30 ** -Q) };
}
