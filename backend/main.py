"""HeartLens FastAPI app (CLAUDE.md §7).

This module wires the prediction core (prediction.py) to HTTP. Models are loaded once,
at import of `prediction`, never per request. OCR is not part of this milestone — this is
the safe manual-feature prediction baseline (CLAUDE.md §13, step 1).
"""

from __future__ import annotations

import logging
import os
import sys
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from db import (
    db_enabled,
    get_recent_assessments,
    get_session,
    save_assessment,
    search_doctors,
)
from ocr import extract_from_image, warm_up_ocr
from prediction import (
    DEFAULT_MODEL,
    FEATURE_COLUMNS,
    HIGH_RISK_THRESHOLD,
    categorize_risk,
    confidence_from_missing,
    predict_risk,
)
from schemas import (
    DoctorsResponse,
    GuidedPredictResponse,
    HistoryResponse,
    PredictFromImageResponse,
    PredictRequest,
    PredictResponse,
    WizardPredictRequest,
)

load_dotenv()


# --- Logging (CLAUDE.md §8 — the OCR pipeline must be auditable) --------------------------
# Configure the "heartlens" logger namespace with its own stdout handler so our INFO lines
# always reach the server log regardless of uvicorn's own logging config. Children
# ("heartlens.ocr", "heartlens.api") inherit this handler.
def _configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s"))
    hl = logging.getLogger("heartlens")
    hl.setLevel(logging.INFO)
    hl.handlers.clear()
    hl.addHandler(handler)
    hl.propagate = False  # don't double-log via the root logger


_configure_logging()
logger = logging.getLogger("heartlens.api")


# --- OCR safety gate (CLAUDE.md §2) ------------------------------------------------------
# The model pipeline's median imputer will happily fill EVERY missing field and produce a
# confident-looking score from an essentially empty input. That is the exact silent failure
# §2 forbids. So we require a minimum number of REAL extracted values before we trust a
# prediction; below it, we return a failure signal and route the user to manual entry.
# Imputing a FEW missing fields is fine (§4); imputing almost everything is not.
MIN_OCR_FIELDS = int(os.getenv("MIN_OCR_FIELDS", "6"))

app = FastAPI(
    title="HeartLens API",
    description="10-year CHD risk SCREENING estimate (not a diagnosis). See CLAUDE.md §2.",
    version="0.1.0",
)

# CORS — frontend and backend are on different origins (CLAUDE.md §7, §10). Read the allowed
# origin from FRONTEND_URL; fall back to localhost:3000 for local dev.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _verify_ocr_deps_on_startup() -> None:
    """LOUDLY confirm the heavy OCR deps imported (CLAUDE.md §9 — the likely deploy blocker).

    A fresh Railway build is exactly where a wrong Python version or a failed CPU-torch install
    resurfaces. We import easyocr + torch up front and log the resolved versions + whether this
    is a CPU build, so a broken install is a loud line in the STARTUP log — never a silent failure
    discovered only on the first upload. Importing does NOT build the Reader (that is warm_up_ocr).
    """
    try:
        import torch  # noqa: PLC0415
        import easyocr  # noqa: PLC0415

        logger.info(
            "Startup: OCR deps OK — `import easyocr, torch` succeeded "
            "(torch=%s, cuda_build=%s, easyocr=%s).",
            torch.__version__, torch.version.cuda, easyocr.__version__,
        )
        if torch.version.cuda is not None:
            logger.warning(
                "Startup: torch reports a CUDA build (cuda=%s) — on Railway (no GPU) you want the "
                "CPU wheel (torch==2.5.1+cpu). Check requirements.txt pulls from the CPU index.",
                torch.version.cuda,
            )
    except Exception:
        logger.exception(
            "Startup: OCR deps FAILED to import (`import easyocr, torch`). The OCR stack is not "
            "installed correctly — likely a Python-version or CPU-torch install problem "
            "(CLAUDE.md §9). The manual-entry path still works; image upload will not."
        )


