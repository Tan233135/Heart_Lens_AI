"use client";

// Segmented single-choice control (used for Sex and Education level).

import Icon, { type IconName } from "@/components/Icon";
import { pick, useI18n } from "@/lib/i18n";
import type { SegOption } from "@/lib/formConfig";
import FieldShell from "./FieldShell";
import styles from "./field.module.css";

export default function SegmentedField({
  icon,
  label,
  helper,
  options,
  value,
  onChange,
  error,
  badge,
}: {
  icon: IconName;
  label: string;
  helper?: string;
  options: SegOption[];
  value: number | undefined;
  onChange: (v: number) => void;
  error?: string;
  badge?: string;
}) {
  const { lang } = useI18n();
  return (
    <FieldShell icon={icon} label={label} helper={helper} error={error} badge={badge}>
      <div className={styles.segmented} role="group" aria-label={label}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={value === opt.value}
            className={`${styles.seg} ${value === opt.value ? styles.segActive : ""}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon ? <Icon name={opt.icon} size={26} /> : null}
            <span>{pick(lang, opt.label)}</span>
          </button>
        ))}
      </div>
    </FieldShell>
  );
}
