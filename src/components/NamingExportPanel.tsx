"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  FileSearch,
  FileSpreadsheet,
  FolderOpen,
  RefreshCw,
  RotateCcw,
  SearchCheck,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  WifiOff,
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
import {
  getKecamatanOptions,
  getKelurahanOptions,
  matchWilayahKecamatan,
  matchWilayahKelurahan,
  validateHakRegionCrossCheck,
  type LearnedWilayahCodeMapping,
} from "@/lib/wilayah-dict";
import type {
  AiEngineSource,
  AiStatus,
  ConfidenceLevel,
  DriveConflictPolicy,
  DriveDuplicateCheckResult,
  DriveUploadResult,
  FieldConfidenceMeta,
  NamingMode,
  PdfOrientationMode,
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
  pdfOrientation?: PdfOrientationMode;
  onChangePdfOrientation?: (mode: PdfOrientationMode) => void;
  isGeneratingPdf: boolean;
  isUploadingDrive: boolean;
  driveUploadedForCurrent?: boolean;
  driveReady: boolean;
  autoUploadOnExport: boolean;
  onToggleAutoUpload: (next: boolean) => void;
  driveFolderId: string;
  driveFolderUrl: string;
  lastDriveResult: DriveUploadResult | null;
  lastDriveError: string | null;
  isDuplicateFilename: boolean;
  extractionVersion: number;
  conflictPolicy?: DriveConflictPolicy;
  onChangeConflictPolicy?: (policy: DriveConflictPolicy) => void;
  searchablePdf?: boolean;
  onToggleSearchablePdf?: (next: boolean) => void;
  syncToSheet?: boolean;
  onToggleSyncToSheet?: (next: boolean) => void;
  driveSheetUrl?: string | null;
  isEnsuringSheet?: boolean;
  onEnsureSheet?: () => void;
  learnedWilayahCodes?: readonly LearnedWilayahCodeMapping[];
  appsScriptUrl?: string;
  pendingOfflineCount?: number;
  onSyncOfflineNow?: () => void;
  onFieldCorrected?: (
    field: "kecamatan" | "kelurahan" | "kodeHak",
    fromValue: string,
    toValue: string,
    evidence?: string | null,
  ) => void;
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
    high: "border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]",
    medium: "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]",
    low: "border-[#FECDD3] bg-[#FFF1F2] text-[#9F1239]",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badgeStyles[meta.level]}`}
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
  pdfOrientation = "landscape-ccw",
  onChangePdfOrientation,
  isGeneratingPdf,
  isUploadingDrive,
  driveUploadedForCurrent = false,
  driveReady,
  autoUploadOnExport,
  onToggleAutoUpload,
  driveFolderId,
  driveFolderUrl,
  lastDriveResult,
  lastDriveError,
  isDuplicateFilename,
  extractionVersion,
  conflictPolicy = "revision",
  onChangeConflictPolicy,
  searchablePdf = true,
  onToggleSearchablePdf,
  syncToSheet = true,
  onToggleSyncToSheet,
  driveSheetUrl,
  isEnsuringSheet = false,
  onEnsureSheet,
  learnedWilayahCodes,
  appsScriptUrl,
  pendingOfflineCount = 0,
  onSyncOfflineNow,
  onFieldCorrected,
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
  const kecDatalistId = useId();
  const kelurahanId = useId();
  const kelurahanHintId = useId();
  const kelDatalistId = useId();
  const nibId = useId();
  const luasId = useId();
  const customFileId = useId();
  const customFileHintId = useId();
  const customFileErrorId = useId();
  const qualityId = useId();
  const orientationId = useId();
  const conflictPolicyId = useId();

  const [cloudDupState, setCloudDupState] = useState<{
    key: string;
    loading: boolean;
    result: DriveDuplicateCheckResult | null;
    error: string | null;
  }>({ key: "", loading: false, result: null, error: null });
  const [manualCheckTick, setManualCheckTick] = useState(0);

  const currentYear = new Date().getFullYear();
  const validation = validateStandardFields(fields, currentYear);

  const finalFilename =
    namingMode === "standard"
      ? buildStandardFilename(fields)
      : sanitizeCustomFilename(customFilename);

  const pageCount = (hasPage1 ? 1 : 0) + (hasPage2 ? 1 : 0);
  const normalizedKecamatan = normalizeKecamatanName(fields.kecamatan);
  const normalizedKelurahan = normalizeKelurahanName(fields.kelurahan);

  const kecOptions = useMemo(() => getKecamatanOptions(), []);
  const kelOptions = useMemo(
    () => getKelurahanOptions(normalizedKecamatan || fields.kecamatan),
    [normalizedKecamatan, fields.kecamatan],
  );

  const hakCrossCheck = useMemo(
    () =>
      validateHakRegionCrossCheck({
        rawNomorHak: rawEvidence.teksNomorHak,
        kecamatan: normalizedKecamatan || fields.kecamatan,
        kelurahan: normalizedKelurahan || fields.kelurahan,
        learnedCodes: learnedWilayahCodes,
      }),
    [
      rawEvidence.teksNomorHak,
      normalizedKecamatan,
      fields.kecamatan,
      normalizedKelurahan,
      fields.kelurahan,
      learnedWilayahCodes,
    ],
  );

  const cloudCheckKey = `${driveFolderId}|${normalizedKecamatan}|${normalizedKelurahan}|${finalFilename}|${manualCheckTick}`;

  useEffect(() => {
    if (!driveReady || !normalizedKecamatan || !finalFilename || pageCount === 0) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCloudDupState({
        key: cloudCheckKey,
        loading: true,
        result: null,
        error: null,
      });
      try {
        const res = await fetch("/api/drive/check-duplicate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            filename: finalFilename,
            kecamatan: normalizedKecamatan,
            kelurahan: normalizedKelurahan,
            rootFolderId: driveFolderId,
            appsScriptUrl,
          }),
        });
        const data = (await res.json().catch(() => null)) as
          | (DriveDuplicateCheckResult & { error?: string })
          | null;
        if (!controller.signal.aborted) {
          if (res.ok && data) {
            setCloudDupState({
              key: cloudCheckKey,
              loading: false,
              result: data,
              error: null,
            });
          } else {
            setCloudDupState({
              key: cloudCheckKey,
              loading: false,
              result: null,
              error: data?.error || `HTTP ${res.status}`,
            });
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setCloudDupState({
            key: cloudCheckKey,
            loading: false,
            result: null,
            error: err instanceof Error ? err.message : "Gagal memeriksa Drive",
          });
        }
      }
    }, 850);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    driveReady,
    normalizedKecamatan,
    normalizedKelurahan,
    finalFilename,
    pageCount,
    driveFolderId,
    appsScriptUrl,
    cloudCheckKey,
  ]);

  const activeCloudCheck =
    cloudDupState.key === cloudCheckKey ? cloudDupState : null;

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

  const handleClickUploadDrive = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (
      isGeneratingPdf ||
      isUploadingDrive ||
      pageCount === 0 ||
      driveUploadedForCurrent ||
      e.currentTarget.disabled
    ) {
      return;
    }
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
    // Synchronously prevent any rapid second click in the same event tick
    e.currentTarget.disabled = true;
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
      ? "border-[#A7F3D0] bg-[#ECFDF5]/60"
      : aiStatus === "error"
        ? "border-[#FECDD3] bg-[#FFF1F2]"
        : "border-[#DDD6FE] bg-[#F5F3FF]/75";
  const isBusyReading = aiStatus === "extracting" || aiStatus === "ocr-local";

  return (
    <aside aria-labelledby={formHeadingId} className="flex flex-col gap-4">
      {/* Card 1: AI & Built-in Local OCR Status */}
      <div className={`nb-card ${aiCardBg} p-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="nb-pill bg-white">
              <Sparkles className="h-3 w-3 text-[#5E17EB]" aria-hidden="true" />
              {aiSource === "local-ocr" || aiStatus === "ocr-local"
                ? "OCR LOKAL"
                : "STATUS AI"}
            </span>
            <span className="text-xs font-bold text-[#111114]">
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
              className="nb-btn-sm inline-flex min-h-9 items-center gap-1.5 bg-white px-2.5 py-1 text-xs text-[#111114] hover:bg-[#F9FAFB] disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-[#5E17EB] ${
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
              className="nb-btn-sm inline-flex min-h-9 items-center gap-1.5 bg-[#F6F7F9] px-2.5 py-1 text-xs text-[#111114] hover:bg-white disabled:opacity-50"
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
          <p className="mt-2.5 text-xs font-medium leading-relaxed text-[#4B5563]">
            {aiMessage}
          </p>
        ) : null}
      </div>

      {/* Wrong Page Slot Banner (FR-03) */}
      {isWrongPageSlot ? (
        <div
          role="alert"
          className="nb-card border-[#FECDD3] bg-[#FFF1F2] p-3.5 text-xs"
        >
          <p className="font-bold text-[#9F1239]">
            Gambar di Halaman 1 tampak seperti Peta Bidang. Apakah Anda ingin
            menukar posisi Halaman 1 dan Halaman 2?
          </p>
          {hasPage2 ? (
            <button
              type="button"
              onClick={onSwapPages}
              className="nb-btn-sm mt-2.5 inline-flex min-h-9 items-center gap-1.5 bg-white px-3 py-1.5 text-xs text-[#111114]"
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
              className="nb-card-sm flex items-start gap-2 border-[#FDE68A] bg-[#FFFBEB] px-3.5 py-2.5 text-xs font-semibold text-[#92400E]"
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
          className="nb-card-sm flex items-start gap-2 border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2.5 text-xs font-semibold text-[#9F1239]"
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
        {/* Card 2: Structured Fields */}
        <div className="nb-card flex flex-col gap-4 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E7EB] pb-3">
            <h2
              id={formHeadingId}
              className="nb-micro text-xs font-bold text-[#111114] sm:text-sm"
            >
              Penamaan File Otomatis
            </h2>

            <fieldset className="flex items-center gap-3 border-0 p-0">
              <legend className="visually-hidden">Mode Penamaan File</legend>
              <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 text-xs font-semibold text-[#111114]">
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
              <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 text-xs font-semibold text-[#111114]">
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
              <div className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] px-3.5 py-2.5">
                <span className="nb-micro text-[#4B5563]">
                  1. Prefix Dokumen
                </span>
                <span className="nb-pill bg-white font-mono text-xs">SU</span>
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
          <div className="flex flex-col gap-1 border-t border-dashed border-[#E5E7EB] pt-3.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={kecamatanId} className="nb-micro text-[#111114]">
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
              className="text-[11px] font-medium text-[#4B5563]"
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
              list={kecDatalistId}
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
                const raw = fields.kecamatan.trim();
                if (raw) {
                  const matched =
                    matchWilayahKecamatan(raw).matched ||
                    normalizeKecamatanName(raw);
                  if (matched && matched !== raw) {
                    onFieldCorrected?.(
                      "kecamatan",
                      raw,
                      matched,
                      rawEvidence.teksLokasi,
                    );
                  }
                  onChangeFields({
                    ...fields,
                    kecamatan: matched,
                  });
                }
              }}
              placeholder="Misal: Medan Helvetia"
              className="su-control w-full rounded-xl px-3.5 py-2 text-sm font-bold"
            />
            <datalist id={kecDatalistId}>
              {kecOptions.map((opt) => (
                <option key={opt} value={opt} />
              ))}
            </datalist>
          </div>

          {/* 7. Kelurahan / Desa (Nested Subfolder Drive inside Kecamatan) */}
          <div className="flex flex-col gap-1 border-t border-dashed border-[#E5E7EB] pt-3.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={kelurahanId} className="nb-micro text-[#111114]">
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
              className="text-[11px] font-medium text-[#4B5563]"
            >
              Otomatis dibuat di dalam folder Kecamatan (mendukung koreksi ejaan kamus Medan/Deli Serdang)
            </span>
            <input
              ref={kelurahanRef}
              id={kelurahanId}
              name="kelurahan"
              type="text"
              list={kelDatalistId}
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
                const raw = fields.kelurahan.trim();
                if (raw) {
                  const matched =
                    matchWilayahKelurahan(
                      raw,
                      normalizedKecamatan || fields.kecamatan,
                    ).matched || normalizeKelurahanName(raw);
                  if (matched && matched !== raw) {
                    onFieldCorrected?.(
                      "kelurahan",
                      raw,
                      matched,
                      rawEvidence.teksLokasi,
                    );
                  }
                  onChangeFields({
                    ...fields,
                    kelurahan: matched,
                  });
                }
              }}
              placeholder="Misal: Helvetia Timur"
              className="su-control w-full rounded-xl px-3.5 py-2 text-sm font-bold"
            />
            <datalist id={kelDatalistId}>
              {kelOptions.map((opt) => (
                <option key={opt} value={opt} />
              ))}
            </datalist>

            {/* Cross-Check 8-Digit Nomor Hak vs Kecamatan/Kelurahan */}
            {hakCrossCheck.prefix8 ? (
              <div
                className={`mt-1.5 flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold ${
                  hakCrossCheck.status === "mismatch"
                    ? "border-[#FECDD3] bg-[#FFF1F2] text-[#9F1239]"
                    : hakCrossCheck.status === "match"
                      ? "border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]"
                      : "border-[#E5E7EB] bg-[#F9FAFB] text-[#4B5563]"
                }`}
              >
                {hakCrossCheck.status === "mismatch" ? (
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <span className="font-mono font-bold">
                    Kode Wilayah {hakCrossCheck.prefix8}:
                  </span>{" "}
                  {hakCrossCheck.message}
                </div>
              </div>
            ) : null}

            {/* Optional Metadata for Google Sheets & Excel Rekap (NIB & Luas Tanah) */}
            <div className="mt-2 grid grid-cols-1 gap-2 border-t border-dashed border-[#E5E7EB] pt-2.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor={nibId} className="nb-micro text-[10px] text-[#4B5563]">
                  NIB (Opsional Rekap)
                </label>
                <input
                  id={nibId}
                  type="text"
                  maxLength={32}
                  value={fields.nib || ""}
                  onChange={(e) =>
                    onChangeFields({
                      ...fields,
                      nib: e.target.value,
                    })
                  }
                  placeholder="00412 / 12.01..."
                  className="su-control rounded-lg px-2.5 py-1.5 font-mono text-xs font-semibold"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor={luasId} className="nb-micro text-[10px] text-[#4B5563]">
                  Luas Tanah (m²)
                </label>
                <input
                  id={luasId}
                  type="text"
                  maxLength={24}
                  value={fields.luasTanah || ""}
                  onChange={(e) =>
                    onChangeFields({
                      ...fields,
                      luasTanah: e.target.value,
                    })
                  }
                  placeholder="Misal: 145 m2"
                  className="su-control rounded-lg px-2.5 py-1.5 font-mono text-xs font-semibold"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Live Final Filename Preview */}
        <div className="nb-card border-[#DDD6FE] bg-[#F5F3FF]/70 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="nb-pill bg-white text-[#4C0FD1]">
              Preview Nama File Final
            </span>
            <button
              type="button"
              onClick={handleCopyFilename}
              className="nb-btn-sm inline-flex min-h-8 items-center gap-1 bg-white px-2.5 py-0.5 text-[11px] text-[#111114] hover:bg-[#F9FAFB]"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[#065F46]" aria-hidden="true" />
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
          <p className="mt-2.5 break-all rounded-xl border border-[#DDD6FE] bg-white px-3 py-2.5 font-mono text-sm font-bold text-[#111114]">
            {finalFilename}
          </p>

          {/* Real-time Cloud Deduplication Lookup Result */}
          {driveReady && normalizedKecamatan && pageCount > 0 ? (
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-[11px]">
              {activeCloudCheck?.loading ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#4B5563]">
                  <SearchCheck className="h-3.5 w-3.5 animate-pulse text-[#5E17EB]" aria-hidden="true" />
                  Mengecek duplikat langsung di Google Drive…
                </span>
              ) : activeCloudCheck?.result?.supported &&
                activeCloudCheck.result.exists ? (
                <div className="flex flex-1 flex-wrap items-center justify-between gap-2 text-[#9F1239]">
                  <span className="inline-flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Sudah ada di Drive ({activeCloudCheck.result.matches.length} berkas)
                  </span>
                  {activeCloudCheck.result.matches[0]?.url ? (
                    <a
                      href={activeCloudCheck.result.matches[0].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-bold text-[#5E17EB] underline"
                    >
                      Lihat Berkas Lama
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              ) : activeCloudCheck?.result?.supported ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#065F46]">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Aman · Belum ada file bernama sama di Drive
                </span>
              ) : activeCloudCheck?.result && !activeCloudCheck.result.supported ? (
                <span className="font-medium text-[#4B5563]">
                  {activeCloudCheck.result.message || "Update Apps Script untuk cek Cloud Drive."}
                </span>
              ) : activeCloudCheck?.error ? (
                <span className="font-medium text-[#92400E]">
                  Cek Cloud Drive dilewati: {activeCloudCheck.error}
                </span>
              ) : (
                <span className="font-medium text-[#4B5563]">
                  Siap cek duplikat langsung ke Cloud Drive
                </span>
              )}
              <button
                type="button"
                onClick={() => setManualCheckTick((t) => t + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] px-2 py-0.5 text-[10px] font-bold text-[#111114] hover:bg-[#F3F4F6]"
              >
                <RefreshCw className="h-2.5 w-2.5" aria-hidden="true" />
                Cek Ulang
              </button>
            </div>
          ) : null}
        </div>

        {/* Card 4: PDF Quality, Local Export & Google Drive Subfolder */}
        <div className="nb-card flex flex-col gap-3 bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-1">
            <label htmlFor={qualityId} className="nb-micro text-[#111114]">
              Tingkat Resolusi PDF (Semua Tetap Jernih)
            </label>
            <select
              id={qualityId}
              name="pdfQuality"
              value={pdfQuality}
              onChange={(e) =>
                onChangePdfQuality(e.target.value as PdfQualityPreset)
              }
              className="su-control w-full rounded-xl px-3 py-2 text-sm font-semibold"
            >
              <option value="compact">
                Rendah (1750px · ukuran ringan, teks tetap jernih)
              </option>
              <option value="standard">
                Sedang (2250px · seimbang &amp; jernih)
              </option>
              <option value="high">
                Tinggi (Otomatis · 2800px paling jernih untuk Unduh &amp; Drive)
              </option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={orientationId} className="nb-micro text-[#111114]">
              Orientasi Halaman PDF
            </label>
            <select
              id={orientationId}
              name="pdfOrientation"
              value={pdfOrientation}
              onChange={(e) =>
                onChangePdfOrientation?.(e.target.value as PdfOrientationMode)
              }
              className="su-control w-full rounded-xl px-3 py-2 text-sm font-semibold"
            >
              <option value="landscape-ccw">
                Selalu Landscape (Putar foto berdiri 90° kiri — standar)
              </option>
              <option value="landscape-cw">
                Selalu Landscape (Putar foto berdiri 90° kanan)
              </option>
              <option value="auto">
                Otomatis (Ikuti posisi asli foto)
              </option>
            </select>
          </div>

          <div className="space-y-2 rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] p-2.5">
            <label className="inline-flex min-h-7 w-full cursor-pointer items-center gap-2 text-xs font-semibold text-[#111114]">
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

            {onToggleSearchablePdf ? (
              <label className="inline-flex min-h-7 w-full cursor-pointer items-center gap-2 text-xs font-semibold text-[#111114]">
                <input
                  type="checkbox"
                  checked={searchablePdf}
                  onChange={(e) => onToggleSearchablePdf(e.target.checked)}
                  className="h-4 w-4 shrink-0"
                />
                <FileSearch className="h-3.5 w-3.5 shrink-0 text-[#5E17EB]" aria-hidden="true" />
                <span>
                  PDF Searchable (tanam teks OCR Ctrl+F di balik gambar)
                </span>
              </label>
            ) : null}

            {onToggleSyncToSheet ? (
              <label className="inline-flex min-h-7 w-full cursor-pointer items-center gap-2 text-xs font-semibold text-[#111114]">
                <input
                  type="checkbox"
                  checked={syncToSheet}
                  onChange={(e) => onToggleSyncToSheet(e.target.checked)}
                  className="h-4 w-4 shrink-0"
                />
                <span>
                  Catat otomatis ke <strong>Google Sheets Rekap</strong> setelah upload
                </span>
              </label>
            ) : null}

            {onChangeConflictPolicy ? (
              <div className="flex flex-col gap-1 border-t border-[#E5E7EB] pt-2">
                <label
                  htmlFor={conflictPolicyId}
                  className="nb-micro text-[10px] text-[#4B5563]"
                >
                  Kebijakan Konflik File di Drive
                </label>
                <select
                  id={conflictPolicyId}
                  value={conflictPolicy}
                  onChange={(e) =>
                    onChangeConflictPolicy(e.target.value as DriveConflictPolicy)
                  }
                  className="su-control w-full rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                >
                  <option value="revision">
                    Simpan sebagai _rev2 / _rev3 bila file sudah ada
                  </option>
                  <option value="overwrite">
                    Timpa (Overwrite) file lama di folder Drive
                  </option>
                  <option value="skip">
                    Lewati (Skip) upload bila nama sama sudah ada
                  </option>
                </select>
              </div>
            ) : null}
          </div>

          {pendingOfflineCount > 0 && onSyncOfflineNow ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-[#92400E]">
                <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {pendingOfflineCount} berkas di Antrean Offline
              </span>
              <button
                type="button"
                onClick={onSyncOfflineNow}
                className="nb-btn-sm bg-white px-2.5 py-1 text-[11px] font-bold text-[#111114]"
              >
                Kirim Ulang Sekarang
              </button>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isGeneratingPdf || isUploadingDrive || pageCount === 0}
            className="nb-btn wollo-cta-primary inline-flex min-h-12 w-full items-center justify-center gap-2 px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55"
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
            disabled={
              isGeneratingPdf ||
              isUploadingDrive ||
              pageCount === 0 ||
              driveUploadedForCurrent
            }
            className="nb-btn wollo-cta-dark inline-flex min-h-12 w-full items-center justify-center gap-2 px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-55"
          >
            {driveUploadedForCurrent && !isUploadingDrive ? (
              <CheckCircle2 className="h-4 w-4 text-[#A7F3D0]" aria-hidden="true" />
            ) : (
              <CloudUpload className="h-4 w-4" aria-hidden="true" />
            )}
            <span>
              {isUploadingDrive
                ? "Mengunggah ke Subfolder Drive…"
                : driveUploadedForCurrent
                  ? normalizedKecamatan && normalizedKelurahan
                    ? `Sudah Terupload ke Drive (/ ${normalizedKecamatan} / ${normalizedKelurahan})`
                    : normalizedKecamatan
                      ? `Sudah Terupload ke Drive (/ ${normalizedKecamatan})`
                      : "Sudah Terupload ke Drive"
                  : normalizedKecamatan && normalizedKelurahan
                    ? `Upload Langsung ke Drive (/ ${normalizedKecamatan} / ${normalizedKelurahan})`
                    : normalizedKecamatan
                      ? `Upload Langsung ke Drive (/ ${normalizedKecamatan})`
                      : "Upload Langsung ke Drive"}
            </span>
          </button>

          {/* Google Drive Subfolder Info & Result Box */}
          <div className="space-y-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="nb-pill bg-white text-[10px]">
                <FolderOpen className="h-3 w-3 text-[#5E17EB]" aria-hidden="true" />
                Tujuan Subfolder Drive
              </span>
              <button
                type="button"
                onClick={onOpenDriveConfig}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#111114] hover:bg-[#F6F7F9]"
              >
                <Settings className="h-3 w-3" aria-hidden="true" />
                {driveReady ? "Terhubung" : "Hubungkan Drive"}
              </button>
            </div>

            <div className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-2 text-[11px]">
              <div className="flex items-center justify-between gap-2 font-semibold text-[#4B5563]">
                <span>Jalur folder otomatis:</span>
                <a
                  href={driveFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono font-bold text-[#5E17EB] hover:underline"
                  title={`Buka Folder Induk Drive (${driveFolderId})`}
                >
                  Drive Induk
                  <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                </a>
              </div>
              <p className="mt-1 break-all font-mono text-xs font-bold text-[#111114]">
                / {normalizedKecamatan || "(Isi Kecamatan)"}
                {normalizedKelurahan ? ` / ${normalizedKelurahan}` : ""} /{" "}
                {finalFilename}
              </p>
            </div>

            {driveReady ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-2 text-[11px]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-[#4B5563]">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-[#065F46]" aria-hidden="true" />
                  Sheets: <code className="font-mono font-bold text-[#111114]">Rekap_Scan_SU</code>
                </span>
                {lastDriveResult?.sheetUrl || driveSheetUrl ? (
                  <a
                    href={lastDriveResult?.sheetUrl || driveSheetUrl || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-[#A7F3D0] bg-[#ECFDF5] px-2 py-0.5 font-bold text-[#065F46] hover:bg-[#D1FAE5]"
                  >
                    Buka Google Sheets
                    <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                  </a>
                ) : onEnsureSheet ? (
                  <button
                    type="button"
                    disabled={isEnsuringSheet}
                    onClick={onEnsureSheet}
                    className="inline-flex items-center gap-1 rounded-md border border-[#E5E7EB] bg-[#F9FAFB] px-2 py-0.5 font-bold text-[#111114] hover:bg-[#F3F4F6] disabled:opacity-50"
                  >
                    {isEnsuringSheet ? "Mengecek…" : "Siapkan / Cek Sheets"}
                  </button>
                ) : null}
              </div>
            ) : null}

            {lastDriveError ? (
              <div
                role="alert"
                className="space-y-1.5 rounded-lg border border-[#FECDD3] bg-[#FFF1F2] p-2.5 text-xs"
              >
                <p className="font-bold text-[#9F1239]">
                  Upload Google Drive Gagal: {lastDriveError}
                </p>
                <button
                  type="button"
                  onClick={onOpenDriveConfig}
                  className="nb-btn-sm inline-flex items-center gap-1 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#111114]"
                >
                  <Settings className="h-3 w-3" aria-hidden="true" />
                  Cek Koneksi &amp; Pengaturan Drive
                </button>
              </div>
            ) : null}

            {lastDriveResult ? (
              <div className="space-y-1.5 rounded-lg border border-[#A7F3D0] bg-[#ECFDF5] p-2.5 text-xs">
                <p className="font-bold text-[#065F46]">
                  {lastDriveResult.skipped
                    ? `Dilewati (${lastDriveResult.fileName} sudah ada di Drive).`
                    : lastDriveResult.overwritten
                      ? `Berhasil menimpa berkas lama "${lastDriveResult.fileName}" di subfolder "${lastDriveResult.kelurahanName ? `${lastDriveResult.kecamatanName || normalizedKecamatan} / ${lastDriveResult.kelurahanName}` : lastDriveResult.folderName}".`
                      : lastDriveResult.kelurahanName
                        ? `Tersimpan (${lastDriveResult.fileName}) ke subfolder "${lastDriveResult.kecamatanName || normalizedKecamatan} / ${lastDriveResult.kelurahanName}" (${lastDriveResult.kelurahanCreated ? "folder Kelurahan baru dibuat" : "memakai folder Kelurahan yang sudah ada"}).`
                        : lastDriveResult.folderCreated
                          ? `Subfolder baru "${lastDriveResult.folderName}" dibuat & berkas (${lastDriveResult.fileName}) dimasukkan.`
                          : `Subfolder "${lastDriveResult.folderName}" sudah ada — berkas (${lastDriveResult.fileName}) dimasukkan.`}
                </p>
                {lastDriveResult.sheetLogged ? (
                  <p className="text-[11px] font-semibold text-[#047857]">
                    Log otomatis dicatat ke Google Sheets Rekap_Scan_SU.
                  </p>
                ) : syncToSheet && !lastDriveResult.skipped ? (
                  <p className="rounded border border-[#FDE68A] bg-[#FFFBEB] px-2 py-1 text-[11px] font-semibold text-[#92400E]">
                    Log Google Sheets belum tercatat
                    {lastDriveResult.sheetError ? ` (${lastDriveResult.sheetError})` : ""}.{" "}
                    Pastikan izin Google Sheets disetujui di editor Apps Script lalu unggah ulang.
                  </p>
                ) : null}
                {normalizedKelurahan &&
                lastDriveResult.nestedSupported === false ? (
                  <p className="rounded border border-[#FDE68A] bg-[#FFFBEB] px-2 py-1 text-[11px] font-semibold text-[#92400E]">
                    Catatan: Web App Google Apps Script masih versi lama sehingga berkas masuk ke folder Kecamatan saja. Klik tombol Terhubung di atas lalu salin &amp; Deploy New version agar subfolder Kelurahan aktif otomatis.
                  </p>
                ) : null}
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <a
                    href={lastDriveResult.folderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#111114] hover:bg-[#F9FAFB]"
                  >
                    Buka Folder
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                  <a
                    href={lastDriveResult.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-[#DDD6FE] bg-[#F5F3FF] px-2.5 py-1 text-[11px] font-semibold text-[#4C0FD1] hover:bg-[#EDE9FE]"
                  >
                    Lihat File PDF
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                  {lastDriveResult.sheetUrl || driveSheetUrl ? (
                    <a
                      href={lastDriveResult.sheetUrl || driveSheetUrl || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-[#A7F3D0] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#065F46] hover:bg-[#ECFDF5]"
                    >
                      <FileSpreadsheet className="h-3 w-3" aria-hidden="true" />
                      Buka Google Sheets
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onResetWorkspace}
            className="nb-btn-sm inline-flex min-h-10 w-full items-center justify-center gap-1.5 bg-white px-4 py-2 text-xs text-[#4B5563] hover:bg-[#F9FAFB] hover:text-[#111114]"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset / Scan Berikutnya
          </button>
        </div>
      </form>
    </aside>
  );
}
