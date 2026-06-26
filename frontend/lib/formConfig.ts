// Declarative config for the manual entry form (the safe, OCR-independent path).
// The 15 inputs come from CLAUDE.md §5. The min/max bounds MUST match the backend's
// FEATURE_BOUNDS (backend/schemas.py) so client and server validation never drift —
// the backend re-validates and will 422 anything outside these regardless.

import type { Bilingual } from "./i18n";
import type { IconName } from "@/components/Icon";
import type { PatientFeatures } from "./types";

export type FeatureKey = keyof PatientFeatures;
export type FieldType = "yesno" | "segmented" | "number";

export interface SegOption {
  value: number;
  label: Bilingual;
  icon?: IconName;
}

export interface FieldDef {
  key: FeatureKey;
  type: FieldType;
  label: Bilingual;
  icon: IconName;
  helper?: Bilingual;
  // number-only
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  // segmented-only
  options?: SegOption[];
  // Conditional visibility (e.g. cigarettes/day only if a current smoker).
  showIf?: (f: Partial<PatientFeatures>) => boolean;
}

export interface FieldGroup {
  id: string;
  title: Bilingual;
  icon: IconName;
  fields: FieldDef[];
}

const YESNO = (key: FeatureKey, label: Bilingual, icon: IconName, helper?: Bilingual): FieldDef => ({
  key,
  type: "yesno",
  label,
  icon,
  helper,
});

export const FORM_GROUPS: FieldGroup[] = [
  {
    id: "about",
    title: { bn: "আপনার সম্পর্কে", en: "About you" },
    icon: "person",
    fields: [
      {
        key: "male",
        type: "segmented",
        label: { bn: "লিঙ্গ", en: "Sex" },
        icon: "person",
        options: [
          { value: 0, label: { bn: "নারী", en: "Female" }, icon: "female" },
          { value: 1, label: { bn: "পুরুষ", en: "Male" }, icon: "male" },
        ],
      },
      {
        key: "age",
        type: "number",
        label: { bn: "বয়স", en: "Age" },
        icon: "calendar",
        unit: "",
        min: 18,
        max: 120,
        step: 1,
        helper: { bn: "বছরে", en: "in years" },
      },
      {
        key: "education",
        type: "segmented",
        label: { bn: "শিক্ষার স্তর", en: "Education level" },
        icon: "book",
        helper: { bn: "১ = সবচেয়ে কম, ৪ = সবচেয়ে বেশি", en: "1 = least, 4 = most" },
        options: [
          { value: 1, label: { bn: "১", en: "1" } },
          { value: 2, label: { bn: "২", en: "2" } },
          { value: 3, label: { bn: "৩", en: "3" } },
          { value: 4, label: { bn: "৪", en: "4" } },
        ],
      },
    ],
  },
  {
    id: "smoking",
    title: { bn: "ধূমপান", en: "Smoking" },
    icon: "cigarette",
    fields: [
      YESNO("currentSmoker", { bn: "আপনি কি ধূমপান করেন?", en: "Do you smoke?" }, "cigarette"),
      {
        key: "cigsPerDay",
        type: "number",
        label: { bn: "দিনে কয়টি সিগারেট?", en: "Cigarettes per day" },
        icon: "cigarette",
        min: 0,
        max: 100,
        step: 1,
        helper: { bn: "প্রতিদিন গড়ে", en: "average per day" },
        showIf: (f) => f.currentSmoker === 1,
      },
    ],
  },
  {
    id: "history",
    title: { bn: "স্বাস্থ্য ইতিহাস", en: "Health history" },
    icon: "clipboard",
    fields: [
      YESNO(
        "prevalentHyp",
        { bn: "উচ্চ রক্তচাপ আছে?", en: "High blood pressure?" },
        "gauge",
      ),
      YESNO(
        "BPMeds",
        { bn: "রক্তচাপের ওষুধ খান?", en: "On blood-pressure medicine?" },
        "pill",
      ),
      YESNO(
        "prevalentStroke",
        { bn: "আগে কখনো স্ট্রোক হয়েছে?", en: "Ever had a stroke?" },
        "brain",
      ),
      YESNO("diabetes", { bn: "ডায়াবেটিস আছে?", en: "Diabetes?" }, "droplet"),
    ],
  },
  {
    id: "measurements",
    title: { bn: "পরিমাপ ও পরীক্ষা", en: "Measurements & tests" },
    icon: "heart",
    fields: [
      {
        key: "sysBP",
        type: "number",
        label: { bn: "রক্তচাপ — উপরের সংখ্যা", en: "Blood pressure — top number" },
        icon: "gauge",
        unit: "mmHg",
        min: 70,
        max: 300,
        step: 1,
        helper: { bn: "সিস্টোলিক", en: "systolic" },
      },
      {
        key: "diaBP",
        type: "number",
        label: { bn: "রক্তচাপ — নিচের সংখ্যা", en: "Blood pressure — bottom number" },
        icon: "gauge",
        unit: "mmHg",
        min: 40,
        max: 200,
        step: 1,
        helper: { bn: "ডায়াস্টোলিক", en: "diastolic" },
      },
      {
        key: "totChol",
        type: "number",
        label: { bn: "মোট কোলেস্টেরল", en: "Total cholesterol" },
        icon: "flask",
        unit: "mg/dL",
        min: 80,
        max: 600,
        step: 1,
      },
      {
        key: "glucose",
        type: "number",
        label: { bn: "রক্তে শর্করা (গ্লুকোজ)", en: "Blood sugar (glucose)" },
        icon: "droplet",
        unit: "mg/dL",
        min: 30,
        max: 600,
        step: 1,
      },
      {
        key: "BMI",
        type: "number",
        label: { bn: "বিএমআই", en: "BMI" },
        icon: "scale",
        unit: "kg/m²",
        min: 10,
        max: 70,
        step: 0.1,
        helper: { bn: "শরীরের ভর সূচক", en: "body mass index" },
      },
      {
        key: "heartRate",
        type: "number",
        label: { bn: "হৃদস্পন্দন", en: "Heart rate" },
        icon: "heart",
        unit: "bpm",
        min: 30,
        max: 250,
        step: 1,
        helper: { bn: "মিনিটে স্পন্দন", en: "beats per minute" },
      },
    ],
  },
];

// Flat list of every field, in schema order, for validation/serialization.
export const ALL_FIELDS: FieldDef[] = FORM_GROUPS.flatMap((g) => g.fields);
