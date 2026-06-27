"use client";

// Simple, language-free progress indicator (CLAUDE.md §1): one dot per question, the current
// one enlarged, answered ones filled. No text to read.

import styles from "./wizard.module.css";

export default function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <div
      className={styles.dots}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current + 1}
      aria-label="Progress"
    >
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`${styles.dot} ${
            i === current ? styles.dotActive : i < current ? styles.dotDone : ""
          }`}
        />
      ))}
    </div>
  );
}
