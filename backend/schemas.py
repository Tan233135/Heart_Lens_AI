"""Request/response models for the HeartLens prediction API.

The 15 input features and their types/units/encodings come straight from CLAUDE.md §5.
Range checks reject impossible values (CLAUDE.md §7) — these are sanity bounds meant to
catch OCR/transcription errors (negative age, BMI of 900, etc.), NOT clinical normality
checks. We deliberately allow physiologically extreme-but-possible values through.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

# Single source of truth for validity ranges (CLAUDE.md §7). These are generous SANITY
# bounds — a value outside them is almost certainly a data-entry / OCR misread, not a real
# clinical value — NOT clinical reference ranges. Both the manual /predict path (via the
# Pydantic Fields below) and the OCR path (ocr.py drops out-of-range reads) validate against
# this same dict, so the two paths can never drift apart.
FEATURE_BOUNDS: dict[str, tuple[float, float]] = {
    "male": (0, 1),
    "age": (18, 120),
    "education": (1, 4),
    "currentSmoker": (0, 1),
    "cigsPerDay": (0, 100),
    "BPMeds": (0, 1),
    "prevalentStroke": (0, 1),
    "prevalentHyp": (0, 1),
    "diabetes": (0, 1),
    "totChol": (80, 600),
    "sysBP": (70, 300),
    "diaBP": (40, 200),
    "BMI": (10, 70),
    "heartRate": (30, 250),
    "glucose": (30, 600),
}


def _b(name: str) -> dict:
    """ge/le kwargs for a field, pulled from the shared FEATURE_BOUNDS table."""
    lo, hi = FEATURE_BOUNDS[name]
    return {"ge": lo, "le": hi}


class PatientFeatures(BaseModel):
    """The 15 model inputs (CLAUDE.md §5), in schema order.

    Bounds come from FEATURE_BOUNDS above (generous validity ranges, not clinical reference
    ranges). A value outside these is almost certainly a data-entry / OCR error -> 422.
    """

    # Demographics
    male: int = Field(..., description="1 = male, 0 = female", **_b("male"))
    age: int = Field(..., description="years (training range ~32-70)", **_b("age"))
    education: int = Field(..., description="1-4 ordinal (1 = least, 4 = most)", **_b("education"))

    # Smoking
    currentSmoker: int = Field(..., description="1 = yes, 0 = no", **_b("currentSmoker"))
    cigsPerDay: float = Field(..., description="cigarettes/day (0 if non-smoker)", **_b("cigsPerDay"))

    # History / conditions
    BPMeds: int = Field(..., description="1 = on BP medication, 0 = not", **_b("BPMeds"))
    prevalentStroke: int = Field(..., description="history of stroke", **_b("prevalentStroke"))
    prevalentHyp: int = Field(..., description="hypertensive", **_b("prevalentHyp"))
    diabetes: int = Field(..., description="1 = yes, 0 = no", **_b("diabetes"))

    # Labs / vitals
    totChol: float = Field(..., description="total cholesterol, mg/dL", **_b("totChol"))
    sysBP: float = Field(..., description="systolic BP, mmHg", **_b("sysBP"))
    diaBP: float = Field(..., description="diastolic BP, mmHg", **_b("diaBP"))
    BMI: float = Field(..., description="kg/m^2", **_b("BMI"))
    heartRate: float = Field(..., description="bpm", **_b("heartRate"))
    glucose: float = Field(..., description="mg/dL", **_b("glucose"))

    model_config = {
        "json_schema_extra": {
            "example": {
                "male": 1,
                "age": 55,
                "education": 2,
                "currentSmoker": 1,
                "cigsPerDay": 20,
                "BPMeds": 0,
                "prevalentStroke": 0,
                "prevalentHyp": 1,
                "diabetes": 0,
                "totChol": 250,
                "sysBP": 150,
                "diaBP": 95,
                "BMI": 28.5,
                "heartRate": 80,
                "glucose": 90,
            }
        }
    }


class PredictRequest(BaseModel):
    """A /predict call: the 15 features plus an optional model choice."""

    features: PatientFeatures
    model: Optional[Literal["logistic_regression", "xgboost"]] = Field(
        default=None,
        description="Model to use. Defaults to DEFAULT_MODEL env (logistic_regression).",
    )


class PredictResponse(BaseModel):
    probability: float = Field(..., description="P(10-year CHD), 0..1 — a screening estimate, not a diagnosis")
    risk_category: Literal["low", "moderate", "high"]
    model_used: str
    high_risk_threshold: float = Field(..., description="Threshold used to flag 'high' (CLAUDE.md §2)")


class PredictFromImageResponse(BaseModel):
    """Result of the OCR -> extract -> predict flow (CLAUDE.md §2, §7, §8).

    The contract the frontend relies on to honor the §2 safety rules:
      - `ocr_success=False` / `fall_back_to_manual=True` means OCR did NOT yield enough real
        data. `prediction` is then `None` — there is NO risk score to show. The frontend MUST
        route the user to the manual entry form. It must NOT render a "low risk" result.
      - On success, `missing_fields` lists which features were imputed by the model's median
        imputer (a few missing is fine, §4) so the UI can ask the user to confirm/correct them.
    """

    ocr_success: bool = Field(..., description="True only if enough real values were extracted to trust a prediction")
    fall_back_to_manual: bool = Field(..., description="If True, frontend must show the manual entry form (CLAUDE.md §2)")
    n_extracted: int = Field(..., description="Count of real values successfully extracted")
    min_required_fields: int = Field(..., description="Minimum real values required before a prediction is trusted")
    extracted_fields: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list, description="Features NOT read from the image (imputed if prediction proceeds)")
    extracted_values: dict[str, float] = Field(default_factory=dict, description="Real values found — use to pre-fill the manual form")
    message: str = Field(..., description="Plain-language status (English)")
    message_bn: str = Field(..., description="Plain-language status (Bangla) — audience requirement, CLAUDE.md §2")
    prediction: Optional[PredictResponse] = Field(default=None, description="None when ocr_success is False — there is no score to show")
    raw_text_sample: list[str] = Field(default_factory=list, description="Sample of OCR-read text, for audit/debugging")
