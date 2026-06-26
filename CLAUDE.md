# CLAUDE.md — HeartLens

> Project context for Claude Code. Read this fully before writing any code.
> This is a **medical screening tool for vulnerable users**. The safety rules in
> this file are not optional polish — they are the core requirement.

---

## 1. What this project is

**HeartLens** is an AI-powered web application that helps **rural, low-literacy users in
Bangladesh** understand their medical test reports and get a 10-year heart-disease (CHD)
risk estimate.

A typical user flow:
1. User uploads a photo of a paper medical report (lab values).
2. OCR extracts the clinical values from the image.
3. A trained ML model produces a 10-year CHD risk estimate from those values.
4. The result is shown in an **accessible, low-literacy-friendly** way:
   - color-coded risk cards (not dense text),
   - a people-grid visualization (e.g. "X out of 100 people like you"),
   - **Bangla audio** narration of the result.
5. The user is guided toward seeing a real doctor (doctor directory feature).

Built by: Tanvir, Ishtiak, Zakaria.

The audience is the single most important design constraint. Many users cannot read fluently,
may not read English, and may be making real health decisions based on what this app shows them.
Every design and engineering decision flows from that.

---

## 2. CRITICAL SAFETY REQUIREMENTS (non-negotiable)

These are hard rules. Do not violate them, do not "simplify" them away, and flag it explicitly
if a requested feature would conflict with one.

- **MUST NOT silently substitute "normal" values when OCR fails or is incomplete.**
  This is the single most dangerous failure mode for this app. If OCR cannot extract a value,
  the system must **surface that clearly** and fall back to a manual entry form — never quietly
  fill in clinically normal defaults and then present a confident "low risk" result. A high-risk
  patient being told they are fine because OCR failed is the exact outcome we are preventing.

- **MUST validate that OCR actually extracted real data before trusting a prediction.**
  The model pipeline includes a median imputer (see §4). That imputer will happily fill *every*
  missing field with a training-set median and produce a plausible-looking risk score from an
  essentially empty input. Imputing *one* missing field is fine. Imputing *everything* because
  OCR returned nothing is a silent failure. The backend must require a minimum set of
  successfully-extracted real values; otherwise route the user to the manual form.

- **MUST present results as a screening estimate, not a diagnosis.**
  This is not a diagnostic tool and must never claim to be. Every result must make clear, in
  plain language and in Bangla, that it is an estimate and not a medical diagnosis, and must
  encourage consulting a qualified doctor — especially for elevated risk.

- **MUST communicate uncertainty honestly.** The model's real-world performance is modest
  (see §6). Do not present false precision. Prefer risk *categories* (low / moderate / high)
  with clear hedging over a single scary decimal percentage presented as fact, unless and until
  calibration has been verified (see §6).

- **MUST show a medical disclaimer** on every results view, in both the primary UI language and
  Bangla.

- **The "high risk" decision threshold MUST be set deliberately, not left at 0.5.**
  For a screening tool, recall (catching at-risk people) matters more than overall accuracy.
  Document whatever threshold is chosen and why. Do not hardcode 0.5 by default without a note.

---

## 3. Tech stack

- **Backend:** FastAPI (Python)
- **Frontend:** Next.js (React)
- **Database:** PostgreSQL (Railway provides a managed Postgres instance)
- **OCR:** EasyOCR (must be initialized for **both English and Bangla**, see §8)
- **ML:** scikit-learn pipelines + XGBoost (pre-trained, see §4)
- **Deployment:** Railway (separate services for frontend, backend, and DB; see §9)

---

## 4. The trained ML models

Two pre-trained models are provided as serialized pipelines. **Do not retrain them in the app.**
They were trained in a separate Colab notebook on the Framingham Heart Study dataset with a
leak-free pipeline (train/test split before any imputation, scaling, or resampling).

Files (place in the backend, e.g. `backend/models/`):
- `logistic_regression_pipeline.pkl` — **recommended default** (best recall + AUC, see §6)
- `xgboost_pipeline.pkl`
- `model_metadata.json` — contains the exact feature column order and recorded test metrics

**Each .pkl is a full `sklearn.Pipeline`, not a bare model.** Each contains:
`SimpleImputer(strategy="median")` → `StandardScaler` → classifier.

This is intentional: the backend sends **raw feature values** and the pipeline does imputation
and scaling internally. **Do not reimplement preprocessing in the backend.** If preprocessing
logic lived separately and drifted out of sync with what the model was trained on, predictions
would be silently wrong.

### Version pinning (important — mismatches can silently corrupt results)

