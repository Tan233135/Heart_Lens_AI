// Declarative definition of the guided wizard (CLAUDE.md §1, §5).
//
// ONE question per screen, mapped to the 15 model features exactly as specified. No free-text
// number entry: every numeric answer is a tap stepper or a tappable picture/range option.
// Clinical values the user may not know are answerable with "I don't know" (-> null, NEVER a
// guessed value, CLAUDE.md §2); BMI is not asked at all — we collect height + weight and the
// backend derives it.

import type { IconName } from "@/components/Icon";
import type { Bilingual } from "./i18n";
import type { GuidedPredictRequest } from "./types";

// Everything the wizard collects. Gate answers (knowsBP/knowsChol/knowsGlucose) are 1 = "I
// know the number" / 0 = "I don't", and decide whether the follow-up number screen appears.
// `null` on a yes/no question means "don't know" -> sent to the backend as null.
export interface Answers {
  male?: number;
  age?: number;
  education?: number;
  currentSmoker?: number;
  cigsPerDay?: number;
  diabetes?: number | null;
  prevalentStroke?: number;
  prevalentHyp?: number | null;
  BPMeds?: number;
  height_cm?: number;
  weight_kg?: number;
  knowsBP?: number;
  sysBP?: number;
  diaBP?: number;
  knowsChol?: number;
  totChol?: number;
  knowsGlucose?: number;
  glucose?: number;
}

export type AnswerKey = keyof Answers;

export interface ChoiceOption {
  // `null` = an explicit "don't know" answer (kept distinct from 0/"no").
  value: number | null;
  label: Bilingual;
  icon?: IconName;
}

interface BaseStep {
  id: string;
  field: AnswerKey;
  icon: IconName;
  /** The on-screen question, shown in BOTH languages (CLAUDE.md §1). */
  question: Bilingual;
  /** What the "play audio" button reads aloud (plain, conversational). */
  speak: Bilingual;
  /** Only show this screen when the predicate holds (conditional follow-ups). */
  visibleIf?: (a: Answers) => boolean;
}

export interface ChoiceStep extends BaseStep {
  kind: "choice";
  options: ChoiceOption[];
  /** 1 column (stacked) by default; 2 reads better for paired / 4-up options. */
  columns?: 1 | 2;
}

export interface StepperStep extends BaseStep {
  kind: "stepper";
  min: number;
  max: number;
  step: number;
  /** Optional coarse step for a second row of ± buttons (big ranges like cholesterol). */
  bigStep?: number;
  default: number;
  unit?: Bilingual;
  /** Custom value formatter (e.g. height -> "160 cm · 5'3\""). Receives the raw number. */
  format?: (v: number, lang: "bn" | "en") => string;
}

export type Step = ChoiceStep | StepperStep;

const yesNo = (yes = 1, no = 0): ChoiceOption[] => [
  { value: no, label: { bn: "না", en: "No" }, icon: "cross" },
  { value: yes, label: { bn: "হ্যাঁ", en: "Yes" }, icon: "check" },
];

const yesNoDontKnow = (): ChoiceOption[] => [
  { value: 0, label: { bn: "না", en: "No" }, icon: "cross" },
  { value: 1, label: { bn: "হ্যাঁ", en: "Yes" }, icon: "check" },
  { value: null, label: { bn: "জানি না", en: "Don't know" }, icon: "question" },
];

// Friendly height format: metric first (what the model uses) with an at-a-glance ft/in echo.
function formatHeight(cm: number, lang: "bn" | "en"): string {
  const totalIn = Math.round(cm / 2.54);
  const ft = Math.floor(totalIn / 12);
  const inch = totalIn % 12;
  const cmStr = lang === "bn" ? toBn(cm) : String(cm);
  const ftStr = lang === "bn" ? `${toBn(ft)}′${toBn(inch)}″` : `${ft}′${inch}″`;
  return `${cmStr} ${lang === "bn" ? "সেমি" : "cm"} · ${ftStr}`;
}

const BN = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
function toBn(v: number | string): string {
  return String(v).replace(/[0-9]/g, (d) => BN[Number(d)]);
}

