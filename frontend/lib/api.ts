// Thin API client for the HeartLens FastAPI backend.
// Reads the backend base URL from NEXT_PUBLIC_API_URL (CLAUDE.md §10).
//
// NEXT_PUBLIC_* vars are inlined at build time and safe to read on the client.

import type {
  HealthResponse,
  PredictFromImageResponse,
  PredictRequest,
  PredictResponse,
} from "./types";

// Trailing slash trimmed so we can safely template `${BASE}/path`.
const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // Surface FastAPI's error detail when present, else a generic message.
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.detail ? JSON.stringify(body.detail) : detail;
    } catch {
      /* non-JSON error body — keep statusText */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export const apiBaseUrl = BASE;

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const res = await fetch(`${BASE}/health`, { signal });
  return parseJson<HealthResponse>(res);
}

// Predict from the 15 manually-entered features (the safe baseline path, CLAUDE.md §13).
export async function predict(
  body: PredictRequest,
  signal?: AbortSignal,
): Promise<PredictResponse> {
  const res = await fetch(`${BASE}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  return parseJson<PredictResponse>(res);
}

// Predict from an uploaded report image (OCR flow). The caller MUST honor
// `fall_back_to_manual` / a null `prediction` per the §2 safety rules.
export async function predictFromImage(
  file: File,
  model?: string,
  signal?: AbortSignal,
): Promise<PredictFromImageResponse> {
  const form = new FormData();
  form.append("file", file);
  const qs = model ? `?model=${encodeURIComponent(model)}` : "";
  const res = await fetch(`${BASE}/predict-from-image${qs}`, {
    method: "POST",
    body: form,
    signal,
  });
  return parseJson<PredictFromImageResponse>(res);
}
