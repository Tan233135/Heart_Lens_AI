// Small formatting helpers. Bangla-numeral conversion lets us show counts in the user's
// own script (low-literacy-friendly, CLAUDE.md §1).

import type { Lang } from "./i18n";

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function toBnDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

export function localeNum(lang: Lang, value: string | number): string {
  return lang === "bn" ? toBnDigits(value) : String(value);
}
