"use client";

// Base landing page — demonstrates the shared shell and design system only.
// No feature flows yet (manual form, OCR, results come later, CLAUDE.md §13).

import { useRouter } from "next/navigation";
import AudioButton from "@/components/AudioButton";
import Button from "@/components/Button";
import Icon from "@/components/Icon";
import { useI18n } from "@/lib/i18n";
import styles from "./page.module.css";

export default function HomePage() {
  const { t, lang } = useI18n();
  const router = useRouter();

  return (
    <div className="container fade-in">
      <section className={styles.hero}>
        <h1 className={styles.title}>{t("appName")}</h1>
        <p className={styles.tagline}>{t("tagline")}</p>

        {/* Spoken welcome in the active language (CLAUDE.md §1) — for users who read with difficulty.
            Tries to autoplay on load; browsers commonly BLOCK audio before any user interaction, so
            on a cold first load it may stay silent until tapped — the button remains for that. */}
        <AudioButton
          clip="welcome"
          labelBn="স্বাগতম শুনুন"
          labelEn="Play welcome"
          autoPlay
        />

        {/* Primary flow: photo of the report (OCR). It always lands on the confirm/manual
            step, so it's safe even when OCR fails (CLAUDE.md §2). */}
        <Button
          size="lg"
          fullWidth
          icon={<CameraIcon />}
          onClick={() => router.push("/scan")}
        >
          {lang === "bn" ? "রিপোর্টের ছবি তুলুন" : "Upload report photo"}
        </Button>

        {/* Safe baseline: type the values by hand (no OCR dependency, CLAUDE.md §13). */}
        <Button
          size="lg"
          fullWidth
          variant="secondary"
          className={styles.uploadBtn}
          icon={<Icon name="edit" size={24} />}
          onClick={() => router.push("/check")}
        >
          {lang === "bn" ? "হাতে তথ্য দিন" : "Enter details by hand"}
        </Button>
      </section>

      {/* Design-system preview: confirms the risk palette + button variants render.
          This block is scaffolding for the team and will be removed once real
          feature pages exist. */}
      <section className={`card ${styles.preview}`} aria-label="Design system preview">
        <h2 className={styles.previewTitle}>Design system</h2>

        <div className={styles.swatches}>
          <RiskSwatch label="Low" varName="--c-risk-low" bgVar="--c-risk-low-bg" />
          <RiskSwatch label="Moderate" varName="--c-risk-moderate" bgVar="--c-risk-moderate-bg" />
          <RiskSwatch label="High" varName="--c-risk-high" bgVar="--c-risk-high-bg" />
        </div>

        <div className={styles.btnRow}>
          <Button variant="primary" size="md">
            Primary
          </Button>
          <Button variant="secondary" size="md">
            Secondary
          </Button>
          <Button variant="ghost" size="md">
            Ghost
          </Button>
        </div>
      </section>
    </div>
  );
}

function RiskSwatch({
  label,
  varName,
  bgVar,
}: {
  label: string;
  varName: string;
  bgVar: string;
}) {
  return (
    <div
      className={styles.swatch}
      style={{
        background: `var(${bgVar})`,
        borderColor: `var(${varName})`,
        color: `var(${varName})`,
      }}
    >
      {label}
    </div>
  );
}

function CameraIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