export const STEPS: Step[] = [
  {
    id: "male",
    field: "male",
    kind: "choice",
    icon: "person",
    columns: 2,
    question: { bn: "আপনি কি একজন পুরুষ নাকি নারী?", en: "Are you a man or a woman?" },
    speak: { bn: "আপনি কি একজন পুরুষ নাকি নারী?", en: "Are you a man or a woman?" },
    options: [
      { value: 0, label: { bn: "নারী", en: "Woman" }, icon: "female" },
      { value: 1, label: { bn: "পুরুষ", en: "Man" }, icon: "male" },
    ],
  },
  {
    id: "age",
    field: "age",
    kind: "stepper",
    icon: "calendar",
    question: { bn: "আপনার বয়স কত?", en: "How old are you?" },
    speak: { bn: "আপনার বয়স কত? নিচের বোতাম টিপে ঠিক করুন।", en: "How old are you? Use the buttons to set it." },
    min: 18,
    max: 110,
    step: 1,
    bigStep: 5,
    default: 45,
    unit: { bn: "বছর", en: "years" },
  },
  {
    id: "education",
    field: "education",
    kind: "choice",
    icon: "book",
    columns: 2,
    question: { bn: "আপনি কতদূর পড়াশোনা করেছেন?", en: "How far did you study?" },
    speak: { bn: "আপনি কতদূর পড়াশোনা করেছেন?", en: "How far did you study?" },
    options: [
      { value: 1, label: { bn: "পড়িনি", en: "None" }, icon: "cross" },
      { value: 2, label: { bn: "প্রাথমিক", en: "Primary" }, icon: "book" },
      { value: 3, label: { bn: "মাধ্যমিক", en: "Secondary" }, icon: "clipboard" },
      { value: 4, label: { bn: "কলেজ", en: "College" }, icon: "graduation" },
    ],
  },
  {
    id: "currentSmoker",
    field: "currentSmoker",
    kind: "choice",
    icon: "cigarette",
    columns: 2,
    question: { bn: "আপনি কি ধূমপান করেন?", en: "Do you smoke?" },
    speak: { bn: "আপনি কি ধূমপান করেন?", en: "Do you smoke?" },
    options: yesNo(),
  },
  {
    id: "cigsPerDay",
    field: "cigsPerDay",
    kind: "choice",
    icon: "cigarette",
    visibleIf: (a) => a.currentSmoker === 1,
    question: { bn: "দিনে আনুমানিক কয়টি খান?", en: "About how many a day?" },
    speak: { bn: "দিনে আনুমানিক কয়টি সিগারেট খান?", en: "About how many cigarettes a day?" },
    options: [
      { value: 3, label: { bn: "কয়েকটি", en: "A few" } },
      { value: 10, label: { bn: "আধা প্যাকেট", en: "Half a pack" } },
      { value: 20, label: { bn: "এক প্যাকেট", en: "A full pack" } },
      { value: 30, label: { bn: "তার বেশি", en: "More" } },
    ],
    columns: 2,
  },
  {
    id: "diabetes",
    field: "diabetes",
    kind: "choice",
    icon: "droplet",
    columns: 1,
    question: {
      bn: "ডাক্তার কি বলেছেন আপনার সুগার (ডায়াবেটিস) আছে?",
      en: "Has a doctor said you have sugar disease (diabetes)?",
    },
    speak: {
      bn: "ডাক্তার কি কখনো বলেছেন আপনার সুগার বা ডায়াবেটিস আছে?",
      en: "Has a doctor ever said you have sugar disease, or diabetes?",
    },
    options: yesNoDontKnow(),
  },
  {
    id: "prevalentStroke",
    field: "prevalentStroke",
    kind: "choice",
    icon: "brain",
    columns: 2,
    question: { bn: "আপনার কি কখনো স্ট্রোক হয়েছে?", en: "Have you ever had a stroke?" },
    speak: { bn: "আপনার কি কখনো স্ট্রোক হয়েছে?", en: "Have you ever had a stroke?" },
    options: yesNo(),
  },
  {
    id: "prevalentHyp",
    field: "prevalentHyp",
    kind: "choice",
    icon: "gauge",
    columns: 1,
    question: { bn: "আপনার কি উচ্চ রক্তচাপ আছে?", en: "Do you have high blood pressure?" },
    speak: { bn: "আপনার কি উচ্চ রক্তচাপ আছে?", en: "Do you have high blood pressure?" },
    options: yesNoDontKnow(),
  },
  {
    id: "BPMeds",
    field: "BPMeds",
    kind: "choice",
    icon: "pill",
    columns: 2,
    question: {
      bn: "আপনি কি রক্তচাপের ওষুধ খান?",
      en: "Do you take medicine for blood pressure?",
    },
    speak: { bn: "আপনি কি রক্তচাপের জন্য কোনো ওষুধ খান?", en: "Do you take any medicine for blood pressure?" },
    options: yesNo(),
  },
  {
    id: "height_cm",
    field: "height_cm",
    kind: "stepper",
    icon: "ruler",
    question: { bn: "আপনার উচ্চতা কত?", en: "How tall are you?" },
    speak: { bn: "আপনার উচ্চতা কত? বোতাম টিপে ঠিক করুন।", en: "How tall are you? Use the buttons to set it." },
    min: 120,
    max: 215,
    step: 1,
    bigStep: 5,
    default: 160,
    format: formatHeight,
  },
  {
    id: "weight_kg",
    field: "weight_kg",
    kind: "stepper",
    icon: "scale",
    question: { bn: "আপনার ওজন কত?", en: "How much do you weigh?" },
    speak: { bn: "আপনার ওজন কত কেজি? বোতাম টিপে ঠিক করুন।", en: "How much do you weigh in kilograms? Use the buttons." },
    min: 25,
    max: 200,
    step: 1,
    bigStep: 5,
    default: 60,
    unit: { bn: "কেজি", en: "kg" },
  },
  {
    id: "knowsBP",
    field: "knowsBP",
    kind: "choice",
    icon: "gauge",
    columns: 2,
    question: {
      bn: "আপনি কি আপনার রক্তচাপের সংখ্যা জানেন?",
      en: "Do you know your blood pressure numbers?",
    },
    speak: {
      bn: "আপনি কি আপনার রক্তচাপের সংখ্যাগুলো জানেন? না জানলে অসুবিধা নেই।",
      en: "Do you know your blood pressure numbers? It's okay if you don't.",
    },
    options: [
      { value: 0, label: { bn: "জানি না", en: "I don't know" }, icon: "question" },
      { value: 1, label: { bn: "জানি", en: "I know them" }, icon: "check" },
    ],
  },
  {
    id: "sysBP",
    field: "sysBP",
    kind: "stepper",
    icon: "gauge",
    visibleIf: (a) => a.knowsBP === 1,
    question: { bn: "রক্তচাপ — উপরের (বড়) সংখ্যা", en: "Blood pressure — top (bigger) number" },
    speak: { bn: "আপনার রক্তচাপের উপরের, বড় সংখ্যাটি দিন।", en: "Enter the top, bigger blood pressure number." },
    min: 80,
    max: 250,
    step: 1,
    bigStep: 10,
    default: 120,
    unit: { bn: "", en: "" },
  },
  {
    id: "diaBP",
    field: "diaBP",
    kind: "stepper",
    icon: "gauge",
    visibleIf: (a) => a.knowsBP === 1,
    question: { bn: "রক্তচাপ — নিচের (ছোট) সংখ্যা", en: "Blood pressure — bottom (smaller) number" },
    speak: { bn: "আপনার রক্তচাপের নিচের, ছোট সংখ্যাটি দিন।", en: "Enter the bottom, smaller blood pressure number." },
    min: 40,
    max: 160,
    step: 1,
    bigStep: 5,
    default: 80,
    unit: { bn: "", en: "" },
  },
  {
    id: "knowsChol",
    field: "knowsChol",
    kind: "choice",
    icon: "flask",
    columns: 2,
    question: {
      bn: "আপনি কি আপনার কোলেস্টেরলের সংখ্যা জানেন?",
      en: "Do you know your cholesterol number?",
    },
    speak: {
      bn: "আপনি কি আপনার কোলেস্টেরলের সংখ্যা জানেন? না জানলে অসুবিধা নেই।",
      en: "Do you know your cholesterol number? It's okay if you don't.",
    },
    options: [
      { value: 0, label: { bn: "জানি না", en: "I don't know" }, icon: "question" },
      { value: 1, label: { bn: "জানি", en: "I know it" }, icon: "check" },
    ],
  },
  {
    id: "totChol",
    field: "totChol",
    kind: "stepper",
    icon: "flask",
    visibleIf: (a) => a.knowsChol === 1,
    question: { bn: "মোট কোলেস্টেরল", en: "Total cholesterol" },
    speak: { bn: "আপনার মোট কোলেস্টেরলের সংখ্যাটি দিন।", en: "Enter your total cholesterol number." },
    min: 100,
    max: 400,
    step: 5,
    bigStep: 25,
    default: 200,
    unit: { bn: "mg/dL", en: "mg/dL" },
  },
  {
    id: "knowsGlucose",
    field: "knowsGlucose",
    kind: "choice",
    icon: "droplet",
    columns: 2,
    question: {
      bn: "আপনি কি আপনার রক্তে শর্করার (সুগার) সংখ্যা জানেন?",
      en: "Do you know your blood sugar number?",
    },
    speak: {
      bn: "আপনি কি আপনার রক্তে শর্করা বা সুগারের সংখ্যা জানেন? না জানলে অসুবিধা নেই।",
      en: "Do you know your blood sugar number? It's okay if you don't.",
    },
    options: [
      { value: 0, label: { bn: "জানি না", en: "I don't know" }, icon: "question" },
      { value: 1, label: { bn: "জানি", en: "I know it" }, icon: "check" },
    ],
  },
  {
    id: "glucose",
    field: "glucose",
    kind: "stepper",
    icon: "droplet",
    visibleIf: (a) => a.knowsGlucose === 1,
    question: { bn: "রক্তে শর্করা (গ্লুকোজ)", en: "Blood sugar (glucose)" },
    speak: { bn: "আপনার রক্তে শর্করার সংখ্যাটি দিন।", en: "Enter your blood sugar number." },
    min: 50,
    max: 400,
    step: 5,
    bigStep: 20,
    default: 100,
    unit: { bn: "mg/dL", en: "mg/dL" },
  },
];

