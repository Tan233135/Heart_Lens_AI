"use client";

// Guided wizard — the SAFE, OCR-independent path (CLAUDE.md §13), reworked for a low-literacy,
// possibly illiterate audience (CLAUDE.md §1). ONE question per screen: a large icon, the
// question in plain Bangla AND English, a prominent "play audio" button, and big tappable
// answers (icon buttons / steppers — never free-text numbers). Progress dots + a Back button
// to fix any prior answer.
//
// Maps the 15 §5 model features to plain questions (see lib/wizardConfig). Anything the user
// marks "don't know" is sent to the backend as null (NEVER a guessed value, CLAUDE.md §2),
// with the unknown-field list so the result can carry honest confidence (CLAUDE.md §6).
//
// When reached from the photo flow, it pre-seeds whatever OCR actually extracted; the user
// still steps through and confirms every value (no value is ever trusted unconfirmed, §2).

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/Button";
import Icon from "@/components/Icon";
import ChoiceGrid from "@/components/wizard/ChoiceGrid";
import ProgressDots from "@/components/wizard/ProgressDots";
import QuestionAudio from "@/components/wizard/QuestionAudio";
import Stepper from "@/components/wizard/Stepper";
import { predictGuided } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { clearOcr, loadOcr } from "@/lib/ocrStore";
import { saveResult } from "@/lib/resultStore";
import type { PredictFromImageResponse } from "@/lib/types";
import {
  buildRequest,
  STEPS,
  visibleSteps,
  type Answers,
  type Step,
} from "@/lib/wizardConfig";
import styles from "./page.module.css";

const REVIEW = "review";

// Seed answers from an OCR payload: keep only recognized numeric §5 values, and flip the
// "do you know your X numbers?" gates on when the matching clinical values were read, so the
// user lands on a pre-filled value to confirm rather than re-entering it.
function answersFromOcr(ocr: PredictFromImageResponse | null): Answers {
  if (!ocr) return {};
  const v = ocr.extracted_values ?? {};
  const num = (k: string): number | undefined =>
    typeof v[k] === "number" && Number.isFinite(v[k]) ? v[k] : undefined;

  const a: Answers = {
    male: num("male"),
    age: num("age"),
    education: num("education"),
    currentSmoker: num("currentSmoker"),
    cigsPerDay: num("cigsPerDay"),
    BPMeds: num("BPMeds"),
    prevalentStroke: num("prevalentStroke"),
    prevalentHyp: num("prevalentHyp"),
    diabetes: num("diabetes"),
    sysBP: num("sysBP"),
    diaBP: num("diaBP"),
    totChol: num("totChol"),
    glucose: num("glucose"),
  };
  if (a.sysBP !== undefined && a.diaBP !== undefined) a.knowsBP = 1;
  if (a.totChol !== undefined) a.knowsChol = 1;
  if (a.glucose !== undefined) a.knowsGlucose = 1;
  return a;
}