The pipelines were pickled under specific library versions. Loading them under different versions
produces an `InconsistentVersionWarning` and, per scikit-learn's own docs, *can* yield invalid
results rather than just a warning. Pin these in the backend `requirements.txt`:

```
scikit-learn==1.6.1
xgboost==<FILL IN — run `import xgboost; print(xgboost.__version__)` in the Colab notebook>
joblib>=1.3
```

Also confirm the Python version matches Colab's (currently Python 3.12) and pin it for Railway
(e.g. a `runtime.txt` / Nixpacks config). If you cannot match a version exactly, the safest fix
is to re-export the pipelines from the notebook under the versions the server will actually run.

### Loading and predicting (the pattern to follow)

```python
import joblib, json
import pandas as pd

# Load ONCE at startup, never per-request.
with open("models/model_metadata.json") as f:
    METADATA = json.load(f)
FEATURE_COLUMNS = METADATA["feature_columns"]   # exact order — see §5

LOGREG = joblib.load("models/logistic_regression_pipeline.pkl")
XGB    = joblib.load("models/xgboost_pipeline.pkl")

def predict_risk(features: dict, model: str = "logistic_regression") -> float:
    # `features` keys must match FEATURE_COLUMNS. Missing *individual* fields may be
    # None (the imputer handles them) — but see the OCR safety rule in §2 first.
    row = pd.DataFrame([features])[FEATURE_COLUMNS]   # enforce exact column order
    pipe = LOGREG if model == "logistic_regression" else XGB
    return float(pipe.predict_proba(row)[0, 1])       # P(10-year CHD)
```

---

## 5. Feature schema (the 15 model inputs)

The model expects exactly these 15 features, **in this order**:

`male, age, education, currentSmoker, cigsPerDay, BPMeds, prevalentStroke, prevalentHyp,
diabetes, totChol, sysBP, diaBP, BMI, heartRate, glucose`

| Feature | Type | Unit / Encoding | Notes |
|---|---|---|---|
| `male` | int | 1 = male, 0 = female | |
| `age` | int | years | training range ~32–70 |
| `education` | int | 1–4 (ordinal) | 1 = least, 4 = most |
| `currentSmoker` | int | 1 = yes, 0 = no | |
| `cigsPerDay` | float | cigarettes/day | 0 if non-smoker |
| `BPMeds` | int | 1 = on BP medication, 0 = not | |
| `prevalentStroke` | int | 1 = yes, 0 = no | history of stroke |
| `prevalentHyp` | int | 1 = yes, 0 = no | hypertensive |
| `diabetes` | int | 1 = yes, 0 = no | |
| `totChol` | float | mg/dL | total cholesterol |
| `sysBP` | float | mmHg | systolic blood pressure |
| `diaBP` | float | mmHg | diastolic blood pressure |
| `BMI` | float | kg/m² | |
| `heartRate` | float | bpm | |
| `glucose` | float | mg/dL | |

Target (for reference only — not an input): `TenYearCHD` (1 = 10-year CHD risk event, 0 = not).

**Units matter.** OCR-extracted lab values must be normalized to these units before being sent
to the model (e.g. cholesterol and glucose in mg/dL, not mmol/L). Misread units = wrong risk.
Build explicit unit handling/validation into the extraction step.

---

## 6. Model performance (be honest about this)

Real, leak-free test-set results (20% held-out, stratified):

| Model | Accuracy | Precision | Recall | F1 | ROC-AUC |
|---|---|---|---|---|---|
| **Logistic Regression** | 0.672 | 0.254 | **0.597** | 0.356 | **0.700** |
| XGBoost | 0.741 | 0.231 | 0.302 | 0.262 | 0.614 |

**Use Logistic Regression as the default.** It has both the higher AUC and—more importantly for
a screening tool—roughly double the recall, meaning it catches far more genuinely at-risk people.
The higher "accuracy" models from the original comparison achieved that mainly by predicting
"no risk" for almost everyone, which is useless for screening.

These numbers are **modest** — appropriate for low-stakes triage and awareness, not for anything
resembling diagnosis. The UI must reflect that humility (see §2).

**Calibration is not yet verified.** AUC measures *ranking*, not whether a displayed "30% risk"
actually corresponds to a 30% real-world frequency. Because the model was trained with class
re-balancing, the raw probabilities may overstate true risk. Until a calibration curve confirms
the probabilities are trustworthy, prefer showing risk **categories** over precise percentages,
and treat the people-grid ("X out of 100") visualization with caution — it implies a calibrated
probability the model may not actually have. Consider applying probability calibration
(Platt scaling / isotonic) with prevalence-adjusted priors as a follow-up.

---

## 7. Backend (FastAPI) requirements

