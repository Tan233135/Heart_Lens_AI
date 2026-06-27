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
    assessment_id: Optional[int] = Field(
        default=None,
        description="Id of the persisted assessment row; None if persistence is unavailable (no DATABASE_URL).",
    )


# Sanity bounds for the two friendly inputs the guided wizard collects instead of BMI.
# Generous validity ranges (catch slips), NOT clinical limits — BMI is DERIVED from these.
HEIGHT_CM_BOUNDS = (60.0, 250.0)
WEIGHT_KG_BOUNDS = (10.0, 350.0)


class WizardPredictRequest(BaseModel):
    """A prediction request from the low-literacy guided wizard (CLAUDE.md §1, §5).

    Differences from PredictRequest, all driven by the audience:
      - BMI is NOT sent. The wizard asks height + weight (friendlier, answerable without a lab
        report); the backend derives BMI = weight_kg / (height_m ** 2) — the single source of
        that formula, so the client can't get it wrong.
      - Clinical values the user may not know (diabetes, prevalentHyp, sysBP, diaBP, totChol,
        glucose, heartRate) are Optional and arrive as null when the user answered "don't know".
        They are passed to the model as NaN for its median imputer to fill — we NEVER substitute
        a guessed/normal value (CLAUDE.md §2). heartRate is never asked, so it is null by default.
      - `unknown_fields` lists exactly which features the user left unknown, so the result can be
        labelled with honest confidence (CLAUDE.md §6; consumed by the confidence task).
    """

    # Always collected by the wizard (real answers).
    male: int = Field(..., ge=0, le=1)
    age: int = Field(..., ge=18, le=120)
    education: int = Field(..., ge=1, le=4)
    currentSmoker: int = Field(..., ge=0, le=1)
    prevalentStroke: int = Field(..., ge=0, le=1)
    BPMeds: int = Field(..., ge=0, le=1)
    height_cm: float = Field(..., ge=HEIGHT_CM_BOUNDS[0], le=HEIGHT_CM_BOUNDS[1])
    weight_kg: float = Field(..., ge=WEIGHT_KG_BOUNDS[0], le=WEIGHT_KG_BOUNDS[1])

    # Conditional / "don't know" -> null. Bounds apply only when a value IS provided.
    cigsPerDay: Optional[float] = Field(default=None, ge=0, le=100)
    diabetes: Optional[int] = Field(default=None, ge=0, le=1)
    prevalentHyp: Optional[int] = Field(default=None, ge=0, le=1)
    sysBP: Optional[float] = Field(default=None, ge=70, le=300)
    diaBP: Optional[float] = Field(default=None, ge=40, le=200)
    totChol: Optional[float] = Field(default=None, ge=80, le=600)
    glucose: Optional[float] = Field(default=None, ge=30, le=600)
    heartRate: Optional[float] = Field(default=None, ge=30, le=250)

    unknown_fields: list[str] = Field(
        default_factory=list,
        description="Feature names the user explicitly left unknown (sent as null).",
    )
    model: Optional[Literal["logistic_regression", "xgboost"]] = Field(default=None)


class GuidedPredictResponse(PredictResponse):
    """PredictResponse plus what the guided flow needs to be transparent about its inputs."""

    bmi: float = Field(..., description="BMI derived from height_cm & weight_kg (kg/m^2)")
    confidence: Literal["full", "partial", "rough"] = Field(
        ...,
        description=(
            "How much real clinical data backs this estimate (CLAUDE.md §6). 'full' = all "
            "clinical measurements present; 'partial' = 1-2 missing; 'rough' = 3+ missing, so "
            "the UI must show only a coarse category, no precise %/people-grid."
        ),
    )
    unknown_fields: list[str] = Field(
        default_factory=list,
        description="Features left unknown by the user (sent to the model as null/imputed).",
    )
    features_used: dict = Field(
        default_factory=dict,
        description="The exact 15-feature dict shown to the model (nulls = imputed by the pipeline).",
    )


class AssessmentRecord(BaseModel):
    """One persisted assessment as returned by /history (mirrors db.Assessment.to_dict)."""

    id: int
    created_at: Optional[str] = Field(default=None, description="ISO-8601 timestamp (UTC-aware)")
    source: str = Field(..., description='"manual" or "image"')
    model_used: str
    probability: float
    risk_category: str
    high_risk_threshold: float
    features: dict = Field(default_factory=dict, description="The 15 clinical inputs shown to the model (CLAUDE.md §5)")


class HistoryResponse(BaseModel):
    """Recent assessments, newest first. `db_enabled=False` means no DATABASE_URL is set."""

    db_enabled: bool = Field(..., description="False when persistence is not configured")
    count: int
    items: list[AssessmentRecord] = Field(default_factory=list)


class DoctorRecord(BaseModel):
    """One doctor directory entry (CLAUDE.md §13.6). Bilingual fields, public referral info."""

    id: int
    name_bn: str
    name_en: str
    specialty_bn: str
    specialty_en: str
    location_bn: str
    location_en: str
    phone: str


class DoctorsResponse(BaseModel):
    """Doctor directory search results. `db_enabled=False` means no DATABASE_URL is set."""

    db_enabled: bool = Field(..., description="False when persistence is not configured")
    count: int
    items: list[DoctorRecord] = Field(default_factory=list)


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
    confidence: Optional[Literal["full", "partial", "rough"]] = Field(
        default=None,
        description=(
            "How much real clinical data backs the prediction (CLAUDE.md §6), via the SAME "
            "confidence_from_missing() the guided wizard uses. None when there is no prediction "
            "(fall_back_to_manual). Lets the results page render an image result identically to "
            "a wizard result."
        ),
    )
    raw_text_sample: list[str] = Field(default_factory=list, description="Sample of OCR-read text, for audit/debugging")
