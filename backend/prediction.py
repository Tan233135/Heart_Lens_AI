"""Model loading and risk prediction (CLAUDE.md §4, §6).

Pipelines and metadata are loaded ONCE at import time (this module is imported once by
the FastAPI app), never per request. Each .pkl is a full sklearn Pipeline
(SimpleImputer(median) -> StandardScaler -> classifier); we send RAW feature values and
let the pipeline do imputation + scaling internally. We do NOT reimplement preprocessing.
"""

from __future__ import annotations

import json
import os
import warnings
from pathlib import Path

import joblib
import pandas as pd

MODELS_DIR = Path(__file__).parent / "models"

# Fallback feature order, used verbatim if model_metadata.json is missing (CLAUDE.md §5).
_FALLBACK_FEATURE_COLUMNS = [
    "male", "age", "education", "currentSmoker", "cigsPerDay", "BPMeds",
    "prevalentStroke", "prevalentHyp", "diabetes", "totChol", "sysBP",
    "diaBP", "BMI", "heartRate", "glucose",
]

_METADATA_PATH = MODELS_DIR / "model_metadata.json"
if _METADATA_PATH.exists():
    with open(_METADATA_PATH) as f:
        METADATA = json.load(f)
    FEATURE_COLUMNS = METADATA.get("feature_columns", _FALLBACK_FEATURE_COLUMNS)
else:
    warnings.warn(
        "model_metadata.json not found — falling back to the 15-feature order from CLAUDE.md §5.",
        RuntimeWarning,
    )
    METADATA = {"feature_columns": _FALLBACK_FEATURE_COLUMNS}
    FEATURE_COLUMNS = _FALLBACK_FEATURE_COLUMNS

# Load both pipelines once at startup. A version mismatch against the pickled pipelines
# raises sklearn's InconsistentVersionWarning and can silently corrupt results (CLAUDE.md §4),
# so we surface it loudly rather than swallowing it.
LOGREG = joblib.load(MODELS_DIR / "logistic_regression_pipeline.pkl")
XGB = joblib.load(MODELS_DIR / "xgboost_pipeline.pkl")

_MODELS = {"logistic_regression": LOGREG, "xgboost": XGB}

# Default model: logistic_regression — higher recall + AUC, the right call for screening (CLAUDE.md §6).
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "logistic_regression")

# --- Decision thresholds (CLAUDE.md §2: must be deliberate, documented, NOT a buried 0.5) ---
#
# This is a SCREENING tool, so recall (catching at-risk people) matters more than precision,
# and the logistic-regression model was trained with class re-balancing — its raw probabilities
# are likely INFLATED and are NOT yet calibration-verified (CLAUDE.md §6). Both facts argue for
# a LOW "high risk" cutoff rather than the naive 0.5: at 0.5 the model would call almost no one
# high-risk and miss the people we exist to catch.
#
# Chosen: HIGH at 0.30, MODERATE at 0.15 (overridable via env). These are intentionally
# conservative (err toward flagging) and should be revisited once a calibration curve exists.
HIGH_RISK_THRESHOLD = float(os.getenv("HIGH_RISK_THRESHOLD", "0.30"))
MODERATE_RISK_THRESHOLD = float(os.getenv("MODERATE_RISK_THRESHOLD", "0.15"))


def predict_risk(features: dict, model: str = "logistic_regression") -> float:
    """Return P(10-year CHD) for one patient.

    `features` keys must match FEATURE_COLUMNS. Individual missing fields may be None
    (the pipeline's median imputer handles them) — but the OCR safety rule in CLAUDE.md §2
    must be enforced UPSTREAM before calling this; this function trusts its input.
    """
    if model not in _MODELS:
        raise ValueError(f"Unknown model {model!r}; expected one of {list(_MODELS)}")
    row = pd.DataFrame([features])[FEATURE_COLUMNS]  # enforce exact column order
    pipe = _MODELS[model]
    return float(pipe.predict_proba(row)[0, 1])


def categorize_risk(probability: float) -> str:
    """Map a probability to low / moderate / high using the documented thresholds above."""
    if probability >= HIGH_RISK_THRESHOLD:
        return "high"
    if probability >= MODERATE_RISK_THRESHOLD:
        return "moderate"
    return "low"


# --- Result confidence (CLAUDE.md §2, §6) ------------------------------------------------
#
# How much should the UI trust a guided-wizard estimate? It depends on how many of the
# CLINICAL measurement values the user could actually supply. The median imputer (§4) will
# fill the rest, but every imputed clinical field makes the score less grounded in this
# person's real data — so we LABEL that honestly rather than presenting false precision (§6).
#
# Counted fields are the clinical measurements the wizard collects: sysBP, diaBP, totChol,
# glucose. heartRate is DELIBERATELY excluded: the wizard never asks for it (it is unknown by
# design for every user), so counting it would peg every assessment at >=1 missing and make
# "full" confidence unreachable — which would defeat the whole point of the label. heartRate
# is still surfaced in the missing-fields list; it just doesn't move the confidence tier.
CONFIDENCE_CLINICAL_FIELDS = ["sysBP", "diaBP", "totChol", "glucose"]


def confidence_from_missing(missing_fields) -> str:
    """Derive a confidence tier from how many clinical inputs were left unknown (CLAUDE.md §6).

    0 missing  -> "full"   (we have all the clinical measurements; show the full result)
    1-2 missing -> "partial" (usable, but go lighter on precise numbers)
    3+ missing -> "rough"  (too little real data — show only a coarse category, no people-grid)
    """
    missing = set(missing_fields)
    n = sum(1 for f in CONFIDENCE_CLINICAL_FIELDS if f in missing)
    if n == 0:
        return "full"
    if n <= 2:
        return "partial"
    return "rough"
