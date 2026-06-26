"use client";

// "X out of 100 people like you" — an illustrative people-grid (CLAUDE.md §6).
//
// §6 caveat is load-bearing here: the model is NOT yet calibration-verified, so this grid
// is framed as an ILLUSTRATION, not a precise count. The caption (rendered by the results
// page) says so in both languages; this component just draws 100 figures with `count`
// highlighted in the risk color and a staggered CSS-only reveal.

import { useMemo } from "react";
import type { RiskCategory } from "@/lib/types";
import styles from "./PeopleGrid.module.css";

const TOTAL = 100;

// Solid person silhouette — filled (not stroked) so the highlighted figures read boldly.
function Person() {
  return (
    <svg viewBox="0 0 24 24" className={styles.person} aria-hidden="true">
      <circle cx="12" cy="7" r="4" />
      <path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8Z" />
    </svg>
  );
}

export default function PeopleGrid({
  count,
  category,
  label,
}: {
  count: number;
  category: RiskCategory;
  label: string; // accessible summary, e.g. "About 73 of 100 people like you"
}) {
  const safe = Math.max(0, Math.min(TOTAL, Math.round(count)));
  const cells = useMemo(() => Array.from({ length: TOTAL }, (_, i) => i), []);

  return (
    <div
      className={`${styles.grid} ${styles[category]}`}
      role="img"
      aria-label={label}
    >
      {cells.map((i) => (
        <span
          key={i}
          className={`${styles.cell} ${i < safe ? styles.filled : ""}`}
          // Stagger the reveal; cap the delay so the last figures don't lag too long.
          style={{ ["--i" as string]: Math.min(i, 60) }}
        >
          <Person />
        </span>
      ))}
    </div>
  );
}
