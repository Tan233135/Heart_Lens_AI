"""OCR extraction for HeartLens (CLAUDE.md §2, §8).

SAFETY-CRITICAL. The single most dangerous failure mode for this app is silently
substituting "normal" values when OCR fails and then presenting a confident "low risk"
result (CLAUDE.md §2). This module therefore does TWO things and is careful about both:

  1. Reads text from a report image with EasyOCR initialized for BOTH 'en' and 'bn'
     (CLAUDE.md §8), constructed ONCE and reused.
  2. Maps that text to the §5 feature schema with EXPLICIT, AUDITABLE parsing, including
     unit handling (cholesterol / glucose normalized to mg/dL).

It deliberately does NOT decide whether a prediction is safe to make — that gate lives at
the endpoint (main.py) so the policy ("require a minimum set of real values, else fall back
to manual entry") is visible where the response is shaped. This module only ever reports
what it actually found; it never invents a value.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Optional

from schemas import FEATURE_BOUNDS

# Logger for the OCR pipeline. Handlers/levels are configured centrally in main.py so these
# INFO/WARNING/ERROR lines actually reach the server log (CLAUDE.md §8 — the pipeline must be
# auditable: we log the raw text detected and which fields parsed, never silently swallow).
logger = logging.getLogger("heartlens.ocr")

# EasyOCR languages — BOTH English and Bangla (CLAUDE.md §8). Reports here may be in either
# or both scripts; a prior version was English-only despite Bangla logic existing.
OCR_LANGUAGES = ["en", "bn"]

# Tokens below this OCR confidence are NOT trusted as clinical values (CLAUDE.md §8: "on
# low confidence, do not fabricate"). They are still kept in raw_text for audit/debugging.
OCR_MIN_CONFIDENCE = 0.30

# --- EasyOCR reader: constructed ONCE, lazily, then reused (CLAUDE.md §8, §9) -------------
# Lazy so that (a) server startup and the manual /predict path don't pay the heavy
# PyTorch/EasyOCR import + model-download cost, and (b) it is built exactly once on first
# image request and cached for every request after. NEVER construct a Reader per request.
_READER = None


def get_reader():
    """Return the process-wide EasyOCR reader, building it once on first use.

    STAGE 1 of the pipeline: engine init. Both sub-steps are logged distinctly so a failure
    here is unmistakable in the server log and we can tell WHICH part broke:
      - `import easyocr` failing => the OCR stack isn't installed/importable (CLAUDE.md §9).
      - `easyocr.Reader(...)` failing => model download/timeout/OOM at construction (§9).
    On failure we log the REAL exception and re-raise (we do not swallow it).
    """
    global _READER
    if _READER is None:
        logger.info("OCR engine init: importing easyocr (lazy; pulls in PyTorch)…")
        try:
            import easyocr  # imported lazily — pulls in PyTorch (heavy; see CLAUDE.md §9)
        except Exception:
            logger.exception(
                "OCR engine init FAILED at `import easyocr`: the OCR stack is not "
                "installed/importable in this environment (CLAUDE.md §9 flags this as the "
                "likely deployment blocker). OCR is UNAVAILABLE."
            )
            raise

        logger.info(
            "OCR engine init: constructing easyocr.Reader(langs=%s, gpu=False) — the FIRST "
            "run downloads the detection + recognition models (this can be slow / can OOM)…",
            OCR_LANGUAGES,
        )
        try:
            # gpu=False -> CPU-only path (Railway has no GPU; keeps memory/size down, §9).
            _READER = easyocr.Reader(OCR_LANGUAGES, gpu=False)
        except Exception:
            logger.exception(
                "OCR engine init FAILED while constructing easyocr.Reader(langs=%s): likely a "
                "model-download failure, network timeout, or out-of-memory (CLAUDE.md §9).",
                OCR_LANGUAGES,
            )
            raise
        logger.info("OCR engine init: easyocr.Reader is READY (langs=%s).", OCR_LANGUAGES)
    return _READER


def warm_up_ocr() -> bool:
    """Eagerly initialize the OCR engine at startup and LOG the outcome.

    Unlike get_reader(), this never crashes the app: it catches any init failure (already
    logged in full by get_reader) and returns False, so the manual /predict path keeps working
    while making the engine-init problem visible in the STARTUP log rather than only on the
    first upload. Returns True iff the engine is ready.
    """
    try:
        get_reader()
        logger.info("OCR warm-up: engine initialized successfully at startup.")
        return True
    except Exception:
        logger.error(
            "OCR warm-up: engine is UNAVAILABLE — /predict-from-image will fail until this is "
            "fixed. The real exception/traceback is logged just above."
        )
        return False


# -----------------------------------------------------------------------------------------
# Extraction result
# -----------------------------------------------------------------------------------------
@dataclass
class ExtractionResult:
    """What OCR actually found — and only what it found.

    `values` contains ONLY fields that were both parsed AND passed range validation. Missing
    or implausible fields are simply absent; they are never defaulted here. The caller decides
    whether enough was extracted to trust a prediction (CLAUDE.md §2).
    """

    values: dict[str, float] = field(default_factory=dict)
    raw_text: list[str] = field(default_factory=list)  # every line OCR returned (audit trail)
    any_text_detected: bool = False  # did OCR read ANYABLE text at all? (blank image -> False)

    @property
    def extracted_fields(self) -> list[str]:
        return list(self.values.keys())

    def missing_fields(self, feature_columns: list[str]) -> list[str]:
        return [c for c in feature_columns if c not in self.values]


# -----------------------------------------------------------------------------------------
# Unit handling (CLAUDE.md §5, §8: "Misread units = wrong risk")
# -----------------------------------------------------------------------------------------
# Cholesterol and glucose appear on reports in either mg/dL (common in BD/US) or mmol/L
# (SI). The model expects mg/dL. We detect the unit two ways, in order of trust:
#   1. An explicit unit token next to the value ("mmol/L" / "mg/dL").
#   2. Magnitude heuristic as a fallback: physiological mmol/L values are an order of
#      magnitude smaller than mg/dL, so a "cholesterol" of 5.2 is mmol/L, 200 is mg/dL.
MMOL_TO_MGDL = {
    "totChol": 38.67,   # 1 mmol/L cholesterol = 38.67 mg/dL
    "glucose": 18.0182,  # 1 mmol/L glucose    = 18.0182 mg/dL
}
# Below this raw magnitude (with no explicit unit), the value is almost certainly mmol/L.
_MMOL_MAGNITUDE_CEILING = {"totChol": 25.0, "glucose": 30.0}


def _normalize_to_mgdl(field_name: str, value: float, unit_text: Optional[str]) -> float:
    """Convert a cholesterol/glucose reading to mg/dL given any detected unit token."""
    if unit_text and re.search(r"mmol", unit_text, re.IGNORECASE):
        return value * MMOL_TO_MGDL[field_name]
    if unit_text and re.search(r"mg\s*/?\s*d", unit_text, re.IGNORECASE):
        return value  # explicitly mg/dL
    # No explicit unit: fall back to magnitude.
    if value < _MMOL_MAGNITUDE_CEILING[field_name]:
        return value * MMOL_TO_MGDL[field_name]
    return value


# -----------------------------------------------------------------------------------------
# Field parsers — explicit and auditable (CLAUDE.md §8)
# -----------------------------------------------------------------------------------------
_NUM = r"([0-9]+(?:\.[0-9]+)?)"


def _search_labeled_number(text: str, label_patterns: list[str]) -> Optional[tuple[float, str]]:
    """Find the first number that follows any of `label_patterns`. Returns (value, tail)."""
    for lp in label_patterns:
        m = re.search(lp + r"[^0-9\-]{0,15}" + _NUM, text, re.IGNORECASE)
        if m:
            tail = text[m.end(): m.end() + 14]
            return float(m.group(1)), tail
    return None


def _parse_features(text: str) -> dict[str, float]:
    """Map a blob of OCR text to §5 features. Only includes fields actually found.

    Every field is parsed with an explicit, named rule. Add/adjust rules here, never push
    defaulting into the model path.
    """
    out: dict[str, float] = {}

    # --- Sex (check 'female' before 'male': 'female' contains the substring 'male') ---
    if re.search(r"\bfemale\b|মহিলা|নারী|স্ত্রী", text, re.IGNORECASE):
        out["male"] = 0
    elif re.search(r"\bmale\b|পুরুষ", text, re.IGNORECASE):
        out["male"] = 1

    # --- Age ---
    hit = _search_labeled_number(text, [r"age", r"বয়স"])
    if hit:
        out["age"] = hit[0]

    # --- Total cholesterol (unit-normalized to mg/dL) ---
    hit = _search_labeled_number(text, [r"total\s*cholesterol", r"cholesterol", r"chol\b", r"কোলেস্টেরল"])
    if hit:
        out["totChol"] = _normalize_to_mgdl("totChol", hit[0], hit[1])

    # --- Glucose / blood sugar (unit-normalized to mg/dL) ---
    hit = _search_labeled_number(text, [r"glucose", r"blood\s*sugar", r"fasting\s*(?:blood\s*)?sugar", r"\bfbs\b", r"গ্লুকোজ", r"রক্তে?\s*শর্করা"])
    if hit:
        out["glucose"] = _normalize_to_mgdl("glucose", hit[0], hit[1])

    # --- Blood pressure: prefer a labeled "120/80", else any plausible NNN/NN ratio ---
    bp = re.search(r"(?:blood\s*pressure|\bbp\b|রক্তচাপ)[^0-9]{0,12}([0-9]{2,3})\s*/\s*([0-9]{2,3})", text, re.IGNORECASE)
    if not bp:
        bp = re.search(r"\b([0-9]{2,3})\s*/\s*([0-9]{2,3})\b", text)
    if bp:
        out["sysBP"] = float(bp.group(1))
        out["diaBP"] = float(bp.group(2))

    # --- BMI ---
    hit = _search_labeled_number(text, [r"bmi", r"body\s*mass\s*index"])
    if hit:
        out["BMI"] = hit[0]

    # --- Heart rate / pulse ---
    hit = _search_labeled_number(text, [r"heart\s*rate", r"pulse", r"হৃদস্পন্দন", r"নাড়ি"])
    if hit:
        out["heartRate"] = hit[0]

    # --- Cigarettes per day (also implies currentSmoker) ---
    hit = _search_labeled_number(text, [r"cigs?\s*per\s*day", r"cigarettes?\s*/?\s*day", r"সিগারেট"])
    if hit:
        out["cigsPerDay"] = hit[0]
        out["currentSmoker"] = 1 if hit[0] > 0 else 0

    # --- Binary history flags: presence of an affirmative mention ---
    if re.search(r"\bdiabet(?:es|ic)\b|ডায়াবেটিস|মধুমেহ", text, re.IGNORECASE):
        out["diabetes"] = 1
    if re.search(r"hypertensi(?:on|ve)|উচ্চ\s*রক্তচাপ", text, re.IGNORECASE):
        out["prevalentHyp"] = 1
    if re.search(r"\bstroke\b|স্ট্রোক", text, re.IGNORECASE):
        out["prevalentStroke"] = 1
    if re.search(r"bp\s*med|antihypertensive|blood\s*pressure\s*medication", text, re.IGNORECASE):
        out["BPMeds"] = 1

    return out


def extract_features_from_text(lines: list[str]) -> dict[str, float]:
    """Parse OCR text lines into §5 features, dropping any value outside its valid range.

    Out-of-range values (e.g. a cholesterol of 9000 from a misread) are treated as NOT
    extracted rather than fed to the model as garbage (CLAUDE.md §7). They simply do not
    appear in the result, so the safety gate counts them as missing.
    """
    text = "\n".join(lines)
    parsed = _parse_features(text)

    valid: dict[str, float] = {}
    for name, value in parsed.items():
        lo, hi = FEATURE_BOUNDS[name]
        if lo <= value <= hi:
            valid[name] = value
        else:
            # An implausible read (e.g. a misread cholesterol of 9000). Don't feed garbage to
            # the model — but LOG the drop so it's not an invisible reason for a missing field.
            logger.info(
                "OCR field parsing: DROPPED %s=%s — outside valid range [%s, %s] (likely misread).",
                name, value, lo, hi,
            )
    return valid


# -----------------------------------------------------------------------------------------
# Image -> ExtractionResult
# -----------------------------------------------------------------------------------------
def run_ocr_lines(image_bytes: bytes) -> tuple[list[str], bool]:
    """Run EasyOCR ONCE on the image. Returns (trusted_text_lines, any_text_detected).

    `trusted_text_lines` keeps only tokens at/above OCR_MIN_CONFIDENCE for value parsing.
    `any_text_detected` reflects whether OCR found ANY text box at all, used to distinguish
    a blank image from a low-confidence-but-non-empty one.
    """
    reader = get_reader()
    # detail=1 -> (bbox, text, confidence). Run exactly once per request (CLAUDE.md §7).
    results = reader.readtext(image_bytes, detail=1)
    any_text = len(results) > 0

    # STAGE 2 of the pipeline: text detection. Log the RAW text EasyOCR returned, BEFORE any
    # field parsing, with per-token confidence (CLAUDE.md §8). This is what distinguishes
    # "OCR read nothing" from "OCR read text but parsing found no fields".
    if not any_text:
        logger.warning(
            "OCR text detection: NO text detected in the image (blank, illegible, rotated, or "
            "an unsupported format)."
        )
    else:
        logger.info("OCR text detection: %d text box(es) detected. Raw text (confidence | text):", len(results))
        for (_box, text, conf) in results:
            logger.info("    %.2f | %r", conf, text)

    trusted = [text for (_box, text, conf) in results if conf >= OCR_MIN_CONFIDENCE]
    dropped = len(results) - len(trusted)
    if dropped:
        logger.info(
            "OCR text detection: %d/%d token(s) below confidence %.2f were dropped before parsing.",
            dropped, len(results), OCR_MIN_CONFIDENCE,
        )
    return trusted, any_text


# The 15 §5 features, used only to log parsed-vs-missing clearly (FEATURE_BOUNDS keys are them).
_ALL_FEATURES = list(FEATURE_BOUNDS.keys())


def extract_from_image(image_bytes: bytes) -> ExtractionResult:
    """Full OCR -> §5 extraction for one report image. Never fabricates values."""
    lines, any_text = run_ocr_lines(image_bytes)
    values = extract_features_from_text(lines)

    # STAGE 3 of the pipeline: field parsing. Log which of the 15 fields were parsed from the
    # raw text and which were not — so a parsing-rule mismatch is visible, not silent (§8).
    parsed_keys = list(values.keys())
    not_found = [f for f in _ALL_FEATURES if f not in values]
    logger.info(
        "OCR field parsing: %d/15 field(s) parsed from raw text: %s",
        len(parsed_keys), values if values else "{}",
    )
    logger.info("OCR field parsing: %d/15 field(s) NOT found: %s", len(not_found), not_found)

    return ExtractionResult(values=values, raw_text=lines, any_text_detected=any_text)
