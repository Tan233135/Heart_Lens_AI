// Language-aware audio clip helper for the welcome + result narration (CLAUDE.md §1 — many
// users read with difficulty, so key moments are SPOKEN with pre-recorded Bangla/English audio).
//
// Files live in /public/audio and follow the source naming convention exactly:
//   <baseName>(<lang>).mp3   e.g.  welcome(bn).mp3, result_high(en).mp3
// Two files per clip (one per language). The active language comes from the existing language
// toggle (lib/i18n) at PLAY time — see useAudioClip — so toggling swaps the clip immediately.

import type { Lang } from "@/lib/i18n";
import type { RiskCategory } from "@/lib/types";

// The five recorded clips (each has an (en) and a (bn) file).
export type ClipBaseName =
  | "welcome"
  | "result_low"
  | "result_moderate"
  | "result_high"
  | "result_rough";

// Build the public path for a clip in a given language. Centralised so the parenthesised
// naming convention lives in ONE place and the player can never drift from the files on disk.
export function audioClipSrc(baseName: ClipBaseName, lang: Lang): string {
  return `/audio/${baseName}(${lang}).mp3`;
}

// Map a result outcome to its clip. A "rough" (low-confidence / partial-data) estimate gets a
// dedicated clip that frames the result as approximate, regardless of the low/moderate/high band
// — honesty about uncertainty is a hard requirement (CLAUDE.md §2, §6).
export function resultClip(category: RiskCategory, rough = false): ClipBaseName {
  if (rough) return "result_rough";
  return (`result_${category}` as ClipBaseName);
}