- Load both model pipelines and `model_metadata.json` **once at startup** (module-level or a
  startup event), never on each request.
- Provide a prediction endpoint that accepts the 15 features (or accepts an uploaded report
  image and runs the OCR → extract → predict flow).
- Return: the risk probability, a derived risk category, the model used, and — critically — a
  field indicating **whether OCR succeeded** and which fields were extracted vs missing, so the
  frontend can honor the safety rules in §2.
- Configure **CORS** to allow the Next.js frontend's Railway domain (frontend and backend will be
  on different origins).
- Validate and range-check incoming feature values (reject impossible values like negative age or
  a BMI of 900 — likely OCR errors).
- Run OCR **once per request** (a known prior inefficiency was calling it redundantly).

---

## 8. OCR handling (EasyOCR)

- **Initialize EasyOCR for both languages: `easyocr.Reader(['en', 'bn'])`.** A prior version
  initialized English-only despite Bangla detection logic existing — medical reports here may be
  in either or both scripts.
- Initialize the reader **once** and reuse it (it is expensive to construct, and re-creating it
  per request is both slow and a memory problem — see §9).
- On extraction failure or low confidence: **do not fabricate values.** Return a clear failure
  signal and let the frontend show the manual entry fallback form (see §2).
- Map extracted text to the §5 schema with explicit, auditable parsing — including unit handling.

---

## 9. Deployment (Railway)

Set up three Railway services:
1. **Backend** (FastAPI) — start command roughly:
   `uvicorn main:app --host 0.0.0.0 --port $PORT`
   (Railway injects `$PORT`; do not hardcode a port.)
2. **Frontend** (Next.js) — `npm run build` then `npm start`, or rely on Nixpacks auto-detection.
   The frontend needs the backend's public URL as an env var (see §10).
3. **PostgreSQL** — use Railway's managed Postgres; it exposes a `DATABASE_URL`.

### ⚠️ Memory is the likely deployment blocker

EasyOCR pulls in PyTorch, and PyTorch + two ML models + the OCR language models can easily exceed
the memory available on a small/free Railway plan. Plan for this up front:
- Use **CPU-only PyTorch** (the `+cpu` wheels) to cut size substantially.
- Lazy-load / single-instance the OCR reader; never per-request.
- If memory is still tight, consider splitting OCR into its own service, or using a lighter OCR
  path. Budget for a paid plan if the free tier can't hold the OCR stack.

---

## 10. Environment variables

Define these (Railway dashboard for production, `.env` for local — never commit `.env`):

- `DATABASE_URL` — provided by Railway's Postgres service.
- `FRONTEND_URL` — the deployed Next.js URL, used for backend CORS config.
- `NEXT_PUBLIC_API_URL` — the deployed FastAPI URL, used by the frontend to call the backend.
- `DEFAULT_MODEL` — e.g. `logistic_regression` (the recommended default).
- `HIGH_RISK_THRESHOLD` — the deliberately-chosen decision threshold (see §2); do not bury 0.5
  in code.

---

## 11. Suggested project structure

```
heartlens/
├── CLAUDE.md                      # this file
├── backend/
│   ├── main.py                    # FastAPI app + routes
│   ├── models/
│   │   ├── logistic_regression_pipeline.pkl
│   │   ├── xgboost_pipeline.pkl
│   │   └── model_metadata.json
│   ├── ocr.py                     # EasyOCR init (['en','bn']) + extraction
│   ├── prediction.py              # load pipelines, predict_risk()
│   ├── schemas.py                 # request/response models (Pydantic)
│   ├── db.py                      # Postgres connection / ORM
│   ├── requirements.txt           # PINNED versions (see §4)
│   └── runtime.txt                # Python version pin
└── frontend/
    ├── (Next.js app)
    └── .env.local                 # NEXT_PUBLIC_API_URL (not committed)
```

---

## 12. Local development commands

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

---

## 13. Build priorities (suggested order)

1. Backend prediction endpoint loading the pinned pipelines (§4, §7) — get a known-good feature
   dict returning a sensible probability first.
2. Manual entry form on the frontend (the safe baseline path that doesn't depend on OCR).
3. Accessible results UI: color cards, people-grid (with the calibration caveat from §6), Bangla
   audio, and the mandatory disclaimer (§2).
4. OCR upload flow (§8) **with the failure → manual-form fallback wired in from the start** — not
   bolted on later.
5. Database (store/retrieve as needed; no PHI beyond what's necessary, and treat health data
   carefully).
6. Doctor directory feature.
7. Railway deployment (§9) once it runs end-to-end locally.

> Re-read §2 before shipping. If anything in the build would cause the app to show a confident
> result on failed/empty OCR input, stop and fix that first.
