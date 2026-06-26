"use client";

// Big Yes / No toggle. "Yes" (a present condition) is rendered in the high-risk
// color and "No" in the low-risk color so the meaning reads at a glance.

import Icon, { type IconName } from "@/components/Icon";
import { useI18n } from "@/lib/i18n";
import FieldShell from "./FieldShell";
import styles from "./field.module.css";

export default function YesNoField({
  icon,
  label,
  helper,
  value,
  onChange,
  error,
}: {
  icon: IconName;
  label: string;
  helper?: string;
  value: number | undefined; // 1 = yes, 0 = no, undefined = unanswered
  onChange: (v: number) => void;
  error?: string;
}) {
  const { lang } = useI18n();
  const yes = lang === "bn" ? "হ্যাঁ" : "Yes";
  const no = lang === "bn" ? "না" : "No";

  return (
    <FieldShell icon={icon} label={label} helper={helper} error={error}>
      <div className={styles.yesno} role="group" aria-label={label}>
        <button
          type="button"
          aria-pressed={value === 1}
          className={`${styles.choice} ${value === 1 ? styles.choiceYesActive : ""}`}
          onClick={() => onChange(1)}
        >
          <Icon name="check" size={22} />
          {yes}
        </button>
        <button
          type="button"
          aria-pressed={value === 0}
          className={`${styles.choice} ${value === 0 ? styles.choiceNoActive : ""}`}
          onClick={() => onChange(0)}
        >
          <Icon name="cross" size={22} />
          {no}
        </button>
      </div>
    </FieldShell>
  );
}
