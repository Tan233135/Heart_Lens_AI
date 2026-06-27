# HeartLens — Railway deployment guide

End-to-end deploy of HeartLens to Railway: an existing **Postgres** service, a **backend**
(FastAPI + EasyOCR), and a **frontend** (Next.js). Read alongside CLAUDE.md §9 (deployment) and
§10 (env vars).

> **Who does what:** the repo is fully prepared (Dockerfile, pinned deps, migrations, seed,
> CORS-from-env, startup dep-check). The actual *deploy* — creating services, setting variables,
> and clicking Deploy — must be done by **you** in your Railway account; an assistant cannot
> authenticate to or click inside your Railway dashboard.

---

## 0. Environment lessons baked into the repo (do NOT regress)

These were costly to fix locally and are now enforced in code so a fresh build can't undo them:

| Lesson | Where it's enforced |
|---|---|
| Python **3.12** (PyTorch has no 3.14 wheel) | `backend/Dockerfile` (`FROM python:3.12-slim`); `backend/runtime.txt` |
| **CPU-only** torch (`torch==2.5.1+cpu`, `torchvision==0.20.1+cpu`) | `backend/requirements.txt` `--extra-index-url .../whl/cpu` |
| numpy held at **1.26.4** (easyocr/opencv need <2) | `backend/requirements.txt` |
| Verified pins: scikit-learn 1.6.1, easyocr 1.7.2, xgboost 3.2.0 | `backend/requirements.txt` (xgboost matches `model_metadata.json`) |
| Loud startup confirmation that `import easyocr, torch` works | `backend/main.py` → logs `OCR deps OK — … (torch=…, cuda_build=None, easyocr=…)` |
| EasyOCR `Reader(['en','bn'])` built **once** (singleton) | `backend/ocr.py` `get_reader()` / `warm_up_ocr()` |
| EasyOCR weights **baked into the image** (ephemeral FS) | `backend/Dockerfile` `RUN python -c "import easyocr; easyocr.Reader(['en','bn'],gpu=False)"` |

> ⚠️ The pins `torch==2.12.1+cpu` / `torchvision==0.27.1+cpu` / `numpy==2.5.0` mentioned during
> planning **do not exist** and would fail `pip install`. The versions above are the
> locally-verified, known-good set — keep them.

---

## 1. Environment variables (CLAUDE.md §10)

