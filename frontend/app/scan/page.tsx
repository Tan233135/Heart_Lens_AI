"use client";

// OCR upload screen (CLAUDE.md §2, §8). The user uploads/snaps a photo of their report;
// we POST it to /predict-from-image. CRITICAL: we do NOT decide risk here. Whatever the
// backend returns — success OR a "couldn't read enough" fallback — we hand to the manual
// form (/check), which is the confirm/complete step. We NEVER show a risk score built on
// failed or unconfirmed OCR; the form requires the user to confirm the values first.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/Button";
import Icon from "@/components/Icon";
import { ApiError, predictFromImage } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { clearOcr, saveOcr } from "@/lib/ocrStore";
import { saveResult } from "@/lib/resultStore";
import type { PredictFromImageResponse } from "@/lib/types";
import styles from "./page.module.css";

// Did OCR read enough real, sufficiently-complete data to trust the prediction WITHOUT a
// manual confirmation step? Mirrors the backend safety gate: ocr_success is set true only when
// n_extracted >= min_required_fields (MIN_OCR_FIELDS) AND a prediction was produced. We re-check
// all three on the client so this stays correct even if the backend contract shifts.
function ocrResultIsTrustworthy(r: PredictFromImageResponse): boolean {
  return (
    r.ocr_success &&
    r.prediction != null &&
    r.n_extracted >= r.min_required_fields
  );
}

export default function ScanPage() {
  const { lang } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Revoke the object URL when it changes / on unmount to avoid leaks.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function pickFile(f: File | null) {
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (f) {
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
    } else {
      setFile(null);
      setPreviewUrl(null);
    }
  }

  async function readReport() {
    if (!file) return;
    setError(null);
    setLoading(true);
    try {
      const res = await predictFromImage(file);

      if (ocrResultIsTrustworthy(res)) {
        // SUCCESS PATH (decision: skip the §2 confirm step for the photo flow). OCR read enough
        // complete data, so we show the result the backend ALREADY computed — we do NOT recompute
        // or discard res.prediction. Build the same StoredResult the wizard produces so the
        // results page renders identically (same component, same confidence framing).
        const features: Record<string, number | null> = { ...res.extracted_values };
        for (const k of res.missing_fields) features[k] = null; // imputed by the model pipeline
        clearOcr(); // drop any stale scan payload so /check isn't pre-seeded by this success
        saveResult({
          features,
          response: res.prediction!, // non-null by ocrResultIsTrustworthy
          source: "ocr",
          confidence: res.confidence ?? "full",
          unknownFields: res.missing_fields,
          rough: res.confidence === "rough",
        });
        router.push("/results");
        return;
      }

      // FALLBACK PATH: OCR failed or read too few values. Hand the WHOLE response to the wizard,
      // which shows the right banner and PRE-FILLS res.extracted_values so the user only fills the
      // gaps. The §2 safety gate is unchanged — we never show a risk score built on this.
      saveOcr(res);
      router.push("/check");
    } catch (e) {
      const tooBig = e instanceof ApiError && e.status === 413;
      setError(
        tooBig
          ? lang === "bn"
            ? "ছবিটি অনেক বড়। ছোট বা স্পষ্ট ছবি দিন।"
            : "The image is too large. Try a smaller or clearer photo."
          : lang === "bn"
            ? "ছবি পড়তে সমস্যা হয়েছে। আবার চেষ্টা করুন বা হাতে তথ্য দিন।"
            : "Couldn't process the image. Try again, or enter values by hand.",
      );
      setLoading(false);
    }
  }

  return (
    <div className="container fade-in">
      <h1 className={styles.title}>
        {lang === "bn" ? "রিপোর্টের ছবি দিন" : "Upload your report"}
      </h1>
      <p className={styles.sub}>
        {lang === "bn"
          ? "রিপোর্টের একটি স্পষ্ট ছবি তুলুন বা গ্যালারি থেকে বেছে নিন। এরপর আপনি মানগুলো মিলিয়ে দেখতে পারবেন।"
          : "Take a clear photo of your report or pick one from your gallery. You'll get to check the values next."}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className={styles.hiddenInput}
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />

      {/* Big tap target: either the empty dropzone or the chosen image preview. */}
      {previewUrl ? (
        <div className={styles.previewCard}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="" className={styles.preview} />
          <button
            type="button"
            className={styles.changeBtn}
            onClick={() => inputRef.current?.click()}
            disabled={loading}
          >
            <Icon name="image" size={20} />
            {lang === "bn" ? "অন্য ছবি দিন" : "Choose another"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.dropzone}
          onClick={() => inputRef.current?.click()}
        >
          <Icon name="camera" size={56} />
          <span className={styles.dropTitle}>
            {lang === "bn" ? "ছবি তুলুন বা বেছে নিন" : "Take or choose a photo"}
          </span>
        </button>
      )}

      {error ? (
        <p className={styles.error} role="alert">
          <Icon name="cross" size={20} />
          {error}
        </p>
      ) : null}

      <div className={styles.actions}>
        <Button
          size="lg"
          fullWidth
          icon={<Icon name="upload" size={24} />}
          disabled={!file || loading}
          onClick={readReport}
        >
          {loading
            ? lang === "bn"
              ? "রিপোর্ট পড়া হচ্ছে…"
              : "Reading your report…"
            : lang === "bn"
              ? "রিপোর্ট পড়ুন"
              : "Read report"}
        </Button>

        {/* Always offer the safe manual path directly (no dependency on OCR). */}
        <Button
          size="lg"
          fullWidth
          variant="ghost"
          icon={<Icon name="edit" size={22} />}
          disabled={loading}
          onClick={() => router.push("/check")}
        >
          {lang === "bn" ? "হাতে তথ্য দিন" : "Enter by hand instead"}
        </Button>
      </div>

      {loading ? (
        <p className={styles.hint}>
          {lang === "bn"
            ? "একটু সময় লাগতে পারে। অনুগ্রহ করে অপেক্ষা করুন।"
            : "This can take a moment. Please wait."}
        </p>
      ) : null}
    </div>
  );
}
