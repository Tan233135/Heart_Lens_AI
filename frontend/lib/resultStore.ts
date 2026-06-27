// Hands the prediction result from the form to the results page across a client-side
// navigation. We use sessionStorage (not a URL query) because the payload is a small
// object and, more importantly, we don't want a risk result sitting in browser history
// / shareable URLs — this is sensitive health data (CLAUDE.md §13.5).

import type { Confidence, PredictResponse } from "./types";

const KEY = "heartlens.lastResult";

export interface StoredResult {
  // The 15 features actually shown to the model. Values may be `null` where the user said
  // "don't know" and the pipeline imputed them — we keep that honest (never a fabricated value).
  features: Record<string, number | null>;
  response: PredictResponse;
  source: "manual" | "ocr" | "guided";
  // How much real clinical data backs the estimate (CLAUDE.md §6). Drives how the results page
  // presents the number: "full" shows everything, "rough" shows only a coarse category.
  confidence?: Confidence;
  // Which features the user left unknown (sent as null), so the result can name what was missing.
  unknownFields?: string[];
  // True when the estimate is low-confidence / built from partial data (confidence === "rough").
  // Drives the dedicated `result_rough` audio clip and "approximate" framing (CLAUDE.md §2, §6).
  rough?: boolean;
  at: number;
}

export function saveResult(r: Omit<StoredResult, "at">): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...r, at: Date.now() }));
  } catch {
    /* storage disabled — caller still navigates; results page will show a fallback */
  }
}

export function loadResult(): StoredResult | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredResult) : null;
  } catch {
    return null;
  }
}

export function clearResult(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* no-op */
  }
}
