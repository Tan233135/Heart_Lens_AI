// Shared types mirroring the backend response contract (backend/schemas.py).
// Keep these in sync with the FastAPI Pydantic models.

export type RiskCategory = "low" | "moderate" | "high";

export type ModelName = "logistic_regression" | "xgboost";

// The 15 model inputs, in schema order (CLAUDE.md §5).
export interface PatientFeatures {
  male: number;
  age: number;
  education: number;
  currentSmoker: number;
  cigsPerDay: number;
  BPMeds: number;
  prevalentStroke: number;
  prevalentHyp: number;
  diabetes: number;
  totChol: number;
  sysBP: number;
  diaBP: number;
  BMI: number;
  heartRate: number;
  glucose: number;
}

export interface PredictRequest {
  features: PatientFeatures;
  model?: ModelName;
}

// Mirrors PredictResponse.
export interface PredictResponse {
  probability: number;
  risk_category: RiskCategory;
  model_used: string;
  high_risk_threshold: number;
  assessment_id?: number | null;
}

// Mirrors WizardPredictRequest (backend/schemas.py). The guided wizard sends height + weight
// (BMI is derived server-side) and `null` for any value the user marked "don't know", plus the
// list of those unknown feature names (CLAUDE.md §1, §2, §5).
export interface GuidedPredictRequest {
  male: number;
  age: number;
  education: number;
  currentSmoker: number;
  prevalentStroke: number;
  BPMeds: number;
  height_cm: number;
  weight_kg: number;
  // Conditional / "don't know" -> null
  cigsPerDay?: number | null;
  diabetes?: number | null;
  prevalentHyp?: number | null;
  sysBP?: number | null;
  diaBP?: number | null;
  totChol?: number | null;
  glucose?: number | null;
  heartRate?: number | null;
  unknown_fields: string[];
  model?: ModelName;
}

// How much real clinical data backs a guided estimate (CLAUDE.md §6). Drives how honestly
// the results page presents the number: "full" = show everything; "partial" = lighter on
// precise numbers; "rough" = coarse category only, no percentage / people-grid.
export type Confidence = "full" | "partial" | "rough";

// Mirrors GuidedPredictResponse.
export interface GuidedPredictResponse extends PredictResponse {
  bmi: number;
  confidence: Confidence;
  unknown_fields: string[];
  features_used: Record<string, number | null>;
}

// Mirrors PredictFromImageResponse. The frontend MUST honor `fall_back_to_manual`
// and treat `prediction === null` as "no score to show" (CLAUDE.md §2).
export interface PredictFromImageResponse {
  ocr_success: boolean;
  fall_back_to_manual: boolean;
  n_extracted: number;
  min_required_fields: number;
  extracted_fields: string[];
  missing_fields: string[];
  extracted_values: Record<string, number>;
  message: string;
  message_bn: string;
  prediction: PredictResponse | null;
  // Confidence tier for the prediction (CLAUDE.md §6), from the same logic the wizard uses.
  // null when there is no prediction (fall_back_to_manual). Lets the results page render an
  // image-sourced result identically to a wizard-sourced one.
  confidence: Confidence | null;
  raw_text_sample: string[];
}

export interface HealthResponse {
  status: string;
  default_model: string;
}

// Mirrors DoctorRecord (backend/schemas.py) — a bilingual doctor directory entry (§13.6).
export interface Doctor {
  id: number;
  name_bn: string;
  name_en: string;
  specialty_bn: string;
  specialty_en: string;
  location_bn: string;
  location_en: string;
  phone: string;
}

// Mirrors DoctorsResponse.
export interface DoctorsResponse {
  db_enabled: boolean;
  count: number;
  items: Doctor[];
}
