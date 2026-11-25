"use client";

import { useId, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  RefreshCw,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  buildStandardFilename,
  getEffectiveKodeHak,
  HAK_OPTIONS,
  padFiveDigits,
  sanitizeCustomFilename,
  sanitizeDigits,
  sanitizeHakSegment,
  validateStandardFields,
} from "@/lib/su-formatter";
import type {
  AiStatus,
  ConfidenceLevel,
  FieldConfidenceMeta,
  NamingMode,
  PdfQualityPreset,
  SuFieldConfidences,
  SuNamingFields,
} from "@/lib/su-types";

interface NamingExportPanelProps {
  aiStatus: AiStatus;
  aiMessage: string | null;
  isWrongPageSlot: boolean;
  hasPage1: boolean;
  hasPage2: boolean;
  allowSinglePagePdf: boolean;
  namingMode: NamingMode;
  onChangeNamingMode: (mode: NamingMode) => void;
  fields: SuNamingFields;
  onChangeFields: (next: SuNamingFields) => void;
  customFilename: string;
  onChangeCustomFilename: (val: string) => void;
  confidences: SuFieldConfidences;
  rawEvidence: {
    teksNomorSu: string | null;
    teksNomorHak: string | null;
    nibTerdeteksi: string | null;
  };
  warnings: string[];
  pdfQuality: PdfQualityPreset;
  onChangePdfQuality: (q: PdfQualityPreset) => void;
  isGeneratingPdf: boolean;
  isDuplicateFilename: boolean;
  extractionVersion: number;
  onReExtractAi: () => void;
  onSwapPages: () => void;
  onExportPdf: () => void;
  onResetWorkspace: () => void;
  onAnnounce: (message: string) => void;
}

function ConfidenceBadge({ meta }: { meta: FieldConfidenceMeta }) {
  const pct =
    meta.score !== null ? `${Math.round(meta.score * 100)}%` : null;

  const badgeStyles: Record<ConfidenceLevel, string> = {
    high: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
    medium:
      "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200",
    low: "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeStyles[meta.level]}`}
    >
      {meta.level === "high" ? (
        <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
      ) : meta.level === "medium" ? (
        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
      ) : (
        <XCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
      )}
      <span>
        {meta.level === "high"
          ? pct
            ? `Yakin (${pct})`
            : "Yakin"
          : meta.level === "medium"
            ? pct
              ? `Perlu Cek (${pct})`
              : "Perlu Cek"
            : pct && meta.score !== null && meta.score > 0
              ? `Rendah (${pct})`
              : "Perlu Isi"}
      </span>
    </span>
  );
}

