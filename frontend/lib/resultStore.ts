// Hands the prediction result from the form to the results page across a client-side
// navigation. We use sessionStorage (not a URL query) because the payload is a small
// object and, more importantly, we don't want a risk result sitting in browser history
// / shareable URLs — this is sensitive health data (CLAUDE.md §13.5).

import type { PatientFeatures, PredictResponse } from "./types";

const KEY = "heartlens.lastResult";

export interface StoredResult {
  features: PatientFeatures;
  response: PredictResponse;
  source: "manual" | "ocr";
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
