"use client";

// The single audio helper (CLAUDE.md §1). `play()` is effectively `playClip(baseName)`:
// it plays /audio/<baseName>(<lang>).mp3 for the CURRENTLY ACTIVE language read from the
// existing language toggle (lib/i18n).
//
// Behaviour the rest of the app relies on:
//   1. Language is read at PLAY time from a ref kept in sync with the toggle, so if the user
//      switches language while on the screen, the NEXT play uses the new language — we never
//      cache or replay the wrong language's clip.
//   2. If the file for the current language is missing, `available` becomes false so the button
//      can disable itself. We deliberately do NOT fall back to browser TTS or the other
//      language (per the agreed scope) — silence is safer than the wrong words.
//   3. One <audio> element is reused per mounted button; switching language stops any in-flight
//      playback (it belongs to the old language).

import { useCallback, useEffect, useRef, useState } from "react";

import { audioClipSrc, type ClipBaseName } from "@/lib/audio";
import { useI18n } from "@/lib/i18n";

export interface AudioClip {
  play: () => void; // playClip(baseName) for the active language
  stop: () => void;
  playing: boolean;
  available: boolean; // false => file missing for the current language; disable the button
}

export function useAudioClip(baseName: ClipBaseName, autoPlay = false): AudioClip {
  const { lang } = useI18n();
  const [playing, setPlaying] = useState(false);
  const [available, setAvailable] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Always holds the LATEST language, so play() (a stable callback) never closes over a stale one.
  const langRef = useRef(lang);
  // Tracks the last "baseName|lang" we auto-played, so autoplay fires once per clip+language
  // (and re-fires if the user switches language), not on every re-render.
  const autoPlayedRef = useRef<string | null>(null);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  // When the clip or language changes: stop any playback from the old language and re-check that
  // a file exists for the new language. A HEAD request is cheap and lets us disable up front
  // rather than only discovering the gap on click.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlaying(false);

    let cancelled = false;
    const src = audioClipSrc(baseName, lang);
    fetch(src, { method: "HEAD" })
      .then((res) => {
        if (!cancelled) setAvailable(res.ok);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [baseName, lang]);

  const stop = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    setPlaying(false);
  }, []);

  const play = useCallback(() => {
    const src = audioClipSrc(baseName, langRef.current); // current language, decided at click time
    let a = audioRef.current;
    if (!a) {
      a = new Audio();
      a.preload = "none";
      a.addEventListener("ended", () => setPlaying(false));
      a.addEventListener("error", () => {
        setPlaying(false);
        setAvailable(false); // missing/broken file -> let the button disable itself
      });
      audioRef.current = a;
    }
    // Always (re)point at the current-language file so a previous language's clip is never replayed.
    const absolute = new URL(src, window.location.origin).href;
    if (a.src !== absolute) a.src = absolute;
    a.currentTime = 0;
    setPlaying(true);
    a.play().catch((err: unknown) => {
      setPlaying(false);
      // A browser-BLOCKED autoplay (NotAllowedError — no user gesture yet) is NOT a broken file:
      // keep the clip "available" so the button stays tappable. Only a real decode/missing error
      // disables it (we never substitute TTS or the wrong language — agreed audio scope).
      const name = err instanceof DOMException ? err.name : "";
      if (name !== "NotAllowedError") setAvailable(false);
    });
  }, [baseName]);

  // Autoplay (opt-in): speak the clip once it's confirmed available, with no tap — and re-fire in
  // the new language if the user switches. Browsers may block autoplay until the user has
  // interacted with the page (e.g. a cold first load); then it simply stays silent until the user
  // taps, because the button remains. Guarded by autoPlayedRef so it runs once per clip+language.
  useEffect(() => {
    if (!autoPlay || !available) return;
    const key = `${baseName}|${lang}`;
    if (autoPlayedRef.current === key) return;
    autoPlayedRef.current = key;
    play();
  }, [autoPlay, available, baseName, lang, play]);

  // Stop audio if the button unmounts (e.g. navigating away mid-clip).
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  return { play, stop, playing, available };
}
