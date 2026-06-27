"use client";

// Shared wrapper for every form field: icon + label, optional helper, and an
// error slot. Keeps the three field types visually consistent.

import type { ReactNode } from "react";
import Icon, { type IconName } from "@/components/Icon";
import styles from "./field.module.css";

export default function FieldShell({
  icon,
  label,
  helper,
  error,
  htmlFor,
  badge,
  children,
}: {
  icon: IconName;
  label: string;
  helper?: string;
  error?: string;
  htmlFor?: string;
  /** Provenance hint, e.g. "from photo — please confirm" for OCR-extracted fields. */
  badge?: string;
  children: ReactNode;
}) {
  return (
    <div className={`${styles.field} ${error ? styles.hasError : ""}`}>
      <label className={styles.labelRow} htmlFor={htmlFor}>
        <span className={styles.labelIcon} aria-hidden="true">
          <Icon name={icon} size={22} />
        </span>
        <span className={styles.labelText}>
          {label}
          {badge ? (
            <span className={styles.badge}>
              <Icon name="camera" size={14} />
              {badge}
            </span>
          ) : null}
          {helper ? <span className={styles.helper}>{helper}</span> : null}
        </span>
      </label>

      {children}

      {error ? (
        <p className={styles.error} role="alert">
          <Icon name="cross" size={16} />
          {error}
        </p>
      ) : null}
    </div>
  );
}
