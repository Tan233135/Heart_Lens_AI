"use client";

// Bangla / English toggle. Shows the language you'd switch TO, in that language's
// own script, so it's recognizable without reading the current UI (CLAUDE.md §1).

import { useI18n } from "@/lib/i18n";
import styles from "./LanguageToggle.module.css";

export default function LanguageToggle() {
  const { lang, toggleLang } = useI18n();
  const switchTo = lang === "bn" ? "English" : "বাংলা";

  return (
    <button
      type="button"
      onClick={toggleLang}
      className={styles.toggle}
      // Always describe the action in both scripts for accessibility.
      aria-label={`Switch language to ${switchTo} / ভাষা পরিবর্তন করুন`}
    >
      <GlobeIcon />
      <span className={styles.label}>{switchTo}</span>
    </button>
  );
}

function GlobeIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
    </svg>
  );
}
