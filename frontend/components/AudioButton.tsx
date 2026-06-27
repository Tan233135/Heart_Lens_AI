"use client";

// Shared "listen" button for the welcome + result narration (CLAUDE.md §1). Wraps the single
// audio helper (useAudioClip): tap to play the current-language clip, tap again to stop. If the
// clip is missing for the active language the button disables itself — no TTS / wrong-language
// fallback (per the agreed audio scope).

import Icon from "@/components/Icon";
import type { ClipBaseName } from "@/lib/audio";
import { useI18n } from "@/lib/i18n";
import { useAudioClip } from "@/lib/useAudioClip";
import styles from "./AudioButton.module.css";

interface AudioButtonProps {
  clip: ClipBaseName;
  /** Optional custom label; defaults to a generic "Listen" in the active language. */
  labelBn?: string;
  labelEn?: string;
  /** Speak the clip automatically when it mounts (no tap). May be blocked by the browser on a
   *  cold first load until the user has interacted — the button stays available either way. */
  autoPlay?: boolean;
}

export default function AudioButton({ clip, labelBn, labelEn, autoPlay = false }: AudioButtonProps) {
  const { lang } = useI18n();
  const { play, stop, playing, available } = useAudioClip(clip, autoPlay);

  if (!available) {
    // File for the current language is missing — fail gracefully (disabled), never substitute.
    return (
      <div className={styles.wrap}>
        <button type="button" className={styles.btn} disabled aria-disabled="true">
          <Icon name="speaker" size={26} />
          <span>{lang === "bn" ? "অডিও নেই" : "Audio unavailable"}</span>
        </button>
      </div>
    );
  }

  const playLabel = lang === "bn" ? labelBn ?? "শুনুন" : labelEn ?? "Listen";
  const stopLabel = lang === "bn" ? "থামান" : "Stop";

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.btn}
        onClick={playing ? stop : play}
        aria-pressed={playing}
      >
        <Icon name={playing ? "stop" : "speaker"} size={26} />
        <span>{playing ? stopLabel : playLabel}</span>
      </button>
    </div>
  );
}
