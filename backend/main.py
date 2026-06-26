"""HeartLens FastAPI app (CLAUDE.md §7).

This module wires the prediction core (prediction.py) to HTTP. Models are loaded once,
at import of `prediction`, never per request. OCR is not part of this milestone — this is
the safe manual-feature prediction baseline (CLAUDE.md §13, step 1).
"""

from __future__ import annotations

import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from ocr import extract_from_image
from prediction import (
    DEFAULT_MODEL,
    FEATURE_COLUMNS,
    HIGH_RISK_THRESHOLD,
    categorize_risk,
    predict_risk,
)
from schemas import (
    PredictFromImageResponse,
    PredictRequest,
    PredictResponse,
)

load_dotenv()

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


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "default_model": DEFAULT_MODEL}


@app.post("/predict", response_model=PredictResponse)
def predict(request: PredictRequest) -> PredictResponse:
    """Predict 10-year CHD risk from the 15 manually-entered features.

    Pydantic has already range-validated the inputs (schemas.py) and rejected impossible
    values with a 422 before we get here.
    """
    model = request.model or DEFAULT_MODEL
    probability = predict_risk(request.features.model_dump(), model=model)
    return PredictResponse(
        probability=probability,
        risk_category=categorize_risk(probability),
        model_used=model,
        high_risk_threshold=HIGH_RISK_THRESHOLD,
    )


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
) -> PredictFromImageResponse:
    """OCR a report image, extract §5 values, and predict — SAFELY (CLAUDE.md §2, §8).

    OCR runs exactly once. If it fails or extracts fewer than MIN_OCR_FIELDS real values, we
    return ocr_success=False with NO prediction so the frontend falls back to manual entry.
    We never let the median imputer paper over a total OCR failure into a confident score.
    """
    image_bytes = await file.read()

    # Empty upload -> nothing to read. Treat as a clean OCR failure, never a prediction.
    if not image_bytes:
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
    if n < MIN_OCR_FIELDS:
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
    chosen = model or DEFAULT_MODEL
    features = {c: extracted.get(c) for c in FEATURE_COLUMNS}  # missing -> None -> imputer
    probability = predict_risk(features, model=chosen)
    prediction = PredictResponse(
        probability=probability,
        risk_category=categorize_risk(probability),
        model_used=chosen,
        high_risk_threshold=HIGH_RISK_THRESHOLD,
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
        raw_text_sample=raw_sample,
    )
