"use client";

// Doctor directory (CLAUDE.md §13.6). The end of the safe path: after seeing a screening
// result, users are guided to a REAL doctor (§2). Designed to the same rules as the rest of
// the app (§1): Bangla-first, icon-led, large tap targets, plain words, light animations.
//
//   - A simple search box (name / specialty / location) plus one-tap specialty chips, so a
//     low-literacy user can filter without typing.
//   - Each entry shows name, specialty, location, and a big CALL button (tel:) — the single
//     most useful action.
//   - Backed by the database via GET /doctors (see backend/db.py search_doctors).

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import Button from "@/components/Button";
import Icon from "@/components/Icon";
import { ApiError, getDoctors } from "@/lib/api";
import { useI18n, type Bilingual, type Lang } from "@/lib/i18n";
import type { Doctor } from "@/lib/types";
import styles from "./page.module.css";

// One-tap specialty filters. `term` is matched against the backend's bilingual specialty
// columns (English canonical works because search is case-insensitive across both languages).
const SPECIALTY_CHIPS: { term: string; label: Bilingual }[] = [
  { term: "Cardiologist", label: { bn: "হৃদরোগ", en: "Heart" } },
  { term: "General Physician", label: { bn: "মেডিসিন", en: "Medicine" } },
  { term: "Diabetes", label: { bn: "ডায়াবেটিস", en: "Diabetes" } },
];

function nameOf(d: Doctor, lang: Lang) {
  return lang === "bn" ? d.name_bn : d.name_en;
}
function specialtyOf(d: Doctor, lang: Lang) {
  return lang === "bn" ? d.specialty_bn : d.specialty_en;
}
function locationOf(d: Doctor, lang: Lang) {
  return lang === "bn" ? d.location_bn : d.location_en;
}

export default function DoctorsPage() {
  const { lang } = useI18n();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  // Debounce the text query so we don't fire a request on every keystroke (kind to 3G).
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  // Fetch whenever the (debounced) query or specialty filter changes. Aborts the in-flight
  // request if the inputs change again first.
  const reqId = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const myId = ++reqId.current;
    setStatus("loading");
    getDoctors(
      { q: debouncedQuery || undefined, specialty: specialty || undefined },
      controller.signal,
    )
      .then((res) => {
        if (myId !== reqId.current) return; // a newer request superseded this one
        setDoctors(res.items);
        setStatus("ok");
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.name === "AbortError") return;
        if (err instanceof ApiError || err instanceof Error) setStatus("error");
      });
    return () => controller.abort();
  }, [debouncedQuery, specialty]);

  const heading = lang === "bn" ? "ডাক্তার খুঁজুন" : "Find a doctor";
  const sub =
    lang === "bn"
      ? "নাম, বিশেষত্ব বা এলাকা দিয়ে খুঁজুন। ফোন করতে নম্বরে চাপ দিন।"
      : "Search by name, specialty, or area. Tap a number to call.";

  return (
    <div className="container fade-in">
      <div className={styles.intro}>
        <h1 className={styles.title}>{heading}</h1>
        <p className={styles.sub}>{sub}</p>
      </div>

      {/* Search box */}
      <div className={styles.searchWrap}>
        <span className={styles.searchIcon} aria-hidden="true">
          <Icon name="search" size={22} />
        </span>
        <input
          type="search"
          className={styles.searchInput}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={lang === "bn" ? "যেমন: হৃদরোগ, ঢাকা" : "e.g. Heart, Dhaka"}
          aria-label={lang === "bn" ? "ডাক্তার খুঁজুন" : "Search doctors"}
          enterKeyHint="search"
        />
        {query ? (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => setQuery("")}
            aria-label={lang === "bn" ? "মুছুন" : "Clear"}
          >
            <Icon name="cross" size={20} />
          </button>
        ) : null}
      </div>

      {/* One-tap specialty chips */}
      <div className={styles.chips} role="group" aria-label={lang === "bn" ? "বিশেষত্ব ছাঁকুন" : "Filter by specialty"}>
        <button
          type="button"
          className={`${styles.chip} ${specialty === null ? styles.chipActive : ""}`}
          aria-pressed={specialty === null}
          onClick={() => setSpecialty(null)}
        >
          {lang === "bn" ? "সব" : "All"}
        </button>
        {SPECIALTY_CHIPS.map((c) => {
          const active = specialty === c.term;
          return (
            <button
              key={c.term}
              type="button"
              className={`${styles.chip} ${active ? styles.chipActive : ""}`}
              aria-pressed={active}
              onClick={() => setSpecialty(active ? null : c.term)}
            >
              {c.label[lang]}
            </button>
          );
        })}
      </div>

      {/* Result count / status line */}
      <p className={styles.count} role="status" aria-live="polite">
        {status === "loading"
          ? lang === "bn"
            ? "খোঁজা হচ্ছে…"
            : "Searching…"
          : status === "error"
            ? ""
            : lang === "bn"
              ? `${doctors.length} জন ডাক্তার পাওয়া গেছে`
              : `${doctors.length} doctor${doctors.length === 1 ? "" : "s"} found`}
      </p>

      {status === "error" ? (
        <div className={`card ${styles.message}`} role="alert">
          <Icon name="cross" size={22} />
          <p>
            {lang === "bn"
              ? "তালিকা আনতে সমস্যা হয়েছে। ইন্টারনেট দেখে আবার চেষ্টা করুন।"
              : "Couldn't load the list. Check your connection and try again."}
          </p>
        </div>
      ) : status === "ok" && doctors.length === 0 ? (
        <div className={`card ${styles.message}`}>
          <Icon name="search" size={22} />
          <p>
            {lang === "bn"
              ? "কোনো ডাক্তার পাওয়া যায়নি। অন্য শব্দ দিয়ে খুঁজুন।"
              : "No doctors found. Try a different search."}
          </p>
        </div>
      ) : (
        <ul className={styles.list}>
          <AnimatePresence mode="popLayout">
            {doctors.map((d, i) => (
              <motion.li
                key={d.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, delay: Math.min(i * 0.04, 0.3) }}
                className={`card ${styles.doctor}`}
              >
                <div className={styles.docHead}>
                  <span className={styles.docAvatar} aria-hidden="true">
                    <Icon name="doctor" size={26} />
                  </span>
                  <div className={styles.docMain}>
                    <p className={styles.docName}>{nameOf(d, lang)}</p>
                    <p className={styles.docSpecialty}>{specialtyOf(d, lang)}</p>
                  </div>
                </div>

                <p className={styles.docLocation}>
                  <Icon name="location" size={18} />
                  <span>{locationOf(d, lang)}</span>
                </p>

                <a className={styles.callBtn} href={`tel:${d.phone}`}>
                  <Icon name="phone" size={20} />
                  <span>
                    {lang === "bn" ? "ফোন করুন" : "Call"} · {d.phone}
                  </span>
                </a>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      <div className={styles.actions}>
        <Button
          size="lg"
          fullWidth
          variant="secondary"
          icon={<Icon name="arrow-left" size={22} />}
          onClick={() => router.back()}
        >
          {lang === "bn" ? "ফিরে যান" : "Go back"}
        </Button>
      </div>
    </div>
  );
}
