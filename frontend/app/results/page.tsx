"use client";

// Results view (CLAUDE.md §2, §6). Safety rules made concrete here:
//   - LEAD with a color-coded risk CATEGORY band, never a single scary decimal — the model
//     is not yet calibration-verified (§6), so the precise probability is deliberately not
//     the headline. It appears only inside the carefully-framed, illustrative people-grid.
//   - The people-grid ("X out of 100 people like you") is labelled an ILLUSTRATION, not an
//     exact count (§6).
//   - Bangla (or English) AUDIO narration of the result (§1 — many users read with difficulty).
//   - The mandatory disclaimer shows in BOTH languages, always (§2), and we push toward a
//     real doctor — more urgently for elevated risk.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import Button from "@/components/Button";
import Icon, { type IconName } from "@/components/Icon";
import Disclaimer from "@/components/Disclaimer";
import AudioNarration from "@/components/results/AudioNarration";
import PeopleGrid from "@/components/results/PeopleGrid";
import { localeNum, toBnDigits } from "@/lib/format";
import { useI18n, type Bilingual, type Lang } from "@/lib/i18n";
import { clearResult, loadResult, type StoredResult } from "@/lib/resultStore";
import { RISK_ORDER, categoryFromProbability, resolveBands } from "@/lib/riskConfig";
import type { RiskCategory } from "@/lib/types";
import styles from "./page.module.css";

interface CatMeta {
  label: Bilingual;
  short: Bilingual;
  icon: IconName;
  advice: Bilingual;
  className: string;
}

const CATEGORY: Record<RiskCategory, CatMeta> = {
  low: {
    label: { bn: "কম ঝুঁকি", en: "Low risk" },
    short: { bn: "কম", en: "Low" },
    icon: "check",
    advice: {
      bn: "ভালো লক্ষণ। স্বাস্থ্যকর জীবনযাপন চালিয়ে যান।",
      en: "Good sign. Keep up a healthy lifestyle.",
    },
    className: styles.low,
  },
  moderate: {
    label: { bn: "মাঝারি ঝুঁকি", en: "Moderate risk" },
    short: { bn: "মাঝারি", en: "Moderate" },
    icon: "gauge",
    advice: {
      bn: "কিছুটা ঝুঁকি আছে। একজন ডাক্তারের সাথে কথা বলুন।",
      en: "Some risk. Please talk to a doctor.",
    },
    className: styles.moderate,
  },
  high: {
    label: { bn: "বেশি ঝুঁকি", en: "High risk" },
    short: { bn: "বেশি", en: "High" },
    icon: "heart",
    advice: {
      bn: "ঝুঁকি বেশি। অনুগ্রহ করে শীঘ্রই একজন ডাক্তার দেখান।",
      en: "Risk is high. Please see a doctor soon.",
    },
    className: styles.high,
  },
};

export default function ResultsPage() {
  const { lang } = useI18n();
  const router = useRouter();
  const [data, setData] = useState<StoredResult | null | undefined>(undefined);

  useEffect(() => {
    setData(loadResult());
  }, []);

  if (data === undefined) {
    return <div className="container" aria-busy="true" />;
  }

  if (data === null) {
    return (
      <div className="container fade-in">
        <div className={`card ${styles.empty}`}>
          <p>
            {lang === "bn"
              ? "কোনো ফলাফল পাওয়া যায়নি। অনুগ্রহ করে তথ্য দিন।"
              : "No result to show. Please enter your details first."}
          </p>
          <Button size="lg" fullWidth onClick={() => router.push("/check")} icon={<Icon name="edit" size={22} />}>
            {lang === "bn" ? "তথ্য দিন" : "Enter details"}
          </Button>
        </div>
      </div>
    );
  }

  return <Result data={data} lang={lang} router={router} />;
}

