"use client";

// Doctor directory (CLAUDE.md §13.6). The end of the safe path: after seeing a screening
// result, users are guided to a REAL doctor (§2). Designed to the same rules as the rest of
// the app (§1): Bangla-first, icon-led, large tap targets, plain words, light animations.
//
//   - TAP-first filtering: one-tap specialty chips AND one-tap location chips (icons + Bangla &
//     English labels), so a low-literacy user can filter without typing. A text search box is an
//     ADDITION, not the only way to filter.
//   - Specialty + location combine (AND) — the backend does the matching (db.py search_doctors).
//   - Each entry shows name, specialty, area, optional clinic, and a big CALL button (tel:) —
//     the single most useful action.
//   - Pre-fillable from the results page: ?specialty=Cardiologist (and/or ?location=Dhaka) seed
//     the filters, so a worried high-risk user lands on the right specialists automatically.

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

import Button from "@/components/Button";
import Icon, { type IconName } from "@/components/Icon";
import { ApiError, getDoctors } from "@/lib/api";
import { useI18n, type Bilingual, type Lang } from "@/lib/i18n";
import type { Doctor } from "@/lib/types";
import styles from "./page.module.css";

interface FilterChip {
  term: string; // matched (ilike) against the backend's bilingual columns
  label: Bilingual;
  icon: IconName;
}

// One-tap specialty filters. `term` is the English canonical — search is case-insensitive across
// both languages, so it matches the Bangla rows too.
const SPECIALTY_CHIPS: FilterChip[] = [
  { term: "Cardiologist", label: { bn: "হৃদরোগ", en: "Heart" }, icon: "heart" },
  { term: "General Physician", label: { bn: "মেডিসিন", en: "Medicine" }, icon: "doctor" },
  { term: "Diabetes", label: { bn: "ডায়াবেটিস", en: "Diabetes" }, icon: "droplet" },
];

