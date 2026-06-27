"use client";

// Per-question narration for the guided wizard (CLAUDE.md §1 — many users read with
// difficulty, so every question can be SPOKEN aloud in the active language).
//
// Two delivery paths, in priority order:
//   1. A PRE-RECORDED clip, if one exists for this question + language. This is the RELIABLE
//      path: the wizard's question set is small and fixed, and Web-Speech Bangla support is
//      inconsistent on mobile, so a recorded human voice is the dependable option. Clips live
//      at /public/audio/q_<id>(<lang>).mp3 (e.g. q_age(bn).mp3) and, when present, win.
//   2. The browser Web Speech API (speechSynthesis) with a bn-BD / en-US voice, used as the
//      fallback when no recorded clip is available for the current language.
//
// `available` is false only when NEITHER path can speak — then the button disables itself
// rather than pretending (we never show a dead "play" control).

import { useCallback, useEffect, useRef, useState } from "react";

import { useI18n, type Lang } from "@/lib/i18n";

export interface Speech {
  play: () => void;
  stop: () => void;
  speaking: boolean;
  available: boolean;
  /** "clip" if a recorded file will be used, "tts" if the Web Speech API will, else "none". */
  mode: "clip" | "tts" | "none";
}

function clipSrc(clipBase: string, lang: Lang): string {
  return `/audio/${clipBase}(${lang}).mp3`;
}

// Web Speech is available in most modern browsers, but not all (and not in some headless
// envs). Guarded so SSR and unsupported browsers don't throw.
function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
}

// Pick the best-matching installed voice for a language; undefined is fine (engine default).
function pickVoice(lang: Lang): SpeechSynthesisVoice | undefined {
  if (!ttsSupported()) return undefined;
  const want = lang === "bn" ? "bn" : "en";
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang?.toLowerCase().startsWith(want)) ?? undefined;
}

/**
 * @param clipBase  base filename for the optional recorded clip, e.g. "q_age" (no lang/ext).
 * @param textBn    Bangla text to speak via Web Speech when no recorded clip is used.
 * @param textEn    English text to speak via Web Speech when no recorded clip is used.
 */
export function useSpeech(clipBase: string, textBn: string, textEn: string): Speech {
  const { lang } = useI18n();
  const [speaking, setSpeaking] = useState(false);
  const [hasClip, setHasClip] = useState(false);
  // Whether TTS is usable depends on `window`, which doesn't exist during SSR. To avoid a
  // hydration mismatch we render an "available" button until mounted, then settle the truth.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Always holds the latest values so the stable play() callback never closes over stale data.
  const langRef = useRef(lang);
  const textRef = useRef({ bn: textBn, en: textEn });
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);
  useEffect(() => {
    textRef.current = { bn: textBn, en: textEn };
  }, [textBn, textEn]);

  // On clip/language change: stop anything in flight and HEAD-check whether a recorded clip
  // exists for THIS language, so we can decide clip-vs-TTS up front (and prime the button label).
  useEffect(() => {
    stopAll(audioRef);
    setSpeaking(false);

    let cancelled = false;
    fetch(clipSrc(clipBase, lang), { method: "HEAD" })
      .then((res) => {
        if (!cancelled) setHasClip(res.ok);
      })
      .catch(() => {
        if (!cancelled) setHasClip(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clipBase, lang]);

  const stop = useCallback(() => {
    stopAll(audioRef);
    setSpeaking(false);
  }, []);

  const play = useCallback(() => {
    const curLang = langRef.current;
    stopAll(audioRef);

    if (hasClip) {
      let a = audioRef.current;
      if (!a) {
        a = new Audio();
        a.preload = "none";
        a.addEventListener("ended", () => setSpeaking(false));
        audioRef.current = a;
      }
      // If the recorded file turns out broken at play time, gracefully fall through to TTS.
      a.onerror = () => {
        setSpeaking(false);
        speakTts(curLang, textRef.current, setSpeaking);
      };
      a.src = new URL(clipSrc(clipBase, curLang), window.location.origin).href;
      a.currentTime = 0;
      setSpeaking(true);
      a.play().catch(() => {
        setSpeaking(false);
        speakTts(curLang, textRef.current, setSpeaking);
      });
      return;
    }

    speakTts(curLang, textRef.current, setSpeaking);
  }, [clipBase, hasClip]);

  // Stop any audio/TTS when the question screen unmounts (e.g. moving to the next question).
  useEffect(() => {
    return () => stopAll(audioRef);
  }, []);

  // Before mount: assume available so server and first client render agree (no hydration gap).
  const available = !mounted || hasClip || ttsSupported();
  const mode: Speech["mode"] = !mounted ? "tts" : hasClip ? "clip" : ttsSupported() ? "tts" : "none";

  return { play, stop, speaking, available, mode };
}

function stopAll(audioRef: React.MutableRefObject<HTMLAudioElement | null>) {
  if (audioRef.current) {
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
  }
  if (ttsSupported()) window.speechSynthesis.cancel();
}

function speakTts(
  lang: Lang,
  text: { bn: string; en: string },
  setSpeaking: (v: boolean) => void,
) {
  if (!ttsSupported()) {
    setSpeaking(false);
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(lang === "bn" ? text.bn : text.en);
  u.lang = lang === "bn" ? "bn-BD" : "en-US";
  const voice = pickVoice(lang);
  if (voice) u.voice = voice;
  u.rate = 0.95; // a touch slower — clearer for low-literacy listeners
  u.onend = () => setSpeaking(false);
  u.onerror = () => setSpeaking(false);
  setSpeaking(true);
  window.speechSynthesis.speak(u);
}
