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
  raw_text_sample: string[];
}

export interface HealthResponse {
  status: string;
  default_model: string;
}
