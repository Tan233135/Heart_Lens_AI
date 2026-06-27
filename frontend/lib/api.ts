// Thin API client for the HeartLens FastAPI backend.
// Reads the backend base URL from NEXT_PUBLIC_API_URL (CLAUDE.md §10).
//
// NEXT_PUBLIC_* vars are inlined at build time and safe to read on the client.

import type {
  DoctorsResponse,
  GuidedPredictRequest,
  GuidedPredictResponse,
  HealthResponse,
  PredictFromImageResponse,
  PredictRequest,
  PredictResponse,
} from "./types";

// NEXT_PUBLIC_* is inlined at BUILD time, not read at runtime. If it wasn't set when the
// frontend was built, `RAW_BASE` is undefined — and we must NOT silently fall back to
// localhost in a deployed build, because that points every user's browser at its own machine
// and makes every API call fail with a confusing generic error (the #1 Railway deploy bug,
// DEPLOY.md §6). Fall back to localhost ONLY in development; in production surface the
// misconfiguration loudly so it's diagnosable instead of looking like a backend outage.
const RAW_BASE = process.env.NEXT_PUBLIC_API_URL;
if (!RAW_BASE && process.env.NODE_ENV === "production" && typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.error(
    "[HeartLens] NEXT_PUBLIC_API_URL was not set at build time — every API call will fail. " +
      "Set it on the frontend service and REDEPLOY/REBUILD the frontend (DEPLOY.md §1).",
  );
}
// Trailing slash trimmed so we can safely template `${BASE}/path`.
const BASE = (RAW_BASE ?? "http://localhost:8000").replace(/\/+$/, "");

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

// Predict from the low-literacy guided wizard (CLAUDE.md §1). Sends height/weight (BMI is
// derived server-side) and null for any "don't know" answer, plus the unknown-field list.
export async function predictGuided(
  body: GuidedPredictRequest,
  signal?: AbortSignal,
): Promise<GuidedPredictResponse> {
  const res = await fetch(`${BASE}/predict-guided`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  return parseJson<GuidedPredictResponse>(res);
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

// Search the doctor directory (CLAUDE.md §13.6). `q` matches name/specialty/location in
// either language; both args are optional (no args returns the full active list).
export async function getDoctors(
  params: { q?: string; specialty?: string; location?: string } = {},
  signal?: AbortSignal,
): Promise<DoctorsResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.specialty) qs.set("specialty", params.specialty);
  if (params.location) qs.set("location", params.location);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(`${BASE}/doctors${suffix}`, { signal });
  return parseJson<DoctorsResponse>(res);
}