@app.on_event("startup")
def _warm_up_ocr_on_startup() -> None:
    """Initialize the OCR engine at startup and LOG success/failure (CLAUDE.md §8).

    Default is eager so an engine-init problem (e.g. EasyOCR/PyTorch not installed, or a model
    download failure — CLAUDE.md §9) shows up in the STARTUP log instead of silently waiting to
    explode on the first upload. Set OCR_EAGER_INIT=0 to keep the original lazy behaviour.
    """
    if os.getenv("OCR_EAGER_INIT", "1") == "1":
        logger.info("Startup: warming up OCR engine (OCR_EAGER_INIT=1)…")
        warm_up_ocr()
    else:
        logger.info("Startup: OCR_EAGER_INIT=0 — OCR engine will initialize lazily on first image.")


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "default_model": DEFAULT_MODEL, "db_enabled": db_enabled()}


@app.post("/predict", response_model=PredictResponse)
def predict(request: PredictRequest, db: Session = Depends(get_session)) -> PredictResponse:
    """Predict 10-year CHD risk from the 15 manually-entered features.

    Pydantic has already range-validated the inputs (schemas.py) and rejected impossible
    values with a 422 before we get here.
    """
    model = request.model or DEFAULT_MODEL
    features = request.features.model_dump()
    probability = predict_risk(features, model=model)
    risk_category = categorize_risk(probability)
    # Persist the assessment (best-effort; save_assessment swallows DB errors so a logging
    # problem can never break or block a result — CLAUDE.md §2).
    assessment_id = save_assessment(
        db,
        features=features,
        probability=probability,
        risk_category=risk_category,
        model_used=model,
        high_risk_threshold=HIGH_RISK_THRESHOLD,
        source="manual",
    )
    return PredictResponse(
        probability=probability,
        risk_category=risk_category,
        model_used=model,
        high_risk_threshold=HIGH_RISK_THRESHOLD,
        assessment_id=assessment_id,
    )


@app.post("/predict-guided", response_model=GuidedPredictResponse)
def predict_guided(
    req: WizardPredictRequest, db: Session = Depends(get_session)
) -> GuidedPredictResponse:
    """Predict from the low-literacy guided wizard (CLAUDE.md §1, §5).

    Derives BMI from height + weight (the single home of that formula), passes any "don't
    know" values to the model as null for its median imputer to fill — never substituting a
    guessed value (CLAUDE.md §2) — and reports exactly which fields were left unknown so the
    result can carry honest confidence (CLAUDE.md §6).
    """
    model = req.model or DEFAULT_MODEL

    # BMI = weight_kg / (height_m ** 2). Computed HERE so the client never has to (CLAUDE.md task).
    height_m = req.height_cm / 100.0
    bmi = round(req.weight_kg / (height_m * height_m), 1)

    # A non-smoker has 0 cigarettes/day; a smoker who didn't quantify is left null (imputed).
    cigs = req.cigsPerDay
    if cigs is None and req.currentSmoker == 0:
        cigs = 0.0

    # Build the 15-feature dict in schema order. None -> the pipeline's median imputer (§4),
    # NEVER a fabricated "normal" value (§2).
    features = {
        "male": req.male,
        "age": req.age,
        "education": req.education,
        "currentSmoker": req.currentSmoker,
        "cigsPerDay": cigs,
        "BPMeds": req.BPMeds,
        "prevalentStroke": req.prevalentStroke,
        "prevalentHyp": req.prevalentHyp,
        "diabetes": req.diabetes,
        "totChol": req.totChol,
        "sysBP": req.sysBP,
        "diaBP": req.diaBP,
        "BMI": bmi,
        "heartRate": req.heartRate,
        "glucose": req.glucose,
    }

    probability = predict_risk(features, model=model)
    risk_category = categorize_risk(probability)

    # Trust the client's unknown list but also derive it from the nulls we actually have, so the
    # two can never disagree (defensive — the confidence task depends on this being accurate).
    derived_unknown = [c for c in FEATURE_COLUMNS if features.get(c) is None]
    unknown = sorted(set(req.unknown_fields) | set(derived_unknown))

    # Honest confidence label based on how many clinical measurements were imputed (CLAUDE.md §6).
    confidence = confidence_from_missing(unknown)

    assessment_id = save_assessment(
        db,
        features=features,
        probability=probability,
        risk_category=risk_category,
        model_used=model,
        high_risk_threshold=HIGH_RISK_THRESHOLD,
        source="guided",
    )
    return GuidedPredictResponse(
        probability=probability,
        risk_category=risk_category,
        model_used=model,
        high_risk_threshold=HIGH_RISK_THRESHOLD,
        assessment_id=assessment_id,
        bmi=bmi,
        confidence=confidence,
        unknown_fields=unknown,
        features_used=features,
    )


