// Risk band boundaries for the RESULTS view.
//
// IMPORTANT — single source of truth: the AUTHORITATIVE screening threshold lives in the
// BACKEND (backend/prediction.py, env HIGH_RISK_THRESHOLD / MODERATE_RISK_THRESHOLD,
// recall-favoring defaults 0.30 / 0.15). The backend returns the chosen `risk_category`
// AND the `high_risk_threshold` it used on every prediction, so the actual classification
// can never silently drift between services (CLAUDE.md §2 — deliberate, documented threshold).
//
// These FRONTEND env vars only configure how the results VISUALIZATION draws its band
// zones (the band indicator + people-grid framing). They default to the backend's values
// and, where possible, defer to the threshold the backend actually reported. Tune later
// via NEXT_PUBLIC_HIGH_RISK_THRESHOLD / NEXT_PUBLIC_MODERATE_RISK_THRESHOLD.

import type { PredictResponse, RiskCategory } from "./types";

// Recall-favoring defaults suitable for screening (catch at-risk people), per CLAUDE.md §2/§6.
// Low cutoffs on purpose: the model was trained with class re-balancing and is NOT yet
// calibration-verified, so its probabilities likely overstate risk — we'd rather over-flag.
const DEFAULT_HIGH = 0.3;
const DEFAULT_MODERATE = 0.15;

function envNum(raw: string | undefined, fallback: number): number {
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const HIGH_RISK_THRESHOLD = envNum(
  process.env.NEXT_PUBLIC_HIGH_RISK_THRESHOLD,
  DEFAULT_HIGH,
);
export const MODERATE_RISK_THRESHOLD = envNum(
  process.env.NEXT_PUBLIC_MODERATE_RISK_THRESHOLD,
  DEFAULT_MODERATE,
);

export interface RiskBands {
  high: number;
  moderate: number;
}

// Prefer the threshold the backend actually used (sent in the response) so the drawn bands
// match the real decision; fall back to the env-configured value otherwise.
export function resolveBands(
  response?: Pick<PredictResponse, "high_risk_threshold"> | null,
): RiskBands {
  const high =
    response && Number.isFinite(response.high_risk_threshold)
      ? response.high_risk_threshold
      : HIGH_RISK_THRESHOLD;
  // The moderate boundary must sit below high; clamp if misconfigured.
  const moderate = Math.min(MODERATE_RISK_THRESHOLD, high);
  return { high, moderate };
}

export const RISK_ORDER: RiskCategory[] = ["low", "moderate", "high"];

export function categoryFromProbability(p: number, bands: RiskBands): RiskCategory {
  if (p >= bands.high) return "high";
  if (p >= bands.moderate) return "moderate";
  return "low";
}
