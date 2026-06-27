"use client";

// Big tappable answer buttons for a single wizard question (CLAUDE.md §1). Icon + word,
// generous targets. Used for sex, yes/no, yes/no/don't-know, education, cigarettes-per-day.
// `value === null` is a real choice ("don't know"), distinct from not-yet-answered.

import Icon from "@/components/Icon";
import { useI18n } from "@/lib/i18n";
import type { ChoiceOption } from "@/lib/wizardConfig";
import styles from "./wizard.module.css";

export default function ChoiceGrid({
  options,
  columns = 1,
  selected,
  onSelect,
}: {
  options: ChoiceOption[];
  columns?: 1 | 2;
  // `undefined` = unanswered; `null` = "don't know" chosen.
  selected: number | null | undefined;
  onSelect: (value: number | null) => void;
}) {
  const { lang } = useI18n();
  const answered = selected !== undefined;

  return (
    <div className={`${styles.choices} ${columns === 2 ? styles.choices2 : styles.choices1}`} role="group">
      {options.map((opt) => {
        const isSelected = answered && selected === opt.value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            className={`${styles.choice} ${isSelected ? styles.choiceSelected : ""}`}
            aria-pressed={isSelected}
            data-value={String(opt.value)}
            onClick={() => onSelect(opt.value)}
          >
            {opt.icon ? (
              <span className={styles.choiceIcon} aria-hidden="true">
                <Icon name={opt.icon} size={columns === 2 ? 40 : 30} />
              </span>
            ) : null}
            <span>{opt.label[lang]}</span>
          </button>
        );
      })}
    </div>
  );
}