function Result({
  data,
  lang,
  router,
}: {
  data: StoredResult;
  lang: Lang;
  router: ReturnType<typeof useRouter>;
}) {
  const { response } = data;
  const category = response.risk_category; // backend is authoritative for the category
  const meta = CATEGORY[category];
  const count = Math.max(0, Math.min(100, Math.round(response.probability * 100)));
  const bands = useMemo(() => resolveBands(response), [response]);

  // Dev-only guard: warn if the frontend's display bands disagree with the backend's
  // category, which would mean the env thresholds have drifted from the server's.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      const derived = categoryFromProbability(response.probability, bands);
      if (derived !== category) {
        // eslint-disable-next-line no-console
        console.warn(
          `[results] display bands (${derived}) disagree with backend category (${category}). ` +
            "Align NEXT_PUBLIC_*_RISK_THRESHOLD with the backend.",
        );
      }
    }
  }, [response.probability, bands, category]);

  const countText = localeNum(lang, count);

  const gridLabel =
    lang === "bn"
      ? `আপনার মতো ১০০ জনের মধ্যে আনুমানিক ${countText} জন`
      : `About ${count} out of 100 people like you`;

  const narrationBn =
    `${meta.label.bn}। ${meta.advice.bn} ` +
    `আপনার মতো ১০০ জনের মধ্যে আনুমানিক ${toBnDigits(count)} জনের ঝুঁকি থাকতে পারে। ` +
    `এটি একটি প্রাথমিক ধারণা, রোগ নির্ণয় নয়। অনুগ্রহ করে একজন ডাক্তার দেখান।`;
  const narrationEn =
    `${meta.label.en}. ${meta.advice.en} ` +
    `Out of 100 people like you, about ${count} may be at risk. ` +
    `This is a screening estimate, not a diagnosis. Please see a doctor.`;

  return (
    <div className="container fade-in">
      {/* 1) Color-coded category card — the primary output (§6). No bare decimal here. */}
      <motion.section
        className={`${styles.riskCard} ${meta.className}`}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        aria-label={meta.label[lang]}
      >
        <span className={styles.riskIcon} aria-hidden="true">
          <Icon name={meta.icon} size={48} />
        </span>
        <h1 className={styles.riskLabel}>{meta.label[lang]}</h1>
        <p className={styles.advice}>{meta.advice[lang]}</p>

        {/* Band indicator: shows this is one of three BANDS, reinforcing category over point. */}
        <div className={styles.bands} role="group" aria-label={lang === "bn" ? "ঝুঁকির স্তর" : "Risk level"}>
          {RISK_ORDER.map((c) => (
            <span
              key={c}
              className={`${styles.band} ${styles[`band_${c}`]} ${c === category ? styles.bandActive : ""}`}
            >
              {CATEGORY[c].short[lang]}
            </span>
          ))}
        </div>
      </motion.section>

      {/* 2) Audio narration of the result. */}
      <div className={styles.audioWrap}>
        <AudioNarration textBn={narrationBn} textEn={narrationEn} />
      </div>

      {/* 3) Illustrative people-grid, carefully framed (§6). */}
      <section className={`card ${styles.gridSection}`}>
        <h2 className={styles.gridHeading}>
          {lang === "bn"
            ? `১০০ জনে আনুমানিক ${countText} জন`
            : `About ${count} in 100`}
        </h2>
        <PeopleGrid count={count} category={category} label={gridLabel} />
        <p className={styles.gridCaption}>
          {lang === "bn"
            ? `ছবিটি কেবল বোঝানোর জন্য। আপনার মতো ১০০ জনের মধ্যে আনুমানিক ${countText} জনের আগামী ১০ বছরে হৃদরোগ হতে পারে। এটি নিশ্চিত সংখ্যা নয়।`
            : `This picture is only to help explain. Of 100 people like you, about ${count} may develop heart disease in the next 10 years. It is not an exact number.`}
        </p>
      </section>

      {/* 4) Mandatory disclaimer — both languages, always (§2). */}
      <div className={styles.disclaimerWrap}>
        <Disclaimer alwaysBilingual />
      </div>

      {/* 5) Toward a real doctor. */}
      <div className={styles.actions}>
        <Button
          size="lg"
          fullWidth
          variant="primary"
          icon={<Icon name="doctor" size={24} />}
          disabled
          title={lang === "bn" ? "শীঘ্রই আসছে" : "Coming soon"}
        >
          {lang === "bn" ? "ডাক্তার খুঁজুন" : "Find a doctor"}
        </Button>
        <Button
          size="lg"
          fullWidth
          variant="secondary"
          icon={<Icon name="arrow-left" size={22} />}
          onClick={() => {
            clearResult();
            router.push("/check");
          }}
        >
          {lang === "bn" ? "আবার শুরু করুন" : "Start over"}
        </Button>
      </div>
    </div>
  );
}