// The ordered visible steps for the current answers (conditional follow-ups appear/disappear).
export function visibleSteps(a: Answers): Step[] {
  return STEPS.filter((s) => (s.visibleIf ? s.visibleIf(a) : true));
}

// Turn the collected answers into the API request: "don't know" / ungiven clinical values
// become null (NEVER a guessed value, CLAUDE.md §2) and are listed in unknown_fields so the
// result can be labelled with honest confidence (CLAUDE.md §6). heartRate is never asked.
export function buildRequest(a: Answers): GuidedPredictRequest {
  const unknown: string[] = [];

  const markIfNull = (key: string, v: number | null | undefined): number | null => {
    if (v === null || v === undefined) {
      unknown.push(key);
      return null;
    }
    return v;
  };

  const diabetes = markIfNull("diabetes", a.diabetes);
  const prevalentHyp = markIfNull("prevalentHyp", a.prevalentHyp);

  const knowsBP = a.knowsBP === 1;
  const sysBP = knowsBP ? a.sysBP ?? null : null;
  const diaBP = knowsBP ? a.diaBP ?? null : null;
  if (!knowsBP || sysBP === null) unknown.push("sysBP");
  if (!knowsBP || diaBP === null) unknown.push("diaBP");

  const knowsChol = a.knowsChol === 1;
  const totChol = knowsChol ? a.totChol ?? null : null;
  if (!knowsChol || totChol === null) unknown.push("totChol");

  const knowsGlucose = a.knowsGlucose === 1;
  const glucose = knowsGlucose ? a.glucose ?? null : null;
  if (!knowsGlucose || glucose === null) unknown.push("glucose");

  // heartRate is intentionally never asked (CLAUDE.md task) — always unknown.
  unknown.push("heartRate");

  return {
    male: a.male as number,
    age: a.age as number,
    education: a.education as number,
    currentSmoker: a.currentSmoker as number,
    prevalentStroke: a.prevalentStroke as number,
    BPMeds: a.BPMeds as number,
    height_cm: a.height_cm as number,
    weight_kg: a.weight_kg as number,
    // Non-smoker -> 0/day; smoker's bucketed estimate otherwise.
    cigsPerDay: a.currentSmoker === 1 ? a.cigsPerDay ?? null : 0,
    diabetes,
    prevalentHyp,
    sysBP,
    diaBP,
    totChol,
    glucose,
    heartRate: null,
    unknown_fields: Array.from(new Set(unknown)),
  };
}