// One-tap location filters (Bangladesh cities the sample data covers).
const LOCATION_CHIPS: FilterChip[] = [
  { term: "Dhaka", label: { bn: "ঢাকা", en: "Dhaka" }, icon: "location" },
  { term: "Chattogram", label: { bn: "চট্টগ্রাম", en: "Chattogram" }, icon: "location" },
  { term: "Sylhet", label: { bn: "সিলেট", en: "Sylhet" }, icon: "location" },
  { term: "Rajshahi", label: { bn: "রাজশাহী", en: "Rajshahi" }, icon: "location" },
  { term: "Khulna", label: { bn: "খুলনা", en: "Khulna" }, icon: "location" },
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
function hospitalOf(d: Doctor, lang: Lang): string | null {
  return (lang === "bn" ? d.hospital_bn : d.hospital_en) || null;
}

// One labelled row of tappable filter chips (with a leading "All" reset). Kept generic so the
// specialty and location rows share identical, accessible behaviour.
function FilterChips({
  titleIcon,
  title,
  allLabel,
  options,
  value,
  onChange,
  lang,
}: {
  titleIcon: IconName;
  title: string;
  allLabel: string;
  options: FilterChip[];
  value: string | null;
  onChange: (term: string | null) => void;
  lang: Lang;
}) {
  return (
    <div className={styles.filterGroup}>
      <p className={styles.filterLabel}>
        <Icon name={titleIcon} size={18} />
        {title}
      </p>
      <div className={styles.chips} role="group" aria-label={title}>
        <button
          type="button"
          className={`${styles.chip} ${value === null ? styles.chipActive : ""}`}
          aria-pressed={value === null}
          onClick={() => onChange(null)}
        >
          {allLabel}
        </button>
        {options.map((c) => {
          const active = value === c.term;
          return (
            <button
              key={c.term}
              type="button"
              className={`${styles.chip} ${active ? styles.chipActive : ""}`}
              aria-pressed={active}
              onClick={() => onChange(active ? null : c.term)}
            >
              <Icon name={c.icon} size={18} />
              {c.label[lang]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DoctorsDirectory() {
  const { lang } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState("");
  // Seed the filters from the URL once, so a link like /doctors?specialty=Cardiologist&location=Dhaka
  // from the results page lands the user pre-filtered (CLAUDE.md §2 — guide elevated-risk users
  // straight to the right specialists).
  const [specialty, setSpecialty] = useState<string | null>(() => searchParams.get("specialty"));
  const [location, setLocation] = useState<string | null>(() => searchParams.get("location"));
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  // Debounce the text query so we don't fire a request on every keystroke (kind to 3G).
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(id);
  }, [query]);

  // Fetch whenever the (debounced) query, specialty, or location changes. Aborts the in-flight
  // request if the inputs change again first.
  const reqId = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    const myId = ++reqId.current;
    setStatus("loading");
    getDoctors(
      {
        q: debouncedQuery || undefined,
        specialty: specialty || undefined,
        location: location || undefined,
      },
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
  }, [debouncedQuery, specialty, location]);

  const heading = lang === "bn" ? "ডাক্তার খুঁজুন" : "Find a doctor";
  const sub =
    lang === "bn"
      ? "বিশেষত্ব ও এলাকা চাপ দিয়ে বাছুন। ফোন করতে নম্বরে চাপ দিন।"
      : "Tap a specialty and area to filter. Tap a number to call.";

  return (
    <div className="container fade-in">
      <div className={styles.intro}>
        <h1 className={styles.title}>{heading}</h1>
        <p className={styles.sub}>{sub}</p>
      </div>

      {/* Search box — an ADDITION to the tappable chips, never the only way to filter. */}
      <div className={styles.searchWrap}>
        <span className={styles.searchIcon} aria-hidden="true">
          <Icon name="search" size={22} />
        </span>
        <input
          type="search"
          className={styles.searchInput}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={lang === "bn" ? "নাম দিয়ে খুঁজুন (ঐচ্ছিক)" : "Search by name (optional)"}
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
      <FilterChips
        titleIcon="doctor"
        title={lang === "bn" ? "বিশেষত্ব" : "Specialty"}
        allLabel={lang === "bn" ? "সব" : "All"}
        options={SPECIALTY_CHIPS}
        value={specialty}
        onChange={setSpecialty}
        lang={lang}
      />

      {/* One-tap location chips */}
      <FilterChips
        titleIcon="location"
        title={lang === "bn" ? "এলাকা" : "Area"}
        allLabel={lang === "bn" ? "সব" : "All"}
        options={LOCATION_CHIPS}
        value={location}
        onChange={setLocation}
        lang={lang}
      />

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
              ? "এই ছাঁকনিতে কোনো ডাক্তার নেই। অন্য বিশেষত্ব বা এলাকা বেছে দেখুন।"
              : "No doctors match this filter. Try a different specialty or area."}
          </p>
        </div>
      ) : (
        <ul className={styles.list}>
          <AnimatePresence mode="popLayout">
            {doctors.map((d, i) => {
              const hospital = hospitalOf(d, lang);
              return (
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

                  {hospital ? (
                    <p className={styles.docHospital}>
                      <Icon name="plus" size={16} />
                      <span>{hospital}</span>
                    </p>
                  ) : null}

                  <a className={styles.callBtn} href={`tel:${d.phone}`}>
                    <Icon name="phone" size={20} />
                    <span>
                      {lang === "bn" ? "ফোন করুন" : "Call"} · {d.phone}
                    </span>
                  </a>
                </motion.li>
              );
            })}
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

// useSearchParams() requires a Suspense boundary (Next.js app router). The fallback is a brief
// empty shell — the directory hydrates immediately on the client.
export default function DoctorsPage() {
  return (
    <Suspense fallback={<div className="container" aria-busy="true" />}>
      <DoctorsDirectory />
    </Suspense>
  );
}
