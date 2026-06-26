"use client";

// The mandatory medical disclaimer (CLAUDE.md §2): every results view must show, in
// plain language AND in Bangla, that this is a screening estimate and not a diagnosis.
// Provided here as a shared component so it can never be forgotten on a feature page.
// In the persistent footer we show it in the CURRENT language; results pages should
// additionally show it in Bangla regardless of the toggle.

import { useI18n } from "@/lib/i18n";
import styles from "./Disclaimer.module.css";

export default function Disclaimer({ alwaysBilingual = false }: { alwaysBilingual?: boolean }) {
  const { t, lang } = useI18n();
  const showBangla = alwaysBilingual || lang === "bn";
  const showEnglish = alwaysBilingual || lang === "en";

  return (
    <div className={styles.disclaimer} role="note">
      <InfoIcon />
      <div>
        {showBangla ? (
          <p lang="bn" className={styles.line}>
            {strings.bn}
          </p>
        ) : null}
        {showEnglish ? (
          <p lang="en" className={styles.line}>
            {strings.en}
          </p>
        ) : null}
        {/* Fallback when neither matched (shouldn't happen) — show current language. */}
        {!showBangla && !showEnglish ? <p className={styles.line}>{t("disclaimer")}</p> : null}
      </div>
    </div>
  );
}

const strings = {
  bn: "এটি একটি প্রাথমিক ধারণা, রোগ নির্ণয় নয়। অনুগ্রহ করে একজন ডাক্তার দেখান।",
  en: "This is a screening estimate, not a diagnosis. Please see a doctor.",
};

function InfoIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={styles.icon}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}
