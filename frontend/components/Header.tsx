"use client";

// Shared app header: brand mark + name on the left, language toggle on the right.
// Part of the persistent shell wrapped around every page.

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import LanguageToggle from "./LanguageToggle";
import styles from "./Header.module.css";

export default function Header() {
  const { t, lang } = useI18n();
  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        {/* Brand links home — the logo is the universal "back to start" affordance,
            and a tap target that needs no reading (CLAUDE.md §1). */}
        <Link
          href="/"
          className={styles.brand}
          aria-label={lang === "bn" ? "হোম পেজে যান" : "Go to home page"}
        >
          <HeartMark />
          <span className={styles.name}>{t("appName")}</span>
        </Link>
        <LanguageToggle />
      </div>
    </header>
  );
}

// Simple inline SVG heart-in-lens mark — no image request, scales crisply.
function HeartMark() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="var(--c-primary)" />
      <path
        d="M12 17.5s-4.7-3-4.7-6.1A2.6 2.6 0 0 1 12 9.7a2.6 2.6 0 0 1 4.7 1.7c0 3.1-4.7 6.1-4.7 6.1Z"
        fill="#ffffff"
      />
    </svg>
  );
}
