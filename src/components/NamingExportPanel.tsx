"use client";

import { useId, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  CloudUpload,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  FolderOpen,
  RefreshCw,
  RotateCcw,
  Settings,
  Sparkles,
  XCircle,
} from "lucide-react";
import {
  buildStandardFilename,
  getEffectiveKodeHak,
  HAK_OPTIONS,
  normalizeKecamatanName,
  normalizeKelurahanName,
  padFiveDigits,
  sanitizeCustomFilename,
  sanitizeDigits,
  sanitizeHakSegment,
  validateStandardFields,
} from "@/lib/su-formatter";
import type {
  AiEngineSource,
  AiStatus,
  ConfidenceLevel,
  DriveUploadResult,
  FieldConfidenceMeta,
  NamingMode,
  PdfQualityPreset,
  SuFieldConfidences,
  SuNamingFields,
} from "@/lib/su-types";

interface NamingExportPanelProps {
  aiStatus: AiStatus;
  aiSource: AiEngineSource | null;
  ocrProgress: number;
  aiMessage: string | null;
  isWrongPageSlot: boolean;
  hasPage1: boolean;
  hasPage2: boolean;
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
    teksLokasi: string | null;
    nibTerdeteksi: string | null;
  };
  warnings: string[];
  pdfQuality: PdfQualityPreset;
  onChangePdfQuality: (q: PdfQualityPreset) => void;
  isGeneratingPdf: boolean;
  isUploadingDrive: boolean;
  driveReady: boolean;
  autoUploadOnExport: boolean;
  onToggleAutoUpload: (next: boolean) => void;
  driveFolderId: string;
  driveFolderUrl: string;
  lastDriveResult: DriveUploadResult | null;
  lastDriveError: string | null;
  isDuplicateFilename: boolean;
  extractionVersion: number;
  onReExtractAi: () => void;
  onRunLocalOcr: () => void;
  onSwapPages: () => void;
  onExportPdf: () => void;
  onUploadToDrive: () => void;
  onOpenDriveConfig: () => void;
  onResetWorkspace: () => void;
  onAnnounce: (message: string) => void;
  onNotifyError: (message: string) => void;
}

