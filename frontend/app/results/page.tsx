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

import AudioButton from "@/components/AudioButton";
import Button from "@/components/Button";
import Icon, { type IconName } from "@/components/Icon";
import Disclaimer from "@/components/Disclaimer";
import PeopleGrid from "@/components/results/PeopleGrid";
import { resultClip } from "@/lib/audio";
import { localeNum } from "@/lib/format";
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
  // How honestly to present the number (CLAUDE.md §6). Absent (legacy/manual) => treat as full.
  const confidence = data.confidence ?? "full";
  const isRough = confidence === "rough";
  const isPartial = confidence === "partial";
  // Precise numbers only when we actually have the clinical data to back them. The people-grid
  // implies a calibrated probability, so it is shown for full/partial but NEVER for rough.
  const showPeopleGrid = !isRough;
  const showPreciseCount = confidence === "full";
  // Which recorded clip to narrate: the rough/partial-data case gets its own clip, otherwise
  // the clip for the risk band (CLAUDE.md §2, §6).
  const clip = resultClip(category, isRough);
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

      {/* 2) Audio narration of the result — pre-recorded clip in the active language (§1). */}
      <div className={styles.audioWrap}>
        <AudioButton
          clip={clip}
          labelBn="ফলাফল শুনুন"
          labelEn="Listen to result"
        />
      </div>

      {/* Honest confidence label (CLAUDE.md §6) — names how much real data backs the estimate. */}
      <ConfidenceChip confidence={confidence} lang={lang} />

      {/* 3a) ROUGH: too little clinical data — show ONLY the coarse category, NO precise % and
            NO people-grid (which would imply a calibrated probability we don't have, §6).
            A prominent bilingual message pushes toward real tests + a doctor. */}
      {isRough ? (
        <section className={`card ${styles.roughCard}`} role="alert">
          <span className={styles.roughIcon} aria-hidden="true">
            <Icon name="question" size={32} />
          </span>
          <p className={styles.roughText}>
            কিছু পরীক্ষার তথ্য না থাকায় এটি কেবল একটি মোটামুটি ধারণা। অনুগ্রহ করে রক্তচাপ ও রক্ত
            পরীক্ষা করান এবং একজন ডাক্তার দেখান।
          </p>
          <p className={styles.roughText} lang="en">
            This is a rough estimate because some test information was missing. Please get a blood
            pressure and blood test, and see a doctor.
          </p>
          <Button
            size="lg"
            fullWidth
            icon={<Icon name="doctor" size={24} />}
            onClick={() => router.push("/doctors")}
          >
            {lang === "bn" ? "ডাক্তার খুঁজুন" : "Find a doctor"}
          </Button>
        </section>
      ) : (
        <>
          {/* 3b) PARTIAL: usable, but say plainly that some info was missing and go lighter on
                precise numbers (CLAUDE.md §6). */}
          {isPartial ? (
            <section className={`card ${styles.partialNote}`} role="note">
              <Icon name="question" size={24} />
              <p>
                {lang === "bn"
                  ? "কিছু পরীক্ষার তথ্য ছিল না, তাই এটি আনুমানিক। আরও নিশ্চিত হতে রক্তচাপ ও রক্ত পরীক্ষা করিয়ে নিন।"
                  : "Some test information was missing, so this is an estimate. For a clearer picture, get a blood pressure and blood test."}
              </p>
            </section>
          ) : null}

          {/* Illustrative people-grid, carefully framed (§6). Shown for full + partial. */}
          {showPeopleGrid ? (
            <section className={`card ${styles.gridSection}`}>
              <h2 className={styles.gridHeading}>
                {showPreciseCount
                  ? lang === "bn"
                    ? `১০০ জনে আনুমানিক ${countText} জন`
                    : `About ${count} in 100`
                  : lang === "bn"
                    ? "ছবিতে যেমন দেখানো হয়েছে"
                    : "Roughly like the picture below"}
              </h2>
              <PeopleGrid count={count} category={category} label={gridLabel} />
              <p className={styles.gridCaption}>
                {lang === "bn"
                  ? `ছবিটি কেবল বোঝানোর জন্য। আপনার মতো ১০০ জনের মধ্যে আনুমানিক ${countText} জনের আগামী ১০ বছরে হৃদরোগ হতে পারে। এটি নিশ্চিত সংখ্যা নয়।`
                  : `This picture is only to help explain. Of 100 people like you, about ${count} may develop heart disease in the next 10 years. It is not an exact number.`}
              </p>
            </section>
          ) : null}
        </>
      )}

      {/* 4) Mandatory disclaimer — both languages, always (§2). */}
      <div className={styles.disclaimerWrap}>
        <Disclaimer alwaysBilingual />
      </div>

      {/* 5) Toward a real doctor (§2). For elevated risk this is urgent, so we lead with a
            prominent callout pushing the user into the doctor directory. */}
      {category !== "low" ? (
        <motion.section
          className={`${styles.doctorCallout} ${meta.className}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <span className={styles.calloutIcon} aria-hidden="true">
            <Icon name="doctor" size={28} />
          </span>
          <p className={styles.calloutText}>
            {category === "high"
              ? lang === "bn"
                ? "আপনার ঝুঁকি বেশি। অনুগ্রহ করে শীঘ্রই একজন ডাক্তার দেখান।"
                : "Your risk is high. Please see a doctor soon."
              : lang === "bn"
                ? "একজন ডাক্তারের সাথে কথা বলা ভালো হবে।"
                : "It would be good to talk to a doctor."}
          </p>
        </motion.section>
      ) : null}

      <div className={styles.actions}>
        <Button
          size="lg"
          fullWidth
          variant="primary"
          icon={<Icon name="doctor" size={24} />}
          onClick={() => router.push("/doctors")}
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

// Small badge naming how much real clinical data backs the estimate (CLAUDE.md §6). Bilingual,
// color-keyed so the level reads at a glance: full = calm, partial = caution, rough = warn.
function ConfidenceChip({
  confidence,
  lang,
}: {
  confidence: "full" | "partial" | "rough";
  lang: Lang;
}) {
  const META: Record<typeof confidence, { bn: string; en: string; cls: string }> = {
    full: { bn: "পূর্ণ তথ্যের ভিত্তিতে", en: "Based on full information", cls: styles.confFull },
    partial: { bn: "কিছু তথ্য কম ছিল", en: "Some information was missing", cls: styles.confPartial },
    rough: { bn: "মোটামুটি ধারণা", en: "Rough estimate only", cls: styles.confRough },
  };
  const m = META[confidence];
  return (
    <div className={`${styles.confChip} ${m.cls}`}>
      <Icon name={confidence === "full" ? "check" : "question"} size={18} />
      <span>{m[lang]}</span>
    </div>
  );
}
