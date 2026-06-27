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

export function useAudioClip(baseName: ClipBaseName): AudioClip {
  const { lang } = useI18n();
  const [playing, setPlaying] = useState(false);
  const [available, setAvailable] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Always holds the LATEST language, so play() (a stable callback) never closes over a stale one.
  const langRef = useRef(lang);

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
    a.play().catch(() => {
      setPlaying(false);
      setAvailable(false);
    });
  }, [baseName]);

  // Stop audio if the button unmounts (e.g. navigating away mid-clip).
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  return { play, stop, playing, available };
}
