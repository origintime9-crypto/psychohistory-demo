import { stream } from './rng';
import { TOTAL_TURNS } from './params';

/** A separate exogenous stream keeps both reality draws and paired forecast draws aligned. */
export function muleTurn(seed: string, campaign = false): number {
  if (campaign) return 20 + stream(seed, 'unmodeled-mule-campaign-v1').int(3);
  return 6 + stream(seed, 'unmodeled-mule-v3').int(TOTAL_TURNS - 10);
}