@app.get("/history", response_model=HistoryResponse)
def history(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_session),
) -> HistoryResponse:
    """Return recent stored assessments, newest first (CLAUDE.md §9).

    Returns no identifying information — only the clinical inputs, the result, and metadata
    that were stored (see db.py for the data-minimization rules).
    """
    items = get_recent_assessments(db, limit=limit)
    return HistoryResponse(db_enabled=db_enabled(), count=len(items), items=items)


@app.get("/doctors", response_model=DoctorsResponse)
def doctors(
    q: Optional[str] = Query(default=None, description="Free-text search: name / specialty / location (bn or en)"),
    specialty: Optional[str] = Query(default=None, description="Optional specialty filter (bn or en)"),
    location: Optional[str] = Query(default=None, description="Optional location/area filter (bn or en)"),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_session),
) -> DoctorsResponse:
    """Search the doctor directory (CLAUDE.md §13.6).

    Returns active doctors, optionally filtered by a free-text term, a specialty, and/or a
    location/area (specialty + location combine with AND). The frontend links here from the
    results page — pre-filtered by specialty for elevated risk — to guide users toward a real
    doctor (CLAUDE.md §2).
    """
    items = search_doctors(db, q=q, specialty=specialty, location=location, limit=limit)
    return DoctorsResponse(db_enabled=db_enabled(), count=len(items), items=items)


# Bangla copy for the failure path (CLAUDE.md §2 requires honest communication in Bangla).
_FAIL_MSG_BN = (
    "রিপোর্ট থেকে যথেষ্ট তথ্য পড়া যায়নি। অনুগ্রহ করে হাতে তথ্য লিখে দিন। "
    "(কোনো ঝুঁকির ফলাফল দেখানো হচ্ছে না — ভুল তথ্যের ভিত্তিতে ফলাফল দেওয়া নিরাপদ নয়।)"
)
_OK_MSG_BN = "রিপোর্ট থেকে তথ্য পড়া হয়েছে। অনুগ্রহ করে মানগুলো মিলিয়ে দেখুন।"


