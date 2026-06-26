"use client";

// Numeric field: large editable value flanked by big − / + steppers, with a slider
// for fine adjustment once a value exists. Starts EMPTY (no default) — we never want a
// placeholder default to be mistaken for a real measurement (CLAUDE.md §2 spirit).

import { useId } from "react";
import type { IconName } from "@/components/Icon";
import FieldShell from "./FieldShell";
import styles from "./field.module.css";

function roundToStep(n: number, step: number): number {
  const decimals = (String(step).split(".")[1] ?? "").length;
  return Number(n.toFixed(decimals));
}

export default function NumberField({
  icon,
  label,
  helper,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  error,
}: {
  icon: IconName;
  label: string;
  helper?: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  error?: string;
}) {
  const id = useId();

  const clamp = (n: number) => roundToStep(Math.min(max, Math.max(min, n)), step);

  const dec = () => onChange(value === undefined ? min : clamp(value - step));
  const inc = () => onChange(value === undefined ? min : clamp(value + step));

  const handleInput = (raw: string) => {
    if (raw.trim() === "") {
      onChange(undefined);
      return;
    }
    const n = Number(raw);
    if (Number.isNaN(n)) return; // ignore non-numeric keystrokes
    onChange(n);
  };

  return (
    <FieldShell icon={icon} label={label} helper={helper} error={error} htmlFor={id}>
      <div className={styles.numberRow}>
        <button
          type="button"
          className={styles.stepper}
          onClick={dec}
          disabled={value !== undefined && value <= min}
          aria-label={`Decrease ${label}`}
        >
          −
        </button>

        <div className={styles.numberInputWrap}>
          <input
            id={id}
            className={styles.numberInput}
            type="number"
            inputMode="decimal"
            value={value ?? ""}
            min={min}
            max={max}
            step={step}
            placeholder="—"
            onChange={(e) => handleInput(e.target.value)}
            // Clamp into range only when the user leaves the field, so typing isn't fought.
            onBlur={() => {
              if (value !== undefined) onChange(clamp(value));
            }}
            aria-describedby={`${id}-range`}
          />
          {unit ? <span className={styles.unit}>{unit}</span> : null}
        </div>

        <button
          type="button"
          className={styles.stepper}
          onClick={inc}
          disabled={value !== undefined && value >= max}
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>

      {/* Slider appears only once a value exists, for fine adjustment. */}
      {value !== undefined ? (
        <input
          className={styles.slider}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(roundToStep(Number(e.target.value), step))}
          aria-label={`${label} slider`}
        />
      ) : null}

      <span id={`${id}-range`} className="sr-only">
        Allowed range {min} to {max} {unit ?? ""}
      </span>
    </FieldShell>
  );
}