export function NamingExportPanel({
  aiStatus,
  aiMessage,
  isWrongPageSlot,
  hasPage1,
  hasPage2,
  allowSinglePagePdf,
  namingMode,
  onChangeNamingMode,
  fields,
  onChangeFields,
  customFilename,
  onChangeCustomFilename,
  confidences,
  rawEvidence,
  warnings,
  pdfQuality,
  onChangePdfQuality,
  isGeneratingPdf,
  isDuplicateFilename,
  extractionVersion,
  onReExtractAi,
  onSwapPages,
  onExportPdf,
  onResetWorkspace,
  onAnnounce,
}: NamingExportPanelProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const nomorSuRef = useRef<HTMLInputElement>(null);
  const tahunSuRef = useRef<HTMLInputElement>(null);
  const kodeHakRef = useRef<HTMLSelectElement>(null);
  const customHakRef = useRef<HTMLInputElement>(null);
  const nomorHakRef = useRef<HTMLInputElement>(null);
  const customFileRef = useRef<HTMLInputElement>(null);

  const [interaction, setInteraction] = useState<{
    version: number;
    touched: Record<string, boolean>;
    submitAttempted: boolean;
  }>({
    version: extractionVersion,
    touched: {},
    submitAttempted: false,
  });
  const [copied, setCopied] = useState(false);

  const touched =
    interaction.version === extractionVersion ? interaction.touched : {};
  const submitAttempted =
    interaction.version === extractionVersion
      ? interaction.submitAttempted
      : false;

  const markTouched = (field: string) => {
    setInteraction((prev) => ({
      version: extractionVersion,
      submitAttempted:
        prev.version === extractionVersion ? prev.submitAttempted : false,
      touched: {
        ...(prev.version === extractionVersion ? prev.touched : {}),
        [field]: true,
      },
    }));
  };

  const markSubmitAttempted = () => {
    setInteraction((prev) => ({
      version: extractionVersion,
      touched: prev.version === extractionVersion ? prev.touched : {},
      submitAttempted: true,
    }));
  };

  const formHeadingId = useId();
  const nomorSuId = useId();
  const nomorSuHintId = useId();
  const nomorSuErrorId = useId();
  const tahunSuId = useId();
  const tahunSuHintId = useId();
  const tahunSuErrorId = useId();
  const kodeHakId = useId();
  const kodeHakErrorId = useId();
  const customHakId = useId();
  const nomorHakId = useId();
  const nomorHakHintId = useId();
  const nomorHakErrorId = useId();
  const customFileId = useId();
  const customFileHintId = useId();
  const customFileErrorId = useId();
  const qualityId = useId();

  const currentYear = new Date().getFullYear();
  const validation = validateStandardFields(fields, currentYear);

  const finalFilename =
    namingMode === "standard"
      ? buildStandardFilename(fields)
      : sanitizeCustomFilename(customFilename);

  const pageCount = (hasPage1 ? 1 : 0) + (hasPage2 ? 1 : 0);
  const missingRequiredPage = !hasPage1 || (!hasPage2 && !allowSinglePagePdf);

  const showFieldError = (key: keyof typeof validation.errors) =>
    Boolean((touched[key] || submitAttempted) && validation.errors[key]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    markSubmitAttempted();

    if (missingRequiredPage) {
      onAnnounce(
        "Halaman 2 belum diunggah. Tambahkan Halaman 2 atau centang Tetap buat PDF 1 halaman.",
      );
      return;
    }

    if (namingMode === "standard") {
      if (!validation.valid) {
        if (validation.errors.nomorSu) nomorSuRef.current?.focus();
        else if (validation.errors.tahunSu) tahunSuRef.current?.focus();
        else if (validation.errors.kodeHak) {
          if (fields.isCustomHak) customHakRef.current?.focus();
          else kodeHakRef.current?.focus();
        } else if (validation.errors.nomorHak) nomorHakRef.current?.focus();

        onAnnounce("Terdapat kolom penamaan Surat Ukur yang belum valid.");
        return;
      }
    } else if (!customFilename.trim()) {
      customFileRef.current?.focus();
      onAnnounce("Masukkan nama file PDF terlebih dahulu.");
      return;
    }

    onExportPdf();
  };

  const handleCopyFilename = async () => {
    try {
      await navigator.clipboard.writeText(finalFilename);
      setCopied(true);
      onAnnounce(`Nama file ${finalFilename} disalin ke papan klip.`);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      onAnnounce("Gagal menyalin nama file.");
    }
  };

  const effectiveHak = getEffectiveKodeHak(fields);
  const selectValue = fields.isCustomHak ? "CUSTOM" : fields.kodeHak || "";

  return (
    <aside
      aria-labelledby={formHeadingId}
      className="flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-xs sm:p-5"
    >
      {/* AI Extraction Status Card */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/45 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold">
            <Sparkles className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            <span>
              STATUS AI:{" "}
              {aiStatus === "extracting"
                ? "Menganalisis Halaman 1…"
                : aiStatus === "success"
                  ? "Ekstraksi Selesai"
                  : aiStatus === "unconfigured"
                    ? "Mode Manual (API Key Kosong)"
                    : aiStatus === "error"
                      ? "Fallback Manual"
                      : "Menunggu Halaman 1"}
            </span>
          </div>
          <button
            type="button"
            onClick={onReExtractAi}
            disabled={!hasPage1 || aiStatus === "extracting"}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border-control)] bg-[var(--surface-card)] px-2.5 py-1 text-xs font-semibold text-[var(--ink-primary)] transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                aiStatus === "extracting" ? "animate-spin" : ""
              }`}
              aria-hidden="true"
            />
            Baca Ulang AI
          </button>
        </div>

        {aiStatus === "extracting" ? (
          <div className="mt-2.5">
            <progress
              aria-label="Ekstraksi Vision AI sedang berjalan"
              className="su-progress h-2 w-full"
            />
          </div>
        ) : null}

        {aiMessage ? (
          <p className="mt-2 text-xs leading-relaxed text-[var(--ink-secondary)]">
            {aiMessage}
          </p>
        ) : null}
      </div>

      {/* Wrong Page Slot Banner (FR-03 / Section 10.6 #4) */}
      {isWrongPageSlot ? (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-amber-400 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100"
        >
          <p className="font-semibold">
            Gambar di Halaman 1 tampak seperti Peta Bidang. Apakah Anda ingin
            menukar posisi Halaman 1 dan Halaman 2?
          </p>
          {hasPage2 ? (
            <button
              type="button"
              onClick={onSwapPages}
              className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
              Tukar Halaman 1 &amp; 2
            </button>
          ) : null}
        </div>
      ) : null}

      {/* AI Warnings */}
      {warnings.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {warnings.map((w, idx) => (
            <p
              key={idx}
              className="flex items-start gap-1.5 rounded-lg border border-amber-300/80 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{w}</span>
            </p>
          ))}
        </div>
      ) : null}

      {/* Duplicate Session Export Alert (FR-15) */}
      {isDuplicateFilename ? (
        <div
          role="status"
          className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Nama file <strong className="font-mono">{finalFilename}</strong>{" "}
            sudah ada di Riwayat Sesi. Pastikan ini bukan duplikasi berkas.
          </span>
        </div>
      ) : null}

      {/* Naming & Export Form */}
      <form
        ref={formRef}
        noValidate
        onSubmit={handleSubmit}
        aria-labelledby={formHeadingId}
        className="mt-4 flex flex-1 flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
          <h2
            id={formHeadingId}
            className="text-sm font-bold tracking-wide text-[var(--ink-primary)] uppercase"
          >
            Penamaan File Otomatis
          </h2>

          <fieldset className="flex items-center gap-3 border-0 p-0">
            <legend className="visually-hidden">Mode Penamaan File</legend>
            <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 text-xs font-semibold">
              <input
                type="radio"
                name="namingMode"
                value="standard"
                checked={namingMode === "standard"}
                onChange={() => onChangeNamingMode("standard")}
                className="h-4 w-4"
              />
              <span>Mode Standar</span>
            </label>
            <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 text-xs font-semibold">
              <input
                type="radio"
                name="namingMode"
                value="custom"
                checked={namingMode === "custom"}
                onChange={() => {
                  onChangeCustomFilename(finalFilename);
                  onChangeNamingMode("custom");
                }}
                className="h-4 w-4"
              />
              <span>Edit Bebas</span>
            </label>
          </fieldset>
        </div>

        {namingMode === "standard" ? (
          <div className="space-y-3.5">
            {/* 1. Prefix */}
            <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/40 px-3.5 py-2.5">
              <span className="text-xs font-semibold text-[var(--ink-secondary)]">
                1. Prefix Dokumen
              </span>
              <span className="rounded-md bg-[var(--surface-card)] px-2.5 py-0.5 font-mono text-sm font-bold text-[var(--ink-primary)] shadow-2xs">
                SU
              </span>
            </div>

            {/* 2. Nomor SU */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={nomorSuId}
                  className="text-xs font-bold text-[var(--ink-primary)]"
                >
                  2. Nomor SU (5 Digit){" "}
                  <span aria-hidden="true" className="text-[var(--danger)]">
                    *
                  </span>
                </label>
                <ConfidenceBadge meta={confidences.nomorSu} />
              </div>
              <span
                id={nomorSuHintId}
                className="text-[11px] text-[var(--ink-secondary)]"
              >
                {rawEvidence.teksNomorSu
                  ? `Terbaca: "${rawEvidence.teksNomorSu}" · zero-pad 5 digit saat keluar kolom`
                  : "Angka sebelum garis miring pertama (contoh: 06 → 00006)"}
              </span>
              <input
                ref={nomorSuRef}
                id={nomorSuId}
                name="nomorSu"
                type="text"
                inputMode="numeric"
                enterKeyHint="next"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={5}
                required
                pattern="\d{1,5}"
                value={fields.nomorSu}
                aria-invalid={showFieldError("nomorSu") ? "true" : "false"}
                aria-describedby={
                  showFieldError("nomorSu")
                    ? `${nomorSuHintId} ${nomorSuErrorId}`
                    : nomorSuHintId
                }
                onChange={(e) =>
                  onChangeFields({
                    ...fields,
                    nomorSu: sanitizeDigits(e.target.value).slice(0, 5),
                  })
                }
                onBlur={() => {
                  markTouched("nomorSu");
                  if (fields.nomorSu) {
                    onChangeFields({
                      ...fields,
                      nomorSu: padFiveDigits(fields.nomorSu),
                    });
                  }
                }}
                placeholder="00006"
                className={`su-control w-full rounded-xl border bg-[var(--surface-card)] px-3.5 py-2 font-mono font-semibold text-[var(--ink-primary)] ${
                  showFieldError("nomorSu") ? "user-invalid-fallback" : ""
                }`}
              />
              {showFieldError("nomorSu") ? (
                <div
                  id={nomorSuErrorId}
                  className="flex items-center gap-1 text-xs font-medium text-[var(--danger)]"
                >
                  <span role="img" aria-label="Galat">
                    ✕
                  </span>
                  <span>{validation.errors.nomorSu}</span>
                </div>
              ) : null}
            </div>

            {/* 3. Tahun SU */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={tahunSuId}
                  className="text-xs font-bold text-[var(--ink-primary)]"
                >
                  3. Tahun SU (4 Digit){" "}
                  <span aria-hidden="true" className="text-[var(--danger)]">
                    *
                  </span>
                </label>
                <ConfidenceBadge meta={confidences.tahunSu} />
              </div>
              <span
                id={tahunSuHintId}
                className="text-[11px] text-[var(--ink-secondary)]"
              >
                4 digit tahun penerbitan (1960–{currentYear})
              </span>
              <input
                ref={tahunSuRef}
                id={tahunSuId}
                name="tahunSu"
                type="text"
                inputMode="numeric"
                enterKeyHint="next"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={4}
                required
                pattern="\d{4}"
                value={fields.tahunSu}
                aria-invalid={showFieldError("tahunSu") ? "true" : "false"}
                aria-describedby={
                  showFieldError("tahunSu")
                    ? `${tahunSuHintId} ${tahunSuErrorId}`
                    : tahunSuHintId
                }
                onChange={(e) =>
                  onChangeFields({
                    ...fields,
                    tahunSu: sanitizeDigits(e.target.value).slice(0, 4),
                  })
                }
                onBlur={() => markTouched("tahunSu")}
                placeholder="2007"
                className={`su-control w-full rounded-xl border bg-[var(--surface-card)] px-3.5 py-2 font-mono font-semibold text-[var(--ink-primary)] ${
                  showFieldError("tahunSu") ? "user-invalid-fallback" : ""
                }`}
              />
              {showFieldError("tahunSu") ? (
                <div
                  id={tahunSuErrorId}
                  className="flex items-center gap-1 text-xs font-medium text-[var(--danger)]"
                >
                  <span role="img" aria-label="Galat">
                    ✕
                  </span>
                  <span>{validation.errors.tahunSu}</span>
                </div>
              ) : null}
            </div>

            {/* 4. Kode Jenis Hak */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={kodeHakId}
                  className="text-xs font-bold text-[var(--ink-primary)]"
                >
                  4. Kode Jenis Hak{" "}
                  <span aria-hidden="true" className="text-[var(--danger)]">
                    *
                  </span>
                </label>
                <ConfidenceBadge meta={confidences.kodeHak} />
              </div>
              <select
                ref={kodeHakRef}
                id={kodeHakId}
                name="kodeHak"
                required
                value={selectValue}
                aria-invalid={showFieldError("kodeHak") ? "true" : "false"}
                aria-describedby={
                  showFieldError("kodeHak") ? kodeHakErrorId : undefined
                }
                onChange={(e) => {
                  const val = e.target.value;
                  markTouched("kodeHak");
                  if (val === "CUSTOM") {
                    onChangeFields({
                      ...fields,
                      isCustomHak: true,
                    });
                  } else {
                    onChangeFields({
                      ...fields,
                      isCustomHak: false,
                      kodeHak: val,
                    });
                  }
                }}
                className="su-control w-full rounded-xl border bg-[var(--surface-card)] px-3 py-2 text-sm font-semibold text-[var(--ink-primary)]"
              >
                <option value="" disabled>
                  -- Pilih Jenis Hak --
                </option>
                {HAK_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                ))}
                <option value="CUSTOM">Lainnya (Input Kode Manual)</option>
              </select>

              {fields.isCustomHak ? (
                <div className="mt-1.5">
                  <label
                    htmlFor={customHakId}
                    className="mb-1 block text-[11px] font-semibold text-[var(--ink-secondary)]"
                  >
                    Kode Jenis Hak Kustom (Huruf Kapital)
                  </label>
                  <input
                    ref={customHakRef}
                    id={customHakId}
                    name="customHak"
                    type="text"
                    autoCorrect="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    maxLength={6}
                    required
                    value={fields.customHak}
                    onChange={(e) =>
                      onChangeFields({
                        ...fields,
                        customHak: sanitizeHakSegment(e.target.value),
                      })
                    }
                    onBlur={() => markTouched("kodeHak")}
                    placeholder="Misal: M atau HGB"
                    className="su-control w-full rounded-xl border bg-[var(--surface-card)] px-3.5 py-2 font-mono font-semibold uppercase"
                  />
                </div>
              ) : null}

              {showFieldError("kodeHak") || (!effectiveHak && submitAttempted) ? (
                <div
                  id={kodeHakErrorId}
                  className="flex items-center gap-1 text-xs font-medium text-[var(--danger)]"
                >
                  <span role="img" aria-label="Galat">
                    ✕
                  </span>
                  <span>{validation.errors.kodeHak}</span>
                </div>
              ) : null}
            </div>

            {/* 5. Nomor Hak */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={nomorHakId}
                  className="text-xs font-bold text-[var(--ink-primary)]"
                >
                  5. Nomor Hak (5 Digit){" "}
                  <span aria-hidden="true" className="text-[var(--danger)]">
                    *
                  </span>
                </label>
                <ConfidenceBadge meta={confidences.nomorHak} />
              </div>
              <span
                id={nomorHakHintId}
                className="text-[11px] text-[var(--ink-secondary)]"
              >
                {rawEvidence.teksNomorHak
                  ? `Terbaca: "${rawEvidence.teksNomorHak}"`
                  : "5 digit terakhir Nomor Hak 14 digit (bukan NIB 13 digit)"}
              </span>
              <input
                ref={nomorHakRef}
                id={nomorHakId}
                name="nomorHak"
                type="text"
                inputMode="numeric"
                enterKeyHint="done"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={5}
                required
                pattern="\d{1,5}"
                value={fields.nomorHak}
                aria-invalid={showFieldError("nomorHak") ? "true" : "false"}
                aria-describedby={
                  showFieldError("nomorHak")
                    ? `${nomorHakHintId} ${nomorHakErrorId}`
                    : nomorHakHintId
                }
                onChange={(e) =>
                  onChangeFields({
                    ...fields,
                    nomorHak: sanitizeDigits(e.target.value).slice(0, 5),
                  })
                }
                onBlur={() => {
                  markTouched("nomorHak");
                  if (fields.nomorHak) {
                    onChangeFields({
                      ...fields,
                      nomorHak: padFiveDigits(fields.nomorHak),
                    });
                  }
                }}
                placeholder="02246"
                className={`su-control w-full rounded-xl border bg-[var(--surface-card)] px-3.5 py-2 font-mono font-semibold text-[var(--ink-primary)] ${
                  showFieldError("nomorHak") ? "user-invalid-fallback" : ""
                }`}
              />
              {rawEvidence.nibTerdeteksi ? (
                <p className="font-mono text-[11px] text-[var(--ink-secondary)]">
                  NIB terdeteksi (diabaikan): {rawEvidence.nibTerdeteksi}
                </p>
              ) : null}
              {showFieldError("nomorHak") ? (
                <div
                  id={nomorHakErrorId}
                  className="flex items-center gap-1 text-xs font-medium text-[var(--danger)]"
                >
                  <span role="img" aria-label="Galat">
                    ✕
                  </span>
                  <span>{validation.errors.nomorHak}</span>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          /* Edit Bebas Mode */
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor={customFileId}
              className="text-xs font-bold text-[var(--ink-primary)]"
            >
              Nama File Kustom (Bebas){" "}
              <span aria-hidden="true" className="text-[var(--danger)]">
                *
              </span>
            </label>
            <span
              id={customFileHintId}
              className="text-[11px] text-[var(--ink-secondary)]"
            >
              Gunakan mode ini untuk kasus di luar format standar SU. Ekstensi
              .pdf ditambahkan otomatis.
            </span>
            <input
              ref={customFileRef}
              id={customFileId}
              name="customFilename"
              type="text"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={customFilename}
              aria-invalid={
                submitAttempted && !customFilename.trim() ? "true" : "false"
              }
              aria-describedby={
                submitAttempted && !customFilename.trim()
                  ? `${customFileHintId} ${customFileErrorId}`
                  : customFileHintId
              }
              onChange={(e) => onChangeCustomFilename(e.target.value)}
              placeholder="SU.00006.2007.M.02246.pdf"
              className="su-control w-full rounded-xl border bg-[var(--surface-card)] px-3.5 py-2 font-mono text-sm font-semibold text-[var(--ink-primary)]"
            />
            {submitAttempted && !customFilename.trim() ? (
              <div
                id={customFileErrorId}
                className="flex items-center gap-1 text-xs font-medium text-[var(--danger)]"
              >
                <span role="img" aria-label="Galat">
                  ✕
                </span>
                <span>Nama file tidak boleh kosong.</span>
              </div>
            ) : null}
          </div>
        )}

        {/* Live Final Filename Preview */}
        <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/8 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold tracking-wider text-[var(--accent)] uppercase">
              Preview Nama File Final
            </span>
            <button
              type="button"
              onClick={handleCopyFilename}
              className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/12"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Tersalin
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  Salin
                </>
              )}
            </button>
          </div>
          <p className="mt-1 break-all font-mono text-sm font-bold text-[var(--ink-primary)]">
            {finalFilename}
          </p>
        </div>

        {/* PDF Quality Preset */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor={qualityId}
            className="text-xs font-bold text-[var(--ink-primary)]"
          >
            Kualitas &amp; Kompresi PDF
          </label>
          <select
            id={qualityId}
            name="pdfQuality"
            value={pdfQuality}
            onChange={(e) =>
              onChangePdfQuality(e.target.value as PdfQualityPreset)
            }
            className="su-control w-full rounded-xl border bg-[var(--surface-card)] px-3 py-2 text-sm font-semibold text-[var(--ink-primary)]"
          >
            <option value="standard">
              Standar (~800 KB · target &lt; 1.5 MB)
            </option>
            <option value="high">
              Tinggi (~1.4 MB · detail angka ekstra tajam)
            </option>
            <option value="compact">
              Hemat (~400 KB · unggah cepat)
            </option>
          </select>
        </div>

        {/* Export & Reset CTA Buttons */}
        <div className="mt-auto space-y-2.5 pt-2">
          {missingRequiredPage ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200">
              Unggah Halaman 2 atau centang{" "}
              <strong>Tetap buat PDF 1 halaman</strong> di bawah kanvas untuk
              mengunduh PDF.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isGeneratingPdf || pageCount === 0}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-bold text-[var(--accent-ink)] shadow-sm transition-opacity hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>
              {isGeneratingPdf
                ? "Menyusun & Mengunduh PDF…"
                : `Buat & Unduh PDF (${pageCount} Hal)`}
            </span>
          </button>

          <button
            type="button"
            onClick={onResetWorkspace}
            className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-2 text-xs font-semibold text-[var(--ink-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink-primary)]"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset / Scan Berikutnya
          </button>
        </div>
      </form>
    </aside>
  );
}
