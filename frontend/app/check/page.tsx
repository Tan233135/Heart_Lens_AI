"use client";

// Manual entry form — the SAFE baseline path that does not depend on OCR (CLAUDE.md §13).
// Collects the 15 §5 inputs with friendly, icon-led controls, validates ranges on the
// client (the backend re-validates), then POSTs /predict and routes to the results page.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import Button from "@/components/Button";
import Icon from "@/components/Icon";
import NumberField from "@/components/fields/NumberField";
import SegmentedField from "@/components/fields/SegmentedField";
import YesNoField from "@/components/fields/YesNoField";
import { predict } from "@/lib/api";
import { ALL_FIELDS, FORM_GROUPS, type FeatureKey, type FieldDef } from "@/lib/formConfig";
import { pick, useI18n } from "@/lib/i18n";
import { saveResult } from "@/lib/resultStore";
import type { PatientFeatures } from "@/lib/types";
import styles from "./page.module.css";

type Values = Partial<Record<FeatureKey, number>>;
type Errors = Partial<Record<FeatureKey, string>>;

export default function CheckPage() {
  const { lang } = useI18n();
  const router = useRouter();

  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Fields actually shown right now (cigarettes/day only appears for smokers).
  const visibleFields = useMemo(
    () => ALL_FIELDS.filter((f) => (f.showIf ? f.showIf(values) : true)),
    [values],
  );
  const answered = visibleFields.filter((f) => values[f.key] !== undefined).length;
  const total = visibleFields.length;

  function setValue(key: FeatureKey, v: number | undefined) {
    setValues((prev) => {
      const next: Values = { ...prev, [key]: v };
      // Smoking is conditional: a non-smoker has 0 cigarettes/day (auto-filled, field hidden);
      // becoming a smoker clears it so the real count must be entered.
      if (key === "currentSmoker") {
        next.cigsPerDay = v === 0 ? 0 : undefined;
      }
      return next;
    });
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const n = { ...prev };
      delete n[key];
      return n;
    });
    setApiError(null);
  }

  function validate(): Errors {
    const next: Errors = {};
    for (const f of visibleFields) {
      const v = values[f.key];
      if (v === undefined || Number.isNaN(v)) {
        next[f.key] = lang === "bn" ? "এই তথ্যটি দিন" : "Please fill this in";
        continue;
      }
      if (f.type === "number" && f.min !== undefined && f.max !== undefined) {
        if (v < f.min || v > f.max) {
          next[f.key] =
            lang === "bn"
              ? `মান ${f.min}–${f.max} এর মধ্যে দিন`
              : `Enter a value between ${f.min} and ${f.max}`;
        }
      }
    }
    return next;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);
    const found = validate();
    setErrors(found);

    if (Object.keys(found).length > 0) {
      // Jump to the first field with a problem so the user isn't left guessing.
      const firstKey = visibleFields.find((f) => found[f.key])?.key;
      if (firstKey) {
        document.getElementById(`field-${firstKey}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
      return;
    }

    // All 15 are present and in range — safe to build the typed feature object.
    const features = Object.fromEntries(
      ALL_FIELDS.map((f) => [f.key, values[f.key] as number]),
    ) as unknown as PatientFeatures;

    setSubmitting(true);
    try {
      const response = await predict({ features }); // model omitted -> backend default (logreg)
      saveResult({ features, response, source: "manual" });
      router.push("/results");
    } catch {
      setApiError(
        lang === "bn"
          ? "দুঃখিত, ফলাফল আনতে সমস্যা হয়েছে। ইন্টারনেট দেখে আবার চেষ্টা করুন।"
          : "Sorry, something went wrong fetching the result. Check your connection and try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="container fade-in">
      <div className={styles.intro}>
        <h1 className={styles.title}>{lang === "bn" ? "তথ্য দিন" : "Enter your details"}</h1>
        <p className={styles.sub}>
          {lang === "bn"
            ? "আপনার রিপোর্ট দেখে সংখ্যাগুলো লিখুন। সব ঘর পূরণ করুন।"
            : "Copy the numbers from your report. Please fill every field."}
        </p>
        <div
          className={styles.progress}
          role="progressbar"
          aria-valuenow={answered}
          aria-valuemin={0}
          aria-valuemax={total}
        >
          <div className={styles.progressBar} style={{ width: `${(answered / total) * 100}%` }} />
        </div>
        <p className={styles.progressLabel}>
          {answered} / {total} {lang === "bn" ? "পূরণ হয়েছে" : "filled"}
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {FORM_GROUPS.map((group) => (
          <section key={group.id} className={`card ${styles.group}`}>
            <h2 className={styles.groupTitle}>
              <span className={styles.groupIcon} aria-hidden="true">
                <Icon name={group.icon} size={24} />
              </span>
              {pick(lang, group.title)}
            </h2>

            {group.fields.map((field) => {
              const hidden = field.showIf ? !field.showIf(values) : false;
              if (hidden) return null;
              return (
                <AnimatePresence key={field.key} initial={false}>
                  <motion.div
                    id={`field-${field.key}`}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    transition={{ duration: 0.2 }}
                  >
                    {renderField(field, values[field.key], errors[field.key], lang, setValue)}
                  </motion.div>
                </AnimatePresence>
              );
            })}
          </section>
        ))}

        {apiError ? (
          <p className={styles.apiError} role="alert">
            <Icon name="cross" size={20} />
            {apiError}
          </p>
        ) : null}

        <div className={styles.actions}>
          <Button
            type="submit"
            size="lg"
            fullWidth
            disabled={submitting}
            icon={<Icon name="heart" size={24} />}
          >
            {submitting
              ? lang === "bn"
                ? "অপেক্ষা করুন…"
                : "Please wait…"
              : lang === "bn"
                ? "ঝুঁকি দেখুন"
                : "See my risk"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function renderField(
  field: FieldDef,
  value: number | undefined,
  error: string | undefined,
  lang: ReturnType<typeof useI18n>["lang"],
  setValue: (key: FeatureKey, v: number | undefined) => void,
) {
  const label = pick(lang, field.label);
  const helper = field.helper ? pick(lang, field.helper) : undefined;

  if (field.type === "yesno") {
    return (
      <YesNoField
        icon={field.icon}
        label={label}
        helper={helper}
        value={value}
        error={error}
        onChange={(v) => setValue(field.key, v)}
      />
    );
  }
  if (field.type === "segmented") {
    return (
      <SegmentedField
        icon={field.icon}
        label={label}
        helper={helper}
        options={field.options ?? []}
        value={value}
        error={error}
        onChange={(v) => setValue(field.key, v)}
      />
    );
  }
  return (
    <NumberField
      icon={field.icon}
      label={label}
      helper={helper}
      value={value}
      error={error}
      min={field.min ?? 0}
      max={field.max ?? 100}
      step={field.step ?? 1}
      unit={field.unit}
      onChange={(v) => setValue(field.key, v)}
    />
  );
}
