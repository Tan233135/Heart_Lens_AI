"use client";

// Tap stepper for numeric answers (CLAUDE.md §1) — NO free-text typing. Big − / + buttons
// flank a large value. For wide ranges (cholesterol, glucose, BP) an optional second row of
// coarse ±bigStep buttons keeps the number of taps reasonable. Values render in the active
// language's digits.

import Icon from "@/components/Icon";
import { localeNum } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import styles from "./wizard.module.css";

export default function Stepper({
  value,
  min,
  max,
  step,
  bigStep,
  unit,
  format,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  bigStep?: number;
  unit?: string;
  /** Custom display formatter (e.g. height -> "160 cm · 5'3\""). Overrides the unit row. */
  format?: (v: number, lang: "bn" | "en") => string;
  onChange: (v: number) => void;
}) {
  const { lang } = useI18n();

  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const bump = (delta: number) => onChange(clamp(value + delta));

  const display = format ? format(value, lang) : localeNum(lang, value);

  return (
    <div className={styles.stepper}>
      <div className={styles.stepRow}>
        <button
          type="button"
          className={styles.stepBtn}
          onClick={() => bump(-step)}
          disabled={value <= min}
          aria-label={lang === "bn" ? "কমান" : "Decrease"}
        >
          <Icon name="minus" size={32} />
        </button>

        <div className={styles.stepValue} aria-live="polite">
          {display}
          {unit && !format ? <span className={styles.stepUnit}>{unit}</span> : null}
        </div>

        <button
          type="button"
          className={styles.stepBtn}
          onClick={() => bump(step)}
          disabled={value >= max}
          aria-label={lang === "bn" ? "বাড়ান" : "Increase"}
        >
          <Icon name="plus" size={32} />
        </button>
      </div>

      {bigStep ? (
        <div className={styles.stepBigRow}>
          <button
            type="button"
            className={`${styles.stepBtn} ${styles.stepBtnBig}`}
            onClick={() => bump(-bigStep)}
            disabled={value <= min}
            aria-label={lang === "bn" ? `${bigStep} কমান` : `Decrease by ${bigStep}`}
          >
            −{localeNum(lang, bigStep)}
          </button>
          <button
            type="button"
            className={`${styles.stepBtn} ${styles.stepBtnBig}`}
            onClick={() => bump(bigStep)}
            disabled={value >= max}
            aria-label={lang === "bn" ? `${bigStep} বাড়ান` : `Increase by ${bigStep}`}
          >
            +{localeNum(lang, bigStep)}
          </button>
        </div>
      ) : null}
    </div>
  );
}
