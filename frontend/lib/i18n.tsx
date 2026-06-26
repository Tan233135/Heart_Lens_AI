"use client";

// Minimal bilingual (Bangla / English) i18n — no external library, to keep the bundle
// small for low-end devices on 3G (CLAUDE.md §1). Default language is Bangla, since the
// audience is rural Bangladeshi users; English is the secondary toggle.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "bn" | "en";

// A string that exists in both languages. Field labels, options, etc. are colocated
// with their config as Bilingual objects rather than bloating the STRINGS table.
export interface Bilingual {
  bn: string;
  en: string;
}

// Convenience selector for a Bilingual value given the active language.
export function pick(lang: Lang, text: Bilingual): string {
  return text[lang];
}

// Each string key maps to both languages. Add keys here as features are built.
// Keep copy SHORT and plain — many users read with difficulty (CLAUDE.md §1).
const STRINGS = {
  appName: { bn: "হার্টলেন্স", en: "HeartLens" },
  tagline: {
    bn: "আপনার হৃদরোগের ঝুঁকি সহজে বুঝুন",
    en: "Understand your heart risk, simply",
  },
  langName: { bn: "বাংলা", en: "English" },
  // The mandatory disclaimer (CLAUDE.md §2) — shown on every results view later.
  disclaimer: {
    bn: "এটি একটি প্রাথমিক ধারণা, রোগ নির্ণয় নয়। অনুগ্রহ করে একজন ডাক্তার দেখান।",
    en: "This is a screening estimate, not a diagnosis. Please see a doctor.",
  },
  start: { bn: "শুরু করুন", en: "Start" },
  comingSoon: { bn: "শীঘ্রই আসছে", en: "Coming soon" },
} as const;

export type StringKey = keyof typeof STRINGS;

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  t: (key: StringKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = "heartlens.lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("bn");

  // Restore the saved preference after mount (avoids hydration mismatch).
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "bn" || saved === "en") setLangState(saved);
  }, []);

  // Keep <html lang> accurate for screen readers / correct font shaping.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode / storage disabled — non-fatal */
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === "bn" ? "en" : "bn");
  }, [lang, setLang]);

  const t = useCallback((key: StringKey) => STRINGS[key][lang], [lang]);

  const value = useMemo(
    () => ({ lang, setLang, toggleLang, t }),
    [lang, setLang, toggleLang, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within an <I18nProvider>");
  return ctx;
}
