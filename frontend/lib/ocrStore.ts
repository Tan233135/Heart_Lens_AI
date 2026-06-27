// Hands the OCR result from the upload screen to the manual form, which acts as the
// confirm/complete step (CLAUDE.md §2). sessionStorage (not a URL) keeps the extracted
// health data out of history. The /check page CONSUMES this (reads then clears) so a later
// plain manual visit isn't polluted by a stale scan.

import type { PredictFromImageResponse } from "./types";

const KEY = "heartlens.ocr";

export function saveOcr(r: PredictFromImageResponse): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* storage disabled — caller still navigates; form just shows an empty manual entry */
  }
}

export function loadOcr(): PredictFromImageResponse | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PredictFromImageResponse) : null;
  } catch {
    return null;
  }
}

export function clearOcr(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* no-op */
  }
}
