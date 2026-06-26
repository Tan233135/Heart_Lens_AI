"use client";

// Bangla (or English) audio narration of the result via the Web Speech API (CLAUDE.md §1).
// Many users read with difficulty, so the result is also spoken. No network/TTS service and
// no heavy dependency — uses the browser's built-in SpeechSynthesis where available, and
// degrades gracefully (the button hides) where it isn't.

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { useI18n } from "@/lib/i18n";
import styles from "./AudioNarration.module.css";

export default function AudioNarration({ textBn, textEn }: { textBn: string; textEn: string }) {
  const { lang } = useI18n();
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [hasLangVoice, setHasLangVoice] = useState(true);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);

    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
      const want = lang === "bn" ? "bn" : "en";
      setHasLangVoice(voicesRef.current.some((v) => v.lang?.toLowerCase().startsWith(want)));
    };
    loadVoices();
    // Voices often load asynchronously.
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      window.speechSynthesis.cancel();
    };
  }, [lang]);

  // Stop any narration if the language changes mid-playback or the view unmounts.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function speak() {
    const synth = window.speechSynthesis;
    synth.cancel();
    const text = lang === "bn" ? textBn : textEn;
    const utter = new SpeechSynthesisUtterance(text);
    const want = lang === "bn" ? "bn" : "en";
    const voice = voicesRef.current.find((v) => v.lang?.toLowerCase().startsWith(want));
    if (voice) utter.voice = voice;
    utter.lang = voice?.lang ?? (lang === "bn" ? "bn-BD" : "en-US");
    utter.rate = 0.95; // a touch slower — clearer for the audience
    utter.onend = () => setSpeaking(false);
    utter.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(utter);
  }

  function stop() {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  if (!supported) return null;

  const playLabel = lang === "bn" ? "ফলাফল শুনুন" : "Listen to result";
  const stopLabel = lang === "bn" ? "থামান" : "Stop";

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.btn}
        onClick={speaking ? stop : speak}
        aria-pressed={speaking}
      >
        <Icon name={speaking ? "stop" : "speaker"} size={26} />
        <span>{speaking ? stopLabel : playLabel}</span>
      </button>
      {!hasLangVoice && lang === "bn" ? (
        <p className={styles.note}>এই ডিভাইসে বাংলা কণ্ঠ নাও থাকতে পারে।</p>
      ) : null}
    </div>
  );
}