@app.post("/predict-from-image", response_model=PredictFromImageResponse)
async def predict_from_image(
    file: UploadFile = File(...),
    model: Optional[str] = Query(default=None, description="logistic_regression | xgboost"),
    db: Session = Depends(get_session),
) -> PredictFromImageResponse:
    """OCR a report image, extract §5 values, and predict — SAFELY (CLAUDE.md §2, §8).

    OCR runs exactly once. If it fails or extracts fewer than MIN_OCR_FIELDS real values, we
    return ocr_success=False with NO prediction so the frontend falls back to manual entry.
    We never let the median imputer paper over a total OCR failure into a confident score.
    """
    image_bytes = await file.read()
    logger.info(
        "/predict-from-image: received upload filename=%r content_type=%r size=%d bytes, model=%s",
        file.filename, file.content_type, len(image_bytes), model or DEFAULT_MODEL,
    )

    # Empty upload -> nothing to read. Treat as a clean OCR failure, never a prediction.
    if not image_bytes:
        logger.warning("/predict-from-image: upload was EMPTY (0 bytes) — returning fallback.")
        return PredictFromImageResponse(
            ocr_success=False,
            fall_back_to_manual=True,
            n_extracted=0,
            min_required_fields=MIN_OCR_FIELDS,
            message="No image was received. Please upload a clearer photo or enter values manually.",
            message_bn=_FAIL_MSG_BN,
        )

    result = extract_from_image(image_bytes)  # OCR runs ONCE in here (CLAUDE.md §7)
    extracted = result.values
    n = len(extracted)
    missing = result.missing_fields(FEATURE_COLUMNS)
    raw_sample = result.raw_text[:25]

    # --- SAFETY GATE (CLAUDE.md §2) ---
    # Not enough real data -> do NOT fabricate, do NOT predict. Surface the failure clearly.
    # Log the gate decision so it's obvious whether a failure was the gate (parsing) vs the
    # detection/init stages already logged above.
    if n < MIN_OCR_FIELDS:
        logger.warning(
            "/predict-from-image: MINIMUM-FIELDS GATE not met — extracted %d/%d required real "
            "field(s) %s (any_text_detected=%s) → fall_back_to_manual, NO prediction made.",
            n, MIN_OCR_FIELDS, result.extracted_fields, result.any_text_detected,
        )
        if not result.any_text_detected:
            msg = ("Could not read any text from the image. Please upload a clearer photo "
                   "or enter the values manually.")
        else:
            msg = (f"Only {n} of the required {MIN_OCR_FIELDS} values could be read from the "
                   "report. To stay safe we will not estimate risk from incomplete data — "
                   "please enter the values manually.")
        return PredictFromImageResponse(
            ocr_success=False,
            fall_back_to_manual=True,
            n_extracted=n,
            min_required_fields=MIN_OCR_FIELDS,
            extracted_fields=result.extracted_fields,
            missing_fields=missing,
            extracted_values=extracted,  # let the manual form pre-fill whatever WAS read
            message=msg,
            message_bn=_FAIL_MSG_BN,
            prediction=None,
            raw_text_sample=raw_sample,
        )

    # --- Enough real values: predict. The FEW missing fields are imputed by the pipeline
    # (CLAUDE.md §4) and reported in missing_fields so the UI can ask the user to confirm. ---
    logger.info(
        "/predict-from-image: MINIMUM-FIELDS GATE passed — %d/%d real field(s) extracted %s → "
        "predicting (%d field(s) imputed).",
        n, MIN_OCR_FIELDS, result.extracted_fields, len(missing),
    )
    chosen = model or DEFAULT_MODEL
    features = {c: extracted.get(c) for c in FEATURE_COLUMNS}  # missing -> None -> imputer
    probability = predict_risk(features, model=chosen)
    risk_category = categorize_risk(probability)
    # Same honest confidence tier the guided wizard reports (CLAUDE.md §6) — based on how many
    # CLINICAL fields were imputed rather than read. The image-success path now routes straight
    # to results, so it must carry this so the results page can frame the number identically.
    confidence = confidence_from_missing(missing)
    # Persist (best-effort). We store the feature dict actually sent to the model — imputed
    # fields are recorded as None so the row honestly reflects what was read vs. estimated.
    assessment_id = save_assessment(
        db,
        features=features,
        probability=probability,
        risk_category=risk_category,
        model_used=chosen,
        high_risk_threshold=HIGH_RISK_THRESHOLD,
        source="image",
    )
    prediction = PredictResponse(
        probability=probability,
        risk_category=risk_category,
        model_used=chosen,
        high_risk_threshold=HIGH_RISK_THRESHOLD,
        assessment_id=assessment_id,
    )
    return PredictFromImageResponse(
        ocr_success=True,
        fall_back_to_manual=False,
        n_extracted=n,
        min_required_fields=MIN_OCR_FIELDS,
        extracted_fields=result.extracted_fields,
        missing_fields=missing,
        extracted_values=extracted,
        message=(f"Read {n} values from the report; {len(missing)} were not found and were "
                 "estimated. Please confirm the values. This is a screening estimate, not a "
                 "diagnosis — consult a doctor."),
        message_bn=_OK_MSG_BN,
        prediction=prediction,
        confidence=confidence,
        raw_text_sample=raw_sample,
    )