| Variable | Service | Value |
|---|---|---|
| `DATABASE_URL` | **backend** | `${{Postgres.DATABASE_URL}}` ← service reference, NOT a hardcoded URL |
| `FRONTEND_URL` | **backend** | the frontend's public Railway URL, e.g. `https://heartlens-frontend.up.railway.app` (used for CORS) |
| `DEFAULT_MODEL` | **backend** | `logistic_regression` |
| `HIGH_RISK_THRESHOLD` | **backend** | `0.30` (deliberate, recall-favoring; see CLAUDE.md §2/§6) |
| `MODERATE_RISK_THRESHOLD` | **backend** | `0.15` (optional; backend has a default) |
| `OCR_EAGER_INIT` | **backend** | `0` (default, recommended on the trial tier — lazy-load the Reader so a startup OOM can't take down the safe manual path). Set `1` only with >1 GB headroom. See §5. |
| `NEXT_PUBLIC_API_URL` | **frontend** | the backend's public Railway URL, e.g. `https://heartlens-backend.up.railway.app` |
| `NEXT_PUBLIC_HIGH_RISK_THRESHOLD` | **frontend** | `0.30` (keep in sync with backend) |
| `NEXT_PUBLIC_MODERATE_RISK_THRESHOLD` | **frontend** | `0.15` |

> **`NEXT_PUBLIC_*` are inlined at BUILD time.** Set `NEXT_PUBLIC_API_URL` on the frontend service
> *before* it builds; if you change it later you must **redeploy** the frontend for it to take effect.

---

## 2. Deploy steps (Railway dashboard)

**A. Backend service**
1. Project → **New → GitHub Repo** → select this repo. Set the service **Root Directory = `backend`**.
2. Railway detects `backend/Dockerfile` and builds from it (pins Python 3.12 + CPU torch + bakes OCR weights).
3. Service → **Variables**: add `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `FRONTEND_URL` (fill after step C),
   `DEFAULT_MODEL=logistic_regression`, `HIGH_RISK_THRESHOLD=0.30`. Leave `OCR_EAGER_INIT` unset (defaults to
   `0`/lazy on the trial tier so a Reader OOM at boot can't crash-loop the backend and take down the safe
   manual path); set `OCR_EAGER_INIT=1` only after upgrading past the ~1 GB trial ceiling.
4. **Settings → Networking → Generate Domain** to get the public backend URL. Note it.
5. The container `CMD` runs `alembic upgrade head && python seed_doctors.py && uvicorn …` — migrations
   and the 18-row doctor seed apply automatically on first boot (both idempotent).

**B. Confirm Step 1 (DB connected)** — in the backend **Deploy Logs** you should see:
   `Running upgrade -> 0001 … 0002 … 0003`, `Seeded 18 doctors.`, and
   `OCR deps OK — import easyocr, torch succeeded (torch=2.5.1+cpu, cuda_build=None …)`.
   Then `GET /health` on the backend URL returns `{"db_enabled": true}` — that is the live DB write/read proof.

**C. Frontend service**
1. **New → GitHub Repo** → same repo, **Root Directory = `frontend`**. Railway/Nixpacks auto-detects Next.js
   (`npm install` → `npm run build` → `npm start`). `public/audio/*.mp3` ship with the build automatically.
2. Service → **Variables**: `NEXT_PUBLIC_API_URL=<backend public URL from A.4>`,
   `NEXT_PUBLIC_HIGH_RISK_THRESHOLD=0.30`, `NEXT_PUBLIC_MODERATE_RISK_THRESHOLD=0.15`. **Deploy.**
3. **Generate Domain** for the frontend. Copy that URL into the **backend's** `FRONTEND_URL` var (step A.3)
   and **redeploy the backend** so CORS allows the frontend origin.

**D. Redeploy** after any variable change: service → **⋯ → Redeploy** (frontend must rebuild for `NEXT_PUBLIC_*`).

---

## 3. End-to-end verification (Step 6)

On the **frontend** URL:
1. **Manual flow first** (no torch dependency — the safe path): home → "Enter details by hand" →
   wizard → result. Must work even if OCR is unavailable.
2. **Image flow**: upload a clear report → backend logs show real extracted fields → results;
   a blank/sparse image → falls back to the wizard. (Watch backend memory here — see §5.)
3. **Doctor directory**: from a high-risk result tap "Find a doctor" → lands on `/doctors?specialty=Cardiologist`
   pre-filtered to cardiologists; specialty + area chips filter live.
4. **Audio**: welcome (home) and result (results) narration in Bangla/English from `public/audio`.

---

## 4. Migrations & seed

Run automatically by the container `CMD` on each boot (idempotent). To run manually instead, use a
Railway one-off shell on the backend service: `alembic upgrade head` then `python seed_doctors.py`.
Migrations: `0001` assessments, `0002` doctors, `0003` doctor hospital columns.

---

## 5. Memory (Step 7) — the trial-tier risk

Measured locally (RSS of the uvicorn process):

| State | RSS |
|---|---|
| Backend up, torch imported, **no Reader yet** | **~546 MB** |
| After building the en+bn Reader + one OCR pass | **~980 MB** |

**~980 MB sits right at Railway's ~1 GB trial ceiling.** Image upload can OOM the backend on the
trial tier. Mitigations, in order:
- **Manual-entry flow needs no Reader** and stays well under the cap — it is the reliable demo path
  and the app's designated safe path (CLAUDE.md §2). Lead demos with it.
- Set `OCR_EAGER_INIT=0` so the Reader is built lazily on the first image rather than at startup —
  keeps idle RSS ~546 MB; the spike only happens when someone actually uploads.
- For reliable OCR, **upgrade off the trial** (the EasyOCR+torch stack genuinely wants >1 GB headroom),
  or split OCR into its own service so the web service stays light.
- OCR is also **slow** on CPU for dense reports (~40 s for a full-page lab table locally) — expect
  similar on Railway; the frontend already shows a "reading…" state.

---

## 6. Likely-to-fail-on-trial checklist

- **Backend OOM during OCR** (see §5) — most likely failure. Manual flow unaffected.
- **Docker image is large** (CPU torch + baked weights ≈ 2–3 GB) — build can be slow; usually fine.
- **`NEXT_PUBLIC_API_URL` not set before frontend build** → frontend calls `localhost:8000` and all
  API calls fail. Set it, then redeploy.
- **`FRONTEND_URL` not set / stale on backend** → CORS blocks the browser. Set to the exact frontend
  origin (no trailing slash) and redeploy the backend.
- **First OCR after a cold start** is still slower than warm (model load), but weights are baked so it
  does NOT re-download.