export default function CheckPage() {
  const { lang } = useI18n();
  const router = useRouter();

  // Consume any OCR payload ONCE on mount (so a later plain manual visit isn't pre-seeded).
  const [ocr] = useState<PredictFromImageResponse | null>(() => loadOcr());

  // Seed answers from OCR AND work out which questions OCR already answered, so we can SKIP
  // them — the user only fills the GAPS rather than re-confirming what was read (team decision).
  // Frozen at mount (deps [ocr], which is stable) so the question path doesn't shift as the
  // user answers the remaining questions. A plain manual visit (ocr === null) yields an empty
  // skip set, so the full wizard runs exactly as before.
  const init = useMemo(() => {
    const seeded = answersFromOcr(ocr);
    const skip = new Set(STEPS.filter((s) => seeded[s.field] !== undefined).map((s) => s.id));
    const firstUnanswered = visibleSteps(seeded).find((s) => !skip.has(s.id));
    return { seeded, skip, firstId: firstUnanswered ? firstUnanswered.id : REVIEW };
  }, [ocr]);

  const [answers, setAnswers] = useState<Answers>(init.seeded);
  const [currentId, setCurrentId] = useState<string>(init.firstId);
  const skipIds = init.skip;
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ocr) clearOcr();
  }, [ocr]);

  // The ordered path = the visible questions OCR did NOT already answer (+ the review screen).
  const path = useMemo(
    () => [...visibleSteps(answers).filter((s) => !skipIds.has(s.id)).map((s) => s.id), REVIEW],
    [answers, skipIds],
  );
  const idx = path.indexOf(currentId);
  const safeIdx = idx === -1 ? 0 : idx;
  const isReview = currentId === REVIEW;
  const step: Step | undefined = isReview ? undefined : STEPS.find((s) => s.id === currentId);

  // Give stepper questions a starting value the moment they appear, so "Next" always has a
  // value to carry forward even if the user doesn't touch the buttons.
  useEffect(() => {
    if (step && step.kind === "stepper" && answers[step.field] === undefined) {
      setAnswers((prev) => ({ ...prev, [step.field]: step.default }));
    }
    // Scroll back to the question top on every screen change.
    topRef.current?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  function goNext(fromId: string, a: Answers) {
    const order = [...visibleSteps(a).filter((s) => !skipIds.has(s.id)).map((s) => s.id), REVIEW];
    const i = order.indexOf(fromId);
    setCurrentId(order[Math.min(i + 1, order.length - 1)]);
    setApiError(null);
  }

  function goBack() {
    const i = path.indexOf(currentId);
    if (i > 0) setCurrentId(path[i - 1]);
  }

  function onChoose(s: Step, value: number | null) {
    const next = { ...answers, [s.field]: value };
    setAnswers(next);
    // Small pause so the chosen button visibly highlights before advancing.
    window.setTimeout(() => goNext(s.id, next), 200);
  }

  async function submit() {
    setApiError(null);
    setSubmitting(true);
    try {
      const req = buildRequest(answers);
      const response = await predictGuided(req);
      saveResult({
        features: response.features_used,
        response,
        source: "guided",
        confidence: response.confidence,
        unknownFields: response.unknown_fields,
        rough: response.confidence === "rough",
      });
      router.push("/results");
    } catch {
      setApiError(
        lang === "bn"
          ? "দুঃখিত, ফলাফল আনতে সমস্যা হয়েছে। ইন্টারনেট দেখে আবার চেষ্টা করুন।"
          : "Sorry, something went wrong. Check your connection and try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="container fade-in">
      <div ref={topRef} className={styles.topBar}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={goBack}
          disabled={safeIdx === 0}
          aria-label={lang === "bn" ? "আগের প্রশ্ন" : "Previous question"}
        >
          <Icon name="arrow-left" size={24} />
        </button>
        <ProgressDots total={path.length} current={safeIdx} />
        <span className={styles.stepCount}>
          {safeIdx + 1}/{path.length}
        </span>
      </div>

      {isReview ? (
        <ReviewScreen lang={lang} submitting={submitting} apiError={apiError} onSubmit={submit} />
      ) : step ? (
        <QuestionScreen
          key={step.id}
          step={step}
          lang={lang}
          answers={answers}
          onChoose={onChoose}
          onStep={(v) => setAnswers((prev) => ({ ...prev, [step.field]: v }))}
          onNext={() => goNext(step.id, answers)}
        />
      ) : null}
    </div>
  );
}

function QuestionScreen({
  step,
  lang,
  answers,
  onChoose,
  onStep,
  onNext,
}: {
  step: Step;
  lang: "bn" | "en";
  answers: Answers;
  onChoose: (s: Step, value: number | null) => void;
  onStep: (v: number) => void;
  onNext: () => void;
}) {
  const otherLang = lang === "bn" ? "en" : "bn";

  return (
    <section className={styles.screen}>
      <span className={styles.qIcon} aria-hidden="true">
        <Icon name={step.icon} size={56} />
      </span>

      {/* Question in BOTH languages — primary large, the other smaller beneath (CLAUDE.md §1). */}
      <h1 className={styles.question}>{step.question[lang]}</h1>
      <p className={styles.questionAlt} lang={otherLang}>
        {step.question[otherLang]}
      </p>

      <div className={styles.audioWrap}>
        <QuestionAudio clipBase={`q_${step.id}`} textBn={step.speak.bn} textEn={step.speak.en} />
      </div>

      {step.kind === "choice" ? (
        <ChoiceGrid
          options={step.options}
          columns={step.columns}
          selected={answers[step.field]}
          onSelect={(value) => onChoose(step, value)}
        />
      ) : (
        <>
          <Stepper
            value={(answers[step.field] as number) ?? step.default}
            min={step.min}
            max={step.max}
            step={step.step}
            bigStep={step.bigStep}
            unit={step.unit ? step.unit[lang] : undefined}
            format={step.format}
            onChange={onStep}
          />
          <div className={styles.nextWrap}>
            <Button size="lg" fullWidth icon={<Icon name="check" size={24} />} onClick={onNext}>
              {lang === "bn" ? "ঠিক আছে" : "OK, next"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function ReviewScreen({
  lang,
  submitting,
  apiError,
  onSubmit,
}: {
  lang: "bn" | "en";
  submitting: boolean;
  apiError: string | null;
  onSubmit: () => void;
}) {
  return (
    <section className={styles.screen}>
      <span className={`${styles.qIcon} ${styles.reviewIcon}`} aria-hidden="true">
        <Icon name="heart" size={56} />
      </span>
      <h1 className={styles.question}>
        {lang === "bn" ? "সব শেষ! ফলাফল দেখি" : "All done! Let's see your result"}
      </h1>
      <p className={styles.questionAlt} lang={lang === "bn" ? "en" : "bn"}>
        {lang === "bn" ? "All done! Let's see your result" : "সব শেষ! ফলাফল দেখি"}
      </p>
      <p className={styles.reviewHint}>
        {lang === "bn"
          ? "আগের কোনো উত্তর বদলাতে চাইলে উপরে বাঁ দিকের তীর চাপুন।"
          : "To change an earlier answer, use the back arrow at the top left."}
      </p>

      <div className={styles.audioWrap}>
        <QuestionAudio
          clipBase="q_review"
          textBn="সব প্রশ্নের উত্তর হয়ে গেছে। ফলাফল দেখতে নিচের বোতাম চাপুন।"
          textEn="All questions are answered. Press the button below to see your result."
        />
      </div>

      {apiError ? (
        <p className={styles.apiError} role="alert">
          <Icon name="cross" size={20} />
          {apiError}
        </p>
      ) : null}

      <div className={styles.nextWrap}>
        <Button
          size="lg"
          fullWidth
          disabled={submitting}
          icon={<Icon name="heart" size={24} />}
          onClick={onSubmit}
        >
          {submitting
            ? lang === "bn"
              ? "অপেক্ষা করুন…"
              : "Please wait…"
            : lang === "bn"
              ? "আমার ঝুঁকি দেখুন"
              : "See my risk"}
        </Button>
      </div>
    </section>
  );
}
