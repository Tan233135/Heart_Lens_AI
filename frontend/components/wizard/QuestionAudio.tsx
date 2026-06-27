"use client";

// The prominent "play audio" button on every wizard question (CLAUDE.md §1). Reads the
// question aloud in the active language. Uses a pre-recorded clip when one exists, else the
// Web Speech API (see useSpeech). Disables itself only when neither path can speak.

import Icon from "@/components/Icon";
import { useI18n } from "@/lib/i18n";
import { useSpeech } from "@/lib/useSpeech";
import styles from "./wizard.module.css";

export default function QuestionAudio({
  clipBase,
  textBn,
  textEn,
}: {
  clipBase: string;
  textBn: string;
  textEn: string;
}) {
  const { lang } = useI18n();
  const { play, stop, speaking, available } = useSpeech(clipBase, textBn, textEn);

  if (!available) {
    return (
      <button type="button" className={styles.audioBtn} disabled aria-disabled="true">
        <Icon name="speaker" size={26} />
        <span>{lang === "bn" ? "অডিও নেই" : "Audio unavailable"}</span>
      </button>
    );
  }

  const label = speaking
    ? lang === "bn"
      ? "থামান"
      : "Stop"
    : lang === "bn"
      ? "শুনুন"
      : "Listen";

  return (
    <button
      type="button"
      className={`${styles.audioBtn} ${speaking ? `${styles.audioBtnPlaying} ${styles.audioPulse}` : ""}`}
      onClick={speaking ? stop : play}
      aria-pressed={speaking}
    >
      <Icon name={speaking ? "stop" : "speaker"} size={26} />
      <span>{label}</span>
    </button>
  );
}