function ConfidenceBadge({ meta }: { meta: FieldConfidenceMeta }) {
  const pct = meta.score !== null ? `${Math.round(meta.score * 100)}%` : null;

  const badgeStyles: Record<ConfidenceLevel, string> = {
    high: "bg-[#D9F99D] text-[#111111]",
    medium: "bg-[#FEF08A] text-[#111111]",
    low: "bg-[#FBCFE8] text-[#111111]",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border-2 border-[#111111] px-2.5 py-0.5 text-[11px] font-extrabold ${badgeStyles[meta.level]}`}
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
  aiSource,
  ocrProgress,
  aiMessage,
  isWrongPageSlot,
  hasPage1,
  hasPage2,
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
  isUploadingDrive,
  driveReady,
  autoUploadOnExport,
  onToggleAutoUpload,
  driveFolderId,
  driveFolderUrl,
  lastDriveResult,
  lastDriveError,
  isDuplicateFilename,
  extractionVersion,
  onReExtractAi,
  onRunLocalOcr,
  onSwapPages,
  onExportPdf,
  onUploadToDrive,
  onOpenDriveConfig,
  onResetWorkspace,
  onAnnounce,
  onNotifyError,
}: NamingExportPanelProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const nomorSuRef = useRef<HTMLInputElement>(null);
  const tahunSuRef = useRef<HTMLInputElement>(null);
  const kodeHakRef = useRef<HTMLSelectElement>(null);
  const customHakRef = useRef<HTMLInputElement>(null);
  const nomorHakRef = useRef<HTMLInputElement>(null);
  const kecamatanRef = useRef<HTMLInputElement>(null);
  const kelurahanRef = useRef<HTMLInputElement>(null);
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
  const kecamatanId = useId();
  const kecamatanHintId = useId();
  const kelurahanId = useId();
  const kelurahanHintId = useId();
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
  const normalizedKecamatan = normalizeKecamatanName(fields.kecamatan);
  const normalizedKelurahan = normalizeKelurahanName(fields.kelurahan);

  const showFieldError = (key: keyof typeof validation.errors) =>
    Boolean((touched[key] || submitAttempted) && validation.errors[key]);

  const validateForAction = (): boolean => {
    markSubmitAttempted();
    if (pageCount === 0) {
      const msg = "Unggah minimal 1 halaman Surat Ukur terlebih dahulu.";
      onAnnounce(msg);
      onNotifyError(msg);
      return false;
    }

    if (namingMode === "standard") {
      if (!validation.valid) {
        const firstInvalid = validation.errors.nomorSu
          ? nomorSuRef.current
          : validation.errors.tahunSu
            ? tahunSuRef.current
            : validation.errors.kodeHak
              ? fields.isCustomHak
                ? customHakRef.current
                : kodeHakRef.current
              : validation.errors.nomorHak
                ? nomorHakRef.current
                : null;
        firstInvalid?.focus();
        firstInvalid?.scrollIntoView({ behavior: "smooth", block: "center" });

        const missingNames = [
          validation.errors.nomorSu && "Nomor SU",
          validation.errors.tahunSu && "Tahun SU",
          validation.errors.kodeHak && "Jenis Hak",
          validation.errors.nomorHak && "Nomor Hak",
        ]
          .filter(Boolean)
          .join(", ");
        const msg = `Lengkapi kolom wajib terlebih dahulu: ${missingNames}.`;
        onAnnounce(msg);
        onNotifyError(msg);
        return false;
      }
    } else if (!customFilename.trim()) {
      customFileRef.current?.focus();
      customFileRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      const msg = "Masukkan nama file PDF terlebih dahulu.";
      onAnnounce(msg);
      onNotifyError(msg);
      return false;
    }
    return true;
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validateForAction()) return;
    onExportPdf();
  };

  const handleClickUploadDrive = () => {
    if (!validateForAction()) return;
    if (!normalizedKecamatan) {
      kecamatanRef.current?.focus();
      kecamatanRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      const msg =
        "Isi kolom Kecamatan terlebih dahulu agar subfolder Google Drive dapat dibuat.";
      onAnnounce(msg);
      onNotifyError(msg);
      return;
    }
    onUploadToDrive();
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

  const aiCardBg =
    aiStatus === "success"
      ? "bg-[#D9F99D]"
      : aiStatus === "error"
        ? "bg-[#FBCFE8]"
        : "bg-[#FEF08A]";
  const isBusyReading = aiStatus === "extracting" || aiStatus === "ocr-local";

  return (
    <aside aria-labelledby={formHeadingId} className="flex flex-col gap-4">
      {/* Bento Card 1: AI & Built-in Local OCR Status */}
      <div className={`nb-card ${aiCardBg} p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="nb-pill">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              {aiSource === "local-ocr" || aiStatus === "ocr-local"
                ? "OCR LOKAL"
                : "STATUS AI"}
            </span>
            <span className="text-xs font-extrabold text-[#111111]">
              {aiStatus === "extracting"
                ? "Menganalisis Vision AI…"
                : aiStatus === "ocr-local"
                  ? `OCR Sistem (${ocrProgress}%)…`
                  : aiStatus === "success"
                    ? aiSource === "local-ocr"
                      ? "Selesai (OCR Cadangan)"
                      : "Ekstraksi AI Selesai"
                    : aiStatus === "unconfigured"
                      ? "Key Kosong (Siap OCR Lokal)"
                      : aiStatus === "error"
                        ? "Fallback Manual"
                        : "Menunggu Gambar SU"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onReExtractAi}
              disabled={pageCount === 0 || isBusyReading}
              className="nb-btn-sm inline-flex min-h-9 items-center gap-1.5 bg-white px-2.5 py-1 text-xs text-[#111111] disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  aiStatus === "extracting" ? "animate-spin" : ""
                }`}
                aria-hidden="true"
              />
              Baca Ulang AI
            </button>
            <button
              type="button"
              onClick={onRunLocalOcr}
              disabled={pageCount === 0 || isBusyReading}
              title="Jalankan OCR bawaan sistem (tesseract.js) di browser tanpa API key"
              className="nb-btn-sm inline-flex min-h-9 items-center gap-1.5 bg-[#BAE6FD] px-2.5 py-1 text-xs text-[#111111] disabled:opacity-50"
            >
              <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
              OCR Lokal
            </button>
          </div>
        </div>

        {isBusyReading ? (
          <div className="mt-3">
            <progress
              aria-label={
                aiStatus === "ocr-local"
                  ? "OCR lokal sistem sedang berjalan"
                  : "Ekstraksi Vision AI sedang berjalan"
              }
              value={aiStatus === "ocr-local" ? ocrProgress : undefined}
              max={aiStatus === "ocr-local" ? 100 : undefined}
              className="su-progress h-2.5 w-full"
            />
          </div>
        ) : null}

        {aiMessage ? (
          <p className="mt-2.5 text-xs font-semibold leading-relaxed text-[#111111]/85">
            {aiMessage}
          </p>
        ) : null}
      </div>

      {/* Wrong Page Slot Banner (FR-03) */}
      {isWrongPageSlot ? (
        <div role="alert" className="nb-card bg-[#FBCFE8] p-3.5 text-xs">
          <p className="font-extrabold text-[#111111]">
            Gambar di Halaman 1 tampak seperti Peta Bidang. Apakah Anda ingin
            menukar posisi Halaman 1 dan Halaman 2?
          </p>
          {hasPage2 ? (
            <button
              type="button"
              onClick={onSwapPages}
              className="nb-btn-sm mt-2.5 inline-flex min-h-9 items-center gap-1.5 bg-[#FEF08A] px-3 py-1.5 text-xs text-[#111111]"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
              Tukar Halaman 1 &amp; 2
            </button>
          ) : null}
        </div>
      ) : null}

      {/* AI Warnings */}
      {warnings.length > 0 ? (
        <div className="space-y-2">
          {warnings.map((w, idx) => (
            <p
              key={idx}
              className="nb-card-sm flex items-start gap-2 bg-[#FEF08A] px-3.5 py-2.5 text-xs font-bold text-[#111111]"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{w}</span>
            </p>
          ))}
        </div>
      ) : null}

      {/* Duplicate Session Export Alert (FR-15) */}
      {isDuplicateFilename ? (
        <div
          role="status"
          className="nb-card-sm flex items-start gap-2 bg-[#FBCFE8] px-3.5 py-2.5 text-xs font-bold text-[#111111]"
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
        className="flex flex-col gap-4"
      >
        {/* Bento Card 2: Structured Fields */}
        <div className="nb-card flex flex-col gap-4 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#111111] pb-3">
            <h2
              id={formHeadingId}
              className="nb-micro text-sm font-black text-[#111111]"
            >
              Penamaan File Otomatis
            </h2>

            <fieldset className="flex items-center gap-3 border-0 p-0">
              <legend className="visually-hidden">Mode Penamaan File</legend>
              <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 text-xs font-extrabold text-[#111111]">
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
              <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 text-xs font-extrabold text-[#111111]">
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
              <div className="flex items-center justify-between rounded-xl border-2 border-[#111111] bg-[#F6F5F0] px-3.5 py-2.5">
                <span className="nb-micro text-[#111111]">
                  1. Prefix Dokumen
                </span>
                <span className="nb-pill font-mono text-xs">SU</span>
              </div>

              {/* 2. Nomor SU */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor={nomorSuId}
                    className="nb-micro text-[#111111]"
                  >
                    2. Nomor SU (5 Digit){" "}
                    <span aria-hidden="true" className="text-[#991B1B]">
                      *
                    </span>
                  </label>
                  <ConfidenceBadge meta={confidences.nomorSu} />
                </div>
                <span
                  id={nomorSuHintId}
                  className="text-[11px] font-semibold text-[#3F3F46]"
                >
                  {rawEvidence.teksNomorSu
                    ? `Terbaca: "${rawEvidence.teksNomorSu}" · zero-pad 5 digit`
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
                  className={`su-control w-full rounded-xl px-3.5 py-2 font-mono font-extrabold ${
                    showFieldError("nomorSu") ? "user-invalid-fallback" : ""
                  }`}
                />
                {showFieldError("nomorSu") ? (
                  <div
                    id={nomorSuErrorId}
                    className="flex items-center gap-1 text-xs font-extrabold text-[#991B1B]"
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
                    className="nb-micro text-[#111111]"
                  >
                    3. Tahun SU (4 Digit){" "}
                    <span aria-hidden="true" className="text-[#991B1B]">
                      *
                    </span>
                  </label>
                  <ConfidenceBadge meta={confidences.tahunSu} />
                </div>
                <span
                  id={tahunSuHintId}
                  className="text-[11px] font-semibold text-[#3F3F46]"
                >
                  4 digit tahun penerbitan (1960–{currentYear}, termasuk SU lama 60-an)
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
                  className={`su-control w-full rounded-xl px-3.5 py-2 font-mono font-extrabold ${
                    showFieldError("tahunSu") ? "user-invalid-fallback" : ""
                  }`}
                />
                {showFieldError("tahunSu") ? (
                  <div
                    id={tahunSuErrorId}
                    className="flex items-center gap-1 text-xs font-extrabold text-[#991B1B]"
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
                    className="nb-micro text-[#111111]"
                  >
                    4. Kode Jenis Hak{" "}
                    <span aria-hidden="true" className="text-[#991B1B]">
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
                  className="su-control w-full rounded-xl px-3 py-2 text-sm font-extrabold"
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
                      className="nb-micro mb-1 block text-[#3F3F46]"
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
                      className="su-control w-full rounded-xl px-3.5 py-2 font-mono font-extrabold uppercase"
                    />
                  </div>
                ) : null}

                {showFieldError("kodeHak") ||
                (!effectiveHak && submitAttempted) ? (
                  <div
                    id={kodeHakErrorId}
                    className="flex items-center gap-1 text-xs font-extrabold text-[#991B1B]"
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
                    className="nb-micro text-[#111111]"
                  >
                    5. Nomor Hak (5 Digit){" "}
                    <span aria-hidden="true" className="text-[#991B1B]">
                      *
                    </span>
                  </label>
                  <ConfidenceBadge meta={confidences.nomorHak} />
                </div>
                <span
                  id={nomorHakHintId}
                  className="text-[11px] font-semibold text-[#3F3F46]"
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
                  className={`su-control w-full rounded-xl px-3.5 py-2 font-mono font-extrabold ${
                    showFieldError("nomorHak") ? "user-invalid-fallback" : ""
                  }`}
                />
                {rawEvidence.nibTerdeteksi ? (
                  <p className="rounded-lg border border-[#111111]/30 bg-[#F6F5F0] px-2.5 py-1 font-mono text-[11px] font-bold text-[#111111]">
                    NIB terdeteksi (diabaikan): {rawEvidence.nibTerdeteksi}
                  </p>
                ) : null}
                {showFieldError("nomorHak") ? (
                  <div
                    id={nomorHakErrorId}
                    className="flex items-center gap-1 text-xs font-extrabold text-[#991B1B]"
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
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={customFileId}
                className="nb-micro text-[#111111]"
              >
                Nama File Kustom (Bebas){" "}
                <span aria-hidden="true" className="text-[#991B1B]">
                  *
                </span>
              </label>
              <span
                id={customFileHintId}
                className="text-[11px] font-semibold text-[#3F3F46]"
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
                className="su-control w-full rounded-xl px-3.5 py-2 font-mono text-sm font-extrabold"
              />
              {submitAttempted && !customFilename.trim() ? (
                <div
                  id={customFileErrorId}
                  className="flex items-center gap-1 text-xs font-extrabold text-[#991B1B]"
                >
                  <span role="img" aria-label="Galat">
                    ✕
                  </span>
                  <span>Nama file tidak boleh kosong.</span>
                </div>
              ) : null}
            </div>
          )}

          {/* 6. Kecamatan (Subfolder Drive) — active for both standard and custom naming */}
          <div className="flex flex-col gap-1 border-t-2 border-dashed border-[#111111]/35 pt-3.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={kecamatanId} className="nb-micro text-[#111111]">
                6. Kecamatan (Subfolder Drive)
              </label>
              <ConfidenceBadge
                meta={
                  normalizedKecamatan && confidences.kecamatan.score === null
                    ? { score: null, level: "high", reason: null }
                    : confidences.kecamatan
                }
              />
            </div>
            <span
              id={kecamatanHintId}
              className="text-[11px] font-semibold text-[#3F3F46]"
            >
              {rawEvidence.teksLokasi
                ? `Terbaca lokasi: "${rawEvidence.teksLokasi}" · dipakai sebagai subfolder Drive`
                : "Otomatis membuat subfolder di Google Drive sesuai nama Kecamatan"}
            </span>
            <input
              ref={kecamatanRef}
              id={kecamatanId}
              name="kecamatan"
              type="text"
              autoCorrect="off"
              spellCheck={false}
              maxLength={80}
              value={fields.kecamatan}
              aria-describedby={kecamatanHintId}
              onChange={(e) =>
                onChangeFields({
                  ...fields,
                  kecamatan: e.target.value,
                })
              }
              onBlur={() => {
                markTouched("kecamatan");
                if (fields.kecamatan.trim()) {
                  onChangeFields({
                    ...fields,
                    kecamatan: normalizeKecamatanName(fields.kecamatan),
                  });
                }
              }}
              placeholder="Misal: Medan Helvetia"
              className="su-control w-full rounded-xl px-3.5 py-2 text-sm font-extrabold"
            />
          </div>

          {/* 7. Kelurahan / Desa (Nested Subfolder Drive inside Kecamatan) */}
          <div className="flex flex-col gap-1 border-t-2 border-dashed border-[#111111]/25 pt-3.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={kelurahanId} className="nb-micro text-[#111111]">
                7. Kelurahan / Desa (Subfolder Drive)
              </label>
              <ConfidenceBadge
                meta={
                  fields.kelurahan.trim() &&
                  confidences.kelurahan.level === "low" &&
                  confidences.kelurahan.score === null
                    ? { score: null, level: "medium", reason: null }
                    : confidences.kelurahan
                }
              />
            </div>
            <span
              id={kelurahanHintId}
              className="text-[11px] font-semibold text-[#3F3F46]"
            >
              Otomatis dibuat di dalam folder Kecamatan (opsional untuk SU lama 1960-an)
            </span>
            <input
              ref={kelurahanRef}
              id={kelurahanId}
              name="kelurahan"
              type="text"
              autoCorrect="off"
              spellCheck={false}
              maxLength={80}
              value={fields.kelurahan}
              aria-describedby={kelurahanHintId}
              onChange={(e) =>
                onChangeFields({
                  ...fields,
                  kelurahan: e.target.value,
                })
              }
              onBlur={() => {
                markTouched("kelurahan");
                if (fields.kelurahan.trim()) {
                  onChangeFields({
                    ...fields,
                    kelurahan: normalizeKelurahanName(fields.kelurahan),
                  });
                }
              }}
              placeholder="Misal: Helvetia Timur"
              className="su-control w-full rounded-xl px-3.5 py-2 text-sm font-extrabold"
            />
          </div>
        </div>

        {/* Bento Card 3: Live Final Filename Preview */}
        <div className="nb-card bg-[#FEF08A] p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="nb-pill">Preview Nama File Final</span>
            <button
              type="button"
              onClick={handleCopyFilename}
              className="nb-btn-sm inline-flex min-h-8 items-center gap-1 bg-white px-2.5 py-0.5 text-[11px] text-[#111111]"
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
          <p className="mt-2.5 break-all rounded-xl border-2 border-[#111111] bg-white px-3 py-2.5 font-mono text-sm font-black text-[#111111]">
            {finalFilename}
          </p>
        </div>

        {/* Bento Card 4: PDF Quality, Local Export & Google Drive Subfolder */}
        <div className="nb-card flex flex-col gap-3 bg-[#BAE6FD] p-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={qualityId} className="nb-micro text-[#111111]">
              Kualitas &amp; Kompresi PDF
            </label>
            <select
              id={qualityId}
              name="pdfQuality"
              value={pdfQuality}
              onChange={(e) =>
                onChangePdfQuality(e.target.value as PdfQualityPreset)
              }
              className="su-control w-full rounded-xl px-3 py-2 text-sm font-extrabold"
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

          <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-xl border-2 border-[#111111] bg-white px-3 py-2 text-xs font-extrabold text-[#111111]">
            <input
              type="checkbox"
              checked={autoUploadOnExport}
              onChange={(e) => onToggleAutoUpload(e.target.checked)}
              className="h-4 w-4 shrink-0"
            />
            <span>
              Sekaligus upload ke Google Drive saat{" "}
              <strong>Simpan &amp; Download</strong>
            </span>
          </label>

          <button
            type="submit"
            disabled={isGeneratingPdf || isUploadingDrive || pageCount === 0}
            className="nb-btn inline-flex min-h-12 w-full items-center justify-center gap-2 bg-[#D9F99D] px-5 py-3 text-sm font-black text-[#111111] disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>
              {isGeneratingPdf
                ? "Menyusun & Mengunduh PDF…"
                : `Simpan & Download PDF (${pageCount} Hal)`}
            </span>
          </button>

          {/* Direct Upload to Google Drive Subfolder button right below Simpan & Download */}
          <button
            type="button"
            onClick={handleClickUploadDrive}
            disabled={isGeneratingPdf || isUploadingDrive || pageCount === 0}
            className="nb-btn inline-flex min-h-12 w-full items-center justify-center gap-2 bg-[#FDE047] px-5 py-3 text-sm font-black text-[#111111] disabled:cursor-not-allowed disabled:opacity-55"
          >
            <CloudUpload className="h-4 w-4" aria-hidden="true" />
            <span>
              {isUploadingDrive
                ? "Mengunggah ke Subfolder Drive…"
                : normalizedKecamatan && normalizedKelurahan
                  ? `Upload Langsung ke Drive (/ ${normalizedKecamatan} / ${normalizedKelurahan})`
                  : normalizedKecamatan
                    ? `Upload Langsung ke Drive (/ ${normalizedKecamatan})`
                    : "Upload Langsung ke Drive"}
            </span>
          </button>

          {/* Google Drive Subfolder Info & Result Box */}
          <div className="rounded-xl border-2 border-[#111111] bg-white p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="nb-pill text-[10px]">
                <FolderOpen className="h-3 w-3" aria-hidden="true" />
                Tujuan Subfolder Drive
              </span>
              <button
                type="button"
                onClick={onOpenDriveConfig}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border-2 border-[#111111] bg-[#F6F5F0] px-2.5 py-0.5 text-[11px] font-extrabold text-[#111111] hover:bg-[#FEF08A]"
              >
                <Settings className="h-3 w-3" aria-hidden="true" />
                {driveReady ? "Terhubung" : "Hubungkan Drive"}
              </button>
            </div>

            <div className="rounded-lg border border-[#111111]/35 bg-[#F6F5F0] px-2.5 py-2 text-[11px]">
              <div className="flex items-center justify-between gap-2 font-bold text-[#3F3F46]">
                <span>Jalur folder otomatis:</span>
                <a
                  href={driveFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono font-extrabold text-[#111111] underline"
                  title={`Buka Folder Induk Drive (${driveFolderId})`}
                >
                  Drive Induk
                  <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                </a>
              </div>
              <p className="mt-1 break-all font-mono text-xs font-extrabold text-[#111111]">
                / {normalizedKecamatan || "(Isi Kecamatan)"}
                {normalizedKelurahan ? ` / ${normalizedKelurahan}` : ""} /{" "}
                {finalFilename}
              </p>
            </div>

            {lastDriveError ? (
              <div
                role="alert"
                className="rounded-lg border-2 border-[#111111] bg-[#FECACA] p-2.5 text-xs space-y-1.5"
              >
                <p className="font-extrabold text-[#111111]">
                  Upload Google Drive Gagal: {lastDriveError}
                </p>
                <button
                  type="button"
                  onClick={onOpenDriveConfig}
                  className="nb-btn-sm inline-flex items-center gap-1 bg-white px-2.5 py-1 text-[11px] font-extrabold text-[#111111]"
                >
                  <Settings className="h-3 w-3" aria-hidden="true" />
                  Cek Koneksi &amp; Pengaturan Drive
                </button>
              </div>
            ) : null}

            {lastDriveResult ? (
              <div className="rounded-lg border-2 border-[#111111] bg-[#D9F99D] p-2.5 text-xs space-y-1.5">
                <p className="font-extrabold text-[#111111]">
                  {lastDriveResult.kelurahanName
                    ? `Tersimpan ke subfolder "${lastDriveResult.kecamatanName || normalizedKecamatan} / ${lastDriveResult.kelurahanName}" (${lastDriveResult.kelurahanCreated ? "folder Kelurahan baru dibuat" : "memakai folder Kelurahan yang sudah ada"}).`
                    : lastDriveResult.folderCreated
                      ? `Subfolder baru "${lastDriveResult.folderName}" dibuat & berkas dimasukkan.`
                      : `Subfolder "${lastDriveResult.folderName}" sudah ada — berkas dimasukkan ke folder tersebut.`}
                </p>
                {normalizedKelurahan &&
                lastDriveResult.nestedSupported === false ? (
                  <p className="rounded border border-[#111111] bg-[#FEF08A] px-2 py-1 text-[11px] font-bold text-[#111111]">
                    Catatan: Web App Google Apps Script masih versi lama sehingga berkas masuk ke folder Kecamatan saja. Klik tombol Terhubung di atas lalu salin &amp; Deploy New version agar subfolder Kelurahan aktif otomatis.
                  </p>
                ) : null}
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <a
                    href={lastDriveResult.folderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-[#111111] bg-white px-2 py-0.5 text-[11px] font-extrabold text-[#111111]"
                  >
                    Buka Folder
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                  <a
                    href={lastDriveResult.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-[#111111] bg-[#FEF08A] px-2 py-0.5 text-[11px] font-extrabold text-[#111111]"
                  >
                    Lihat File PDF
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onResetWorkspace}
            className="nb-btn-sm inline-flex min-h-10 w-full items-center justify-center gap-1.5 bg-white px-4 py-2 text-xs text-[#111111]"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset / Scan Berikutnya
          </button>
        </div>
      </form>
    </aside>
  );
}
