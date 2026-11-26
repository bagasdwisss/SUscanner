"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  BookOpen,
  History,
  Plus,
  ScanLine,
  CheckCircle2,
  AlertCircle,
  Keyboard,
  FolderOpen,
} from "lucide-react";
import { UploadScreen } from "./UploadScreen";
import { DocumentWorkspacePanel } from "./DocumentWorkspacePanel";
import { NamingExportPanel } from "./NamingExportPanel";
import { ManualCropModal } from "./ManualCropModal";
import { CameraCaptureModal } from "./CameraCaptureModal";
import { GuideDialog, HistoryDialog } from "./InfoModals";
import { DriveConfigDialog } from "./DriveConfigDialog";
import { AiUsageSidebar } from "./AiUsageSidebar";
import {
  computeNextAiQuotaReset,
  createInitialAiUsageStats,
  loadAiUsageStats,
  recordAiUsageEvent,
  saveAiUsageStats,
  type AiUsageStats,
} from "@/lib/ai-usage";
import {
  APPS_SCRIPT_STORAGE_KEY,
  buildDriveFolderUrl,
  DEFAULT_APPS_SCRIPT_URL,
  DRIVE_AUTO_UPLOAD_STORAGE_KEY,
  DRIVE_ROOT_STORAGE_KEY,
  validateAppsScriptWebhookUrl,
} from "@/lib/drive-config";
import {
  cloneCorners,
  detectPaperCornersFromCanvas,
  FULL_FRAME_CORNERS,
  normalizeUploadedImage,
  prepareCleanCropForAi,
  prepareImageForAi,
  processDocumentPage,
  renderRotatedCanvas,
  rotateCorners,
} from "@/lib/document-scanner";
import {
  applyExtractionToForm,
  buildStandardFilename,
  createEmptyConfidences,
  createEmptyFields,
  DEFAULT_DRIVE_ROOT_FOLDER_ID,
  extractDriveFolderId,
  getEffectiveKodeHak,
  normalizeKecamatanName,
  normalizeKelurahanName,
  padFiveDigits,
  sanitizeCustomFilename,
  sanitizeDigits,
} from "@/lib/su-formatter";
import { generateSuPdf, triggerPdfDownload } from "@/lib/pdf-generator";
import { runLocalTesseractOcr } from "@/lib/local-ocr";
import {
  clearSessionHistory,
  formatBytes,
  loadSessionHistory,
  saveSessionHistoryItem,
} from "@/lib/session-history";
import type {
  AiEngineSource,
  AiExtractionResult,
  AiStatus,
  DriveStatusResponse,
  DriveUploadResult,
  NamingMode,
  PageSlot,
  PdfQualityPreset,
  QuadCorners,
  ScanFilter,
  ScannedPageState,
  SessionHistoryItem,
  SuFieldConfidences,
  SuNamingFields,
} from "@/lib/su-types";

interface ToastNotice {
  id: number;
  kind: "success" | "error";
  text: string;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x2000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(
      String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length))),
    );
  }
  return btoa(parts.join(""));
}

export function SuScannerApp() {
  const [page1, setPage1] = useState<ScannedPageState | null>(null);
  const [page2, setPage2] = useState<ScannedPageState | null>(null);
  const [activeTab, setActiveTab] = useState<PageSlot>("page1");
  const [isDecoding, setIsDecoding] = useState(false);

  // AI & OCR state
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const [aiSource, setAiSource] = useState<AiEngineSource | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiUsageStats, setAiUsageStats] = useState<AiUsageStats>(() =>
    createInitialAiUsageStats(),
  );
  const [aiUsageOpen, setAiUsageOpen] = useState(false);
  const [clientNowMs, setClientNowMs] = useState<number | null>(null);
  const [isWrongPageSlot, setIsWrongPageSlot] = useState(false);
  const [namingMode, setNamingMode] = useState<NamingMode>("standard");
  const [fields, setFields] = useState<SuNamingFields>(createEmptyFields);
  const [customFilename, setCustomFilename] = useState("SU.dokumen.pdf");
  const [confidences, setConfidences] = useState<SuFieldConfidences>(
    createEmptyConfidences,
  );
  const [rawEvidence, setRawEvidence] = useState<{
    teksNomorSu: string | null;
    teksNomorHak: string | null;
    teksLokasi: string | null;
    nibTerdeteksi: string | null;
  }>({
    teksNomorSu: null,
    teksNomorHak: null,
    teksLokasi: null,
    nibTerdeteksi: null,
  });
  const [warnings, setWarnings] = useState<string[]>([]);
  const [extractionVersion, setExtractionVersion] = useState(0);

  // Google Drive integration state
  const [driveStatus, setDriveStatus] = useState<DriveStatusResponse | null>(
    null,
  );
  const [appsScriptUrl, setAppsScriptUrl] = useState(DEFAULT_APPS_SCRIPT_URL);
  const [driveRootFolderId, setDriveRootFolderId] = useState(
    DEFAULT_DRIVE_ROOT_FOLDER_ID,
  );
  const [autoUploadOnExport, setAutoUploadOnExport] = useState(false);
  const [isUploadingDrive, setIsUploadingDrive] = useState(false);
  const [lastDriveResult, setLastDriveResult] =
    useState<DriveUploadResult | null>(null);
  const [lastDriveError, setLastDriveError] = useState<string | null>(null);
  const [driveConfigOpen, setDriveConfigOpen] = useState(false);

  // Export & Modals (default to highest image quality for download & Drive upload)
  const [pdfQuality, setPdfQuality] = useState<PdfQualityPreset>("high");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>(
    [],
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cameraSlot, setCameraSlot] = useState<PageSlot | null>(null);
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [liveMessage, setLiveMessage] = useState("");

  const aiAbortRef = useRef<AbortController | null>(null);
  const aiTargetIdRef = useRef<string | null>(null);

  useEffect(() => {
    loadSessionHistory().then(setSessionHistory);

    fetch("/api/drive/status")
      .then((res) => (res.ok ? (res.json() as Promise<DriveStatusResponse>) : null))
      .then((status) => {
        if (!status) return;
        setDriveStatus(status);
        setDriveRootFolderId((curr) =>
          curr === DEFAULT_DRIVE_ROOT_FOLDER_ID
            ? status.defaultRootFolderId
            : curr,
        );
      })
      .catch(() => {
        // Ignore transient network status errors
      });

    Promise.resolve().then(() => {
      setClientNowMs(Date.now());
      setAiUsageStats(loadAiUsageStats());
      try {
        const storedUrl = localStorage.getItem(APPS_SCRIPT_STORAGE_KEY) || "";
        const storedRoot = extractDriveFolderId(
          localStorage.getItem(DRIVE_ROOT_STORAGE_KEY),
        );
        const storedAuto =
          localStorage.getItem(DRIVE_AUTO_UPLOAD_STORAGE_KEY) === "true";

        if (storedUrl && validateAppsScriptWebhookUrl(storedUrl)) {
          setAppsScriptUrl(storedUrl);
        } else {
          setAppsScriptUrl(DEFAULT_APPS_SCRIPT_URL);
        }
        if (storedRoot) {
          setDriveRootFolderId(storedRoot);
        }
        if (storedAuto) {
          setAutoUploadOnExport(true);
        }
      } catch {
        // Ignore storage unavailable errors
      }
    });
    const resetTimer = setInterval(() => {
      setClientNowMs(Date.now());
    }, 30_000);
    return () => clearInterval(resetTimer);
  }, []);

  const showToast = useCallback((kind: "success" | "error", text: string) => {
    const id = Date.now();
    setToast({ id, kind, text });
    setLiveMessage(text);
    setTimeout(
      () => {
        setToast((curr) => (curr?.id === id ? null : curr));
      },
      kind === "error" ? 6500 : 4500,
    );
  }, []);

  const runLocalOcrExtraction = useCallback(
    async (
      sourceTarget:
        | string
        | {
            id: string;
            rawUrl?: string;
            rotation?: 0 | 90 | 180 | 270;
            corners?: QuadCorners;
            processedDataUrl: string;
          },
      targetPageId?: string,
      fallbackPrefix?: string,
    ) => {
      const resolvedId =
        typeof sourceTarget === "string"
          ? (targetPageId ?? "")
          : sourceTarget.id;
      const fallbackUrl =
        typeof sourceTarget === "string"
          ? sourceTarget
          : sourceTarget.processedDataUrl;

      aiAbortRef.current?.abort();
      aiTargetIdRef.current = resolvedId;

      setAiStatus("ocr-local");
      setAiSource("local-ocr");
      setOcrProgress(5);
      setAiMessage(
        fallbackPrefix
          ? `${fallbackPrefix} Beralih ke OCR Lokal sistem (tesseract.js)…`
          : "Membaca teks dokumen dengan OCR Lokal sistem (tesseract.js)…",
      );
      setIsWrongPageSlot(false);
      setWarnings([]);

      try {
        let ocrDataUrl = fallbackUrl;
        if (
          typeof sourceTarget !== "string" &&
          sourceTarget.rawUrl &&
          sourceTarget.corners
        ) {
          const ocrClean = await processDocumentPage({
            rawUrl: sourceTarget.rawUrl,
            rotation: sourceTarget.rotation ?? 0,
            corners: sourceTarget.corners,
            filter: "original",
            brightness: 0,
            contrast: 0,
            maxOutputSide: 2400,
            jpegQuality: 0.94,
          });
          ocrDataUrl = ocrClean.dataUrl;
        }

        const outcome = await runLocalTesseractOcr(ocrDataUrl, (pct) => {
          if (aiTargetIdRef.current === resolvedId) {
            setOcrProgress(pct);
          }
        });
        if (aiTargetIdRef.current !== resolvedId) return;

        setAiUsageStats((prev) => {
          const updated = recordAiUsageEvent(prev, {
            engine: "local-ocr",
            model: "tesseract-ind",
            status: 200,
            ok: true,
          });
          saveAiUsageStats(updated);
          return updated;
        });

        const { processed, meanConfidence } = outcome;
        setFields(processed.fields);
        setConfidences(processed.confidences);
        setIsWrongPageSlot(processed.isWrongPageSlot);
        setRawEvidence(processed.rawEvidence);
        setWarnings(processed.warnings);
        setExtractionVersion((v) => v + 1);
        setAiStatus("success");
        setAiSource("local-ocr");
        setAiMessage(
          `Ekstraksi OCR Lokal selesai (keyakinan rata-rata ${Math.round(
            meanConfidence,
          )}%). Harap verifikasi angka & nama Kecamatan.`,
        );
        setLiveMessage("Ekstraksi OCR Lokal Surat Ukur selesai.");
      } catch {
        if (aiTargetIdRef.current !== resolvedId) return;
        setAiStatus("error");
        setAiMessage(
          "OCR Lokal sistem gagal memuat atau membaca dokumen. Silakan isi kolom secara manual.",
        );
      }
    },
    [],
  );

  const runVisionExtraction = useCallback(
    async (
      sourceTarget:
        | string
        | {
            id: string;
            rawUrl?: string;
            rotation?: 0 | 90 | 180 | 270;
            corners?: QuadCorners;
            processedDataUrl: string;
          },
      targetPageId?: string,
    ) => {
      const resolvedId =
        typeof sourceTarget === "string"
          ? (targetPageId ?? "")
          : sourceTarget.id;

      aiAbortRef.current?.abort();
      const controller = new AbortController();
      aiAbortRef.current = controller;
      aiTargetIdRef.current = resolvedId;

      setAiStatus("extracting");
      setAiSource("gemini");
      setOcrProgress(0);
      setAiMessage("Menganalisis Surat Ukur secara cepat dengan Vision AI…");
      setIsWrongPageSlot(false);
      setWarnings([]);

      try {
        const aiImageDataUrl =
          typeof sourceTarget !== "string" &&
          sourceTarget.rawUrl &&
          sourceTarget.corners
            ? await prepareCleanCropForAi({
                rawUrl: sourceTarget.rawUrl,
                rotation: sourceTarget.rotation ?? 0,
                corners: sourceTarget.corners,
                maxSide: 1600,
              })
            : await prepareImageForAi(
                typeof sourceTarget === "string"
                  ? sourceTarget
                  : sourceTarget.processedDataUrl,
                1600,
              );
        if (controller.signal.aborted) return;

        const response = await fetch("/api/extract-su", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl: aiImageDataUrl }),
          signal: controller.signal,
        });

        const data = await response.json();
        if (controller.signal.aborted || aiTargetIdRef.current !== resolvedId) {
          return;
        }

        if (!response.ok) {
          setAiUsageStats((prev) => {
            const updated = recordAiUsageEvent(prev, {
              engine: "gemini",
              model: data?.code || "gemini-error",
              status: response.status,
              ok: false,
            });
            saveAiUsageStats(updated);
            return updated;
          });
          const reason =
            data?.code === "AI_NOT_CONFIGURED"
              ? "API Key Vision AI belum dikonfigurasi."
              : data?.error || "Layanan Gemini AI sedang tidak merespons.";
          await runLocalOcrExtraction(sourceTarget, resolvedId, reason);
          return;
        }

        setAiUsageStats((prev) => {
          const updated = recordAiUsageEvent(prev, {
            engine: "gemini",
            model: String(data?.model || "gemini-3.5-flash"),
            status: response.status,
            ok: true,
            promptTokens: data?.usage?.promptTokens,
            outputTokens: data?.usage?.outputTokens,
            totalTokens: data?.usage?.totalTokens,
          });
          saveAiUsageStats(updated);
          return updated;
        });

        const extraction = data.extraction as AiExtractionResult;
        const processed = applyExtractionToForm(extraction);

        setFields(processed.fields);
        setConfidences(processed.confidences);
        setIsWrongPageSlot(processed.isWrongPageSlot);
        setRawEvidence(processed.rawEvidence);
        setWarnings(processed.warnings);
        setExtractionVersion((v) => v + 1);
        setAiStatus("success");
        setAiSource("gemini");
        setAiMessage(
          `Ekstraksi Gemini selesai (${data.model || "Gemini Flash"}). Periksa kolom bertanda kuning/merah sebelum mengunduh.`,
        );
        setLiveMessage("Ekstraksi nama file Surat Ukur oleh AI selesai.");
      } catch (error) {
        if (controller.signal.aborted) return;
        const reason =
          error instanceof Error && error.name === "AbortError"
            ? "Permintaan AI dibatalkan."
            : "Koneksi ke Gemini AI terganggu.";
        await runLocalOcrExtraction(sourceTarget, resolvedId, reason);
      }
    },
    [runLocalOcrExtraction],
  );

  const buildInitialPageState = useCallback(
    async (file: File): Promise<ScannedPageState> => {
      const normalized = await normalizeUploadedImage(file);
      const rotCanvas = await renderRotatedCanvas(normalized.rawUrl, 0);
      const detected = detectPaperCornersFromCanvas(rotCanvas);
      const initialFilter: ScanFilter = "original";
      const processed = await processDocumentPage({
        rawUrl: normalized.rawUrl,
        rotation: 0,
        corners: detected.corners,
        filter: initialFilter,
        brightness: 0,
        contrast: 0,
      });

      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        originalFileName: file.name,
        mimeType: normalized.mimeType,
        rawUrl: normalized.rawUrl,
        rawWidth: normalized.rawWidth,
        rawHeight: normalized.rawHeight,
        rotation: 0,
        corners: detected.corners,
        autoDetectedCorners: cloneCorners(detected.corners),
        hasAutoContour: detected.detected,
        filter: initialFilter,
        brightness: 0,
        contrast: 0,
        processedDataUrl: processed.dataUrl,
        processedWidth: processed.width,
        processedHeight: processed.height,
        isProcessing: false,
        errorMessage: null,
      };
    },
    [],
  );

  const reprocessSlot = useCallback(
    async (slot: PageSlot, updated: ScannedPageState, triggerAi = false) => {
      const setter = slot === "page1" ? setPage1 : setPage2;
      setter((curr) =>
        curr && curr.id === updated.id ? { ...updated, isProcessing: true } : curr,
      );

      try {
        const result = await processDocumentPage({
          rawUrl: updated.rawUrl,
          rotation: updated.rotation,
          corners: updated.corners,
          filter: updated.filter,
          brightness: updated.brightness,
          contrast: updated.contrast,
        });

        setter((curr) => {
          if (!curr || curr.id !== updated.id) return curr;
          return {
            ...updated,
            processedDataUrl: result.dataUrl,
            processedWidth: result.width,
            processedHeight: result.height,
            isProcessing: false,
            errorMessage: null,
          };
        });

        if (triggerAi) {
          void runVisionExtraction({
            id: updated.id,
            rawUrl: updated.rawUrl,
            rotation: updated.rotation,
            corners: updated.corners,
            processedDataUrl: result.dataUrl,
          });
        }
      } catch {
        setter((curr) =>
          curr && curr.id === updated.id
            ? {
                ...curr,
                isProcessing: false,
                errorMessage: "Gagal memproses ulang gambar.",
              }
            : curr,
        );
      }
    },
    [runVisionExtraction],
  );

  const handleUploadSingleFile = useCallback(
    async (slot: PageSlot, file: File) => {
      setIsDecoding(true);
      try {
        const oldUrl = slot === "page1" ? page1?.rawUrl : page2?.rawUrl;
        const newState = await buildInitialPageState(file);
        if (oldUrl) URL.revokeObjectURL(oldUrl);

        if (slot === "page1") {
          setPage1(newState);
          setActiveTab("page1");
          void runVisionExtraction(newState);
          if (newState.hasAutoContour) {
            showToast("success", "Auto-crop otomatis memangkas tepi dokumen.");
          }
        } else {
          setPage2(newState);
          setActiveTab("page2");
          if (!page1) {
            void runVisionExtraction(newState);
          }
          if (newState.hasAutoContour) {
            showToast("success", "Auto-crop otomatis memangkas tepi Halaman 2.");
          }
        }
      } catch (err) {
        showToast(
          "error",
          err instanceof Error
            ? err.message
            : "Gagal membaca gambar. Pastikan format JPG, PNG, WEBP, atau HEIC valid.",
        );
      } finally {
        setIsDecoding(false);
      }
    },
    [buildInitialPageState, page1, page2, runVisionExtraction, showToast],
  );

  const handleUploadSlotFiles = useCallback(
    async (slot: PageSlot, files: File[]) => {
      if (files.length >= 2) {
        setIsDecoding(true);
        try {
          const [s1, s2] = await Promise.all([
            buildInitialPageState(files[0]),
            buildInitialPageState(files[1]),
          ]);
          if (page1?.rawUrl) URL.revokeObjectURL(page1.rawUrl);
          if (page2?.rawUrl) URL.revokeObjectURL(page2.rawUrl);
          setPage1(s1);
          setPage2(s2);
          setActiveTab("page1");
          void runVisionExtraction(s1);
          if (s1.hasAutoContour || s2.hasAutoContour) {
            showToast("success", "Auto-crop otomatis memangkas tepi dokumen.");
          }
        } catch (err) {
          showToast(
            "error",
            err instanceof Error
              ? err.message
              : "Gagal memproses gambar yang dipilih.",
          );
        } finally {
          setIsDecoding(false);
        }
        return;
      }

      if (files.length === 1) {
        await handleUploadSingleFile(slot, files[0]);
      }
    },
    [
      buildInitialPageState,
      handleUploadSingleFile,
      page1,
      page2,
      runVisionExtraction,
      showToast,
    ],
  );

  const handleSwapPages = useCallback(() => {
    const oldP1 = page1;
    const oldP2 = page2;
    setPage1(oldP2);
    setPage2(oldP1);
    setIsWrongPageSlot(false);

    if (oldP2?.processedDataUrl) {
      void runVisionExtraction(oldP2);
    } else {
      setAiStatus("idle");
      setAiMessage(null);
    }
    showToast("success", "Urutan Halaman 1 dan Halaman 2 ditukar.");
  }, [page1, page2, runVisionExtraction, showToast]);

  const handleRotateActive = useCallback(
    (delta: -90 | 90) => {
      const target = activeTab === "page1" ? page1 : page2;
      if (!target || target.isProcessing) return;
      const nextRot = (((target.rotation + delta + 360) % 360) as
        | 0
        | 90
        | 180
        | 270);
      const nextCorners = rotateCorners(target.corners, delta);
      const nextAuto = rotateCorners(target.autoDetectedCorners, delta);
      void reprocessSlot(activeTab, {
        ...target,
        rotation: nextRot,
        corners: nextCorners,
        autoDetectedCorners: nextAuto,
      });
    },
    [activeTab, page1, page2, reprocessSlot],
  );

  const handleApplyCrop = useCallback(
    (corners: QuadCorners) => {
      const target = activeTab === "page1" ? page1 : page2;
      if (!target) return;
      const isFull =
        JSON.stringify(corners) === JSON.stringify(FULL_FRAME_CORNERS);
      const shouldReExtract =
        activeTab === "page1" &&
        !isFull &&
        (!fields.nomorSu || !fields.nomorHak || !fields.kecamatan);
      void reprocessSlot(
        activeTab,
        {
          ...target,
          corners,
          hasAutoContour: !isFull,
        },
        shouldReExtract,
      );
    },
    [activeTab, fields.kecamatan, fields.nomorHak, fields.nomorSu, page1, page2, reprocessSlot],
  );

  const handleAutoCropActive = useCallback(async () => {
    const target = activeTab === "page1" ? page1 : page2;
    if (!target || target.isProcessing) return;
    try {
      const rotCanvas = await renderRotatedCanvas(target.rawUrl, target.rotation);
      const detected = detectPaperCornersFromCanvas(rotCanvas);
      await reprocessSlot(
        activeTab,
        {
          ...target,
          corners: detected.corners,
          autoDetectedCorners: cloneCorners(detected.corners),
          hasAutoContour: detected.detected,
        },
        activeTab === "page1" || !page1,
      );
      showToast(
        "success",
        detected.detected
          ? "Auto-crop full dokumen diterapkan (tepi kertas ujung ke ujung)."
          : "Dokumen sudah memenuhi penuh bingkai (full frame). Gunakan Atur Sudut Crop jika perlu pangkas manual.",
      );
    } catch {
      showToast("error", "Gagal mendeteksi ulang tepi kertas untuk auto-crop.");
    }
  }, [activeTab, page1, page2, reprocessSlot, showToast]);

  const handleFilterChange = useCallback(
    (filter: ScanFilter) => {
      const target = activeTab === "page1" ? page1 : page2;
      if (!target || target.filter === filter) return;
      void reprocessSlot(activeTab, { ...target, filter });
    },
    [activeTab, page1, page2, reprocessSlot],
  );

  const handleAdjustmentChange = useCallback(
    (brightness: number, contrast: number) => {
      const target = activeTab === "page1" ? page1 : page2;
      if (!target) return;
      void reprocessSlot(activeTab, { ...target, brightness, contrast });
    },
    [activeTab, page1, page2, reprocessSlot],
  );

  const handleResetWorkspace = useCallback(() => {
    aiAbortRef.current?.abort();
    aiTargetIdRef.current = null;
    if (page1?.rawUrl) URL.revokeObjectURL(page1.rawUrl);
    if (page2?.rawUrl) URL.revokeObjectURL(page2.rawUrl);

    setPage1(null);
    setPage2(null);
    setActiveTab("page1");
    setAiStatus("idle");
    setAiSource(null);
    setOcrProgress(0);
    setAiMessage(null);
    setIsWrongPageSlot(false);
    setNamingMode("standard");
    setFields(createEmptyFields());
    setCustomFilename("SU.dokumen.pdf");
    setConfidences(createEmptyConfidences());
    setRawEvidence({
      teksNomorSu: null,
      teksNomorHak: null,
      teksLokasi: null,
      nibTerdeteksi: null,
    });
    setWarnings([]);
    setLastDriveResult(null);
    setLastDriveError(null);
    setExtractionVersion((v) => v + 1);
    setLiveMessage("Workspace direset. Siap memindai dokumen berikutnya.");
  }, [page1, page2]);

  const currentFilename =
    namingMode === "standard"
      ? buildStandardFilename(fields)
      : sanitizeCustomFilename(customFilename);

  const isDuplicateFilename = sessionHistory.some(
    (item) => item.filename.toLowerCase() === currentFilename.toLowerCase(),
  );

  const driveReady = Boolean(
    driveStatus?.configured ||
      validateAppsScriptWebhookUrl(appsScriptUrl) ||
      validateAppsScriptWebhookUrl(DEFAULT_APPS_SCRIPT_URL),
  );
  const driveFolderUrl = buildDriveFolderUrl(driveRootFolderId);

  const performDriveUpload = useCallback(
    async (
      pdfBytes: Uint8Array,
      filename: string,
      kecamatanInput: string,
      kelurahanInput?: string,
    ): Promise<DriveUploadResult | null> => {
      const kecamatanClean = normalizeKecamatanName(kecamatanInput);
      const kelurahanClean = normalizeKelurahanName(kelurahanInput);
      if (!kecamatanClean) {
        const msg =
          "Isi nama Kecamatan terlebih dahulu agar subfolder Drive dapat dibuat.";
        setLastDriveError(msg);
        showToast("error", msg);
        return null;
      }

      setLastDriveError(null);
      setIsUploadingDrive(true);
      try {
        const pdfBase64 = uint8ArrayToBase64(pdfBytes);
        const res = await fetch("/api/drive/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename,
            kecamatan: kecamatanClean,
            kelurahan: kelurahanClean || null,
            rootFolderId: driveRootFolderId,
            pdfBase64,
            appsScriptUrl: appsScriptUrl.trim() || null,
          }),
        });

        const rawText = await res.text();
        let payload:
          | DriveUploadResult
          | { ok?: false; error?: string; code?: string }
          | null = null;
        try {
          payload = JSON.parse(rawText) as
            | DriveUploadResult
            | { ok?: false; error?: string; code?: string };
        } catch {
          payload = null;
        }

        if (res.status === 413) {
          const msg =
            "Ukuran PDF melebihi batas unggahan server (4,5 MB). Gunakan kualitas Standar atau Hemat.";
          setLastDriveError(msg);
          showToast("error", msg);
          return null;
        }

        if (!res.ok || !payload || !("ok" in payload) || payload.ok !== true) {
          const msg =
            (payload && "error" in payload && payload.error) ||
            (res.status >= 500
              ? `Server Drive merespons galat (HTTP ${res.status}). Periksa koneksi atau Tes Koneksi di menu Google Drive.`
              : "Gagal mengunggah berkas PDF ke Google Drive.");
          setLastDriveError(msg);
          showToast("error", msg);
          return null;
        }

        setLastDriveResult(payload);
        setLastDriveError(null);
        if (kelurahanClean && payload.nestedSupported === false) {
          showToast(
            "success",
            `PDF tersimpan di /${payload.folderName}/. Perbarui deploy Apps Script Anda agar subfolder Kelurahan "${kelurahanClean}" dibuat otomatis.`,
          );
        } else {
          showToast(
            "success",
            payload.folderCreated
              ? `Subfolder "${payload.folderName}" dibuat & ${payload.fileName} disimpan ke Drive!`
              : `Subfolder "${payload.folderName}" sudah ada — ${payload.fileName} dimasukkan ke folder tersebut.`,
          );
        }
        return payload;
      } catch {
        const msg =
          "Koneksi ke endpoint unggah Google Drive terganggu. Coba ulangi beberapa detik lagi.";
        setLastDriveError(msg);
        showToast("error", msg);
        return null;
      } finally {
        setIsUploadingDrive(false);
      }
    },
    [appsScriptUrl, driveRootFolderId, showToast],
  );

  const handleToggleAutoUpload = useCallback((nextVal: boolean) => {
    setAutoUploadOnExport(nextVal);
    try {
      localStorage.setItem(DRIVE_AUTO_UPLOAD_STORAGE_KEY, String(nextVal));
    } catch {
      // Ignore storage unavailable errors
    }
  }, []);

  const collectOrderedPages = useCallback(() => {
    return [page1, page2]
      .filter((p): p is ScannedPageState => Boolean(p?.processedDataUrl))
      .map((p) => ({
        dataUrl: p.processedDataUrl,
        width: p.processedWidth,
        height: p.processedHeight,
      }));
  }, [page1, page2]);

  const handleExportPdf = useCallback(async () => {
    const pages = collectOrderedPages();
    if (pages.length === 0) {
      showToast("error", "Unggah minimal 1 halaman Surat Ukur terlebih dahulu.");
      return;
    }

    setIsGeneratingPdf(true);
    try {
      const result = await generateSuPdf(pages, pdfQuality);
      triggerPdfDownload(result.blob, currentFilename);

      const kecamatanClean = normalizeKecamatanName(fields.kecamatan);
      const kelurahanClean = normalizeKelurahanName(fields.kelurahan);
      let uploaded: DriveUploadResult | null = null;
      if (autoUploadOnExport && driveReady && kecamatanClean) {
        const uploadBytes =
          result.bytes.byteLength > 2_850_000
            ? (await generateSuPdf(pages, pdfQuality, 2_850_000)).bytes
            : result.bytes;
        uploaded = await performDriveUpload(
          uploadBytes,
          currentFilename,
          kecamatanClean,
          kelurahanClean,
        );
      }

      const historyItem: SessionHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        filename: currentFilename,
        createdAt: Date.now(),
        pageCount: result.pageCount,
        sizeBytes: result.sizeBytes,
        nomorSu: padFiveDigits(fields.nomorSu),
        tahunSu: sanitizeDigits(fields.tahunSu),
        kodeHak: getEffectiveKodeHak(fields),
        nomorHak: padFiveDigits(fields.nomorHak),
        kecamatan: uploaded?.kecamatanName || kecamatanClean || undefined,
        kelurahan: uploaded?.kelurahanName || kelurahanClean || undefined,
        driveFileUrl: uploaded?.fileUrl,
        driveFolderUrl: uploaded?.folderUrl,
        pdfBytes: new Uint8Array(result.bytes).buffer,
      };
      const updatedHistory = await saveSessionHistoryItem(historyItem);
      setSessionHistory(updatedHistory);

      if (!uploaded) {
        showToast(
          "success",
          autoUploadOnExport && driveReady && !kecamatanClean
            ? `PDF diunduh (${formatBytes(result.sizeBytes)}). Isi Kecamatan untuk upload otomatis ke Drive.`
            : autoUploadOnExport
              ? `PDF diunduh (${formatBytes(result.sizeBytes)}), namun gagal diunggah ke Drive.`
              : `PDF diunduh ke perangkat (${formatBytes(
                  result.sizeBytes,
                )}). Klik 'Upload Langsung ke Drive' di bawah untuk menyimpannya ke Drive.`,
        );
      }
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Gagal membuat dokumen PDF.",
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [
    autoUploadOnExport,
    collectOrderedPages,
    currentFilename,
    driveReady,
    fields,
    pdfQuality,
    performDriveUpload,
    showToast,
  ]);

  const handleUploadOnlyToDrive = useCallback(async () => {
    if (!driveReady) {
      setDriveConfigOpen(true);
      showToast(
        "error",
        "Hubungkan Google Drive terlebih dahulu (pengaturan 1 kali), lalu klik Upload Langsung ke Drive lagi.",
      );
      return;
    }

    const pages = collectOrderedPages();
    if (pages.length === 0) {
      showToast("error", "Unggah minimal 1 halaman Surat Ukur terlebih dahulu.");
      return;
    }

    const kecamatanClean = normalizeKecamatanName(fields.kecamatan);
    const kelurahanClean = normalizeKelurahanName(fields.kelurahan);
    if (!kecamatanClean) {
      const msg =
        "Isi nama Kecamatan terlebih dahulu agar subfolder Drive dapat dibuat.";
      setLastDriveError(msg);
      showToast("error", msg);
      return;
    }

    setIsGeneratingPdf(true);
    setLastDriveError(null);
    try {
      const result = await generateSuPdf(pages, pdfQuality, 2_850_000);
      const uploaded = await performDriveUpload(
        result.bytes,
        currentFilename,
        kecamatanClean,
        kelurahanClean,
      );
      if (uploaded) {
        const historyItem: SessionHistoryItem = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          filename: currentFilename,
          createdAt: Date.now(),
          pageCount: result.pageCount,
          sizeBytes: result.sizeBytes,
          nomorSu: padFiveDigits(fields.nomorSu),
          tahunSu: sanitizeDigits(fields.tahunSu),
          kodeHak: getEffectiveKodeHak(fields),
          nomorHak: padFiveDigits(fields.nomorHak),
          kecamatan: uploaded.kecamatanName || kecamatanClean,
          kelurahan: uploaded.kelurahanName || kelurahanClean || undefined,
          driveFileUrl: uploaded.fileUrl,
          driveFolderUrl: uploaded.folderUrl,
          pdfBytes: new Uint8Array(result.bytes).buffer,
        };
        const updatedHistory = await saveSessionHistoryItem(historyItem);
        setSessionHistory(updatedHistory);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Gagal menyusun PDF untuk Drive.";
      setLastDriveError(msg);
      showToast("error", msg);
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [
    collectOrderedPages,
    currentFilename,
    driveReady,
    fields,
    pdfQuality,
    performDriveUpload,
    showToast,
  ]);

  // Keyboard shortcuts for desktop operators (PRD Section 9.6)
  useEffect(() => {
    const hasWorkspace = Boolean(page1 || page2);
    if (!hasWorkspace) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        historyOpen ||
        guideOpen ||
        cropModalOpen ||
        driveConfigOpen ||
        aiUsageOpen ||
        cameraSlot !== null
      )
        return;

      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        const form = document.querySelector<HTMLFormElement>("aside form");
        form?.requestSubmit();
        return;
      }

      if (
        ((e.ctrlKey || e.metaKey) &&
          e.shiftKey &&
          e.key.toLowerCase() === "n") ||
        (e.altKey && e.key.toLowerCase() === "n")
      ) {
        e.preventDefault();
        handleResetWorkspace();
        return;
      }

      const activeTag = (
        document.activeElement?.tagName || ""
      ).toLowerCase();
      const isEditingField =
        activeTag === "input" ||
        activeTag === "textarea" ||
        activeTag === "select";
      if (isEditingField || e.ctrlKey || e.metaKey || e.altKey) return;

      const lower = e.key.toLowerCase();
      if (lower === "r") {
        e.preventDefault();
        handleRotateActive(90);
      } else if (lower === "s") {
        e.preventDefault();
        handleSwapPages();
      } else if (e.key === "1") {
        e.preventDefault();
        setActiveTab("page1");
      } else if (e.key === "2") {
        e.preventDefault();
        setActiveTab("page2");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    aiUsageOpen,
    cameraSlot,
    cropModalOpen,
    driveConfigOpen,
    guideOpen,
    handleResetWorkspace,
    handleRotateActive,
    handleSwapPages,
    historyOpen,
    page1,
    page2,
  ]);

  const hasWorkspace = Boolean(page1 || page2);
  const activePage = activeTab === "page1" ? page1 : page2;
  const loadedPagesCount = (page1 ? 1 : 0) + (page2 ? 1 : 0);
  const aiRemaining = Math.max(
    0,
    aiUsageStats.dailyQuotaLimit - aiUsageStats.usedTodayRequests,
  );
  const aiPct = Math.min(
    100,
    Math.round(
      (aiUsageStats.usedTodayRequests /
        Math.max(1, aiUsageStats.dailyQuotaLimit)) *
        100,
    ),
  );
  const aiResetMeta = clientNowMs
    ? computeNextAiQuotaReset(new Date(clientNowMs))
    : null;

  return (
    <div className="flex min-h-dvh flex-col bg-[#F6F5F0] lg:grid lg:grid-cols-[276px_minmax(0,1fr)]">
      {/* Split-Tone Dark Sidebar (Desktop) & Top Dark Bar (Mobile & Tablet) */}
      <aside className="nb-dark-sidebar border-b-2 border-[#111111] lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between lg:border-b-0 lg:border-r-2 lg:overflow-y-auto">
        <div className="flex flex-col gap-3 px-3.5 py-3 sm:px-5 sm:py-3.5 lg:gap-5 lg:p-5">
          {/* Brand Identity + Compact Mobile Status Pill */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border-2 border-[#F6F5F0] bg-[#FEF08A] text-[#111111] shadow-[3px_3px_0px_#FBCFE8] sm:h-11 sm:w-11">
                <ScanLine className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <span className="block text-base font-black tracking-tight text-[#F6F5F0]">
                  SU-Scanner
                </span>
                <span className="block text-[10px] font-extrabold tracking-[0.1em] text-[#FEF08A] uppercase">
                  ATR/BPN Archive Studio
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 lg:hidden">
              <span className="rounded-xl border border-[#3F3F46] bg-[#1F1F24] px-2.5 py-1 font-mono text-xs font-extrabold text-[#D9F99D]">
                0{loadedPagesCount}/02 Hal
              </span>
            </div>
          </div>

          {/* Navigation & Actions */}
          <nav
            aria-label="Utilitas Aplikasi"
            className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:flex-col lg:items-stretch lg:gap-2.5"
          >
            {hasWorkspace ? (
              <button
                type="button"
                onClick={handleResetWorkspace}
                className="nb-btn-sm col-span-2 inline-flex min-h-11 items-center justify-center gap-1.5 bg-[#FDE047] px-3.5 py-2 text-xs text-[#111111] sm:col-span-1 lg:w-full"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Scan Baru</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="nb-btn-sm inline-flex min-h-11 items-center justify-between gap-2 bg-[#1F1F24] px-3 py-2 text-xs text-[#F6F5F0] hover:bg-[#2A2A32] sm:px-3.5 lg:w-full"
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                <History className="h-4 w-4 shrink-0 text-[#FBCFE8]" aria-hidden="true" />
                <span className="truncate">Riwayat ({sessionHistory.length})</span>
              </span>
              <span className="hidden rounded-full bg-[#FBCFE8] px-2 py-0.5 font-mono text-[11px] font-black text-[#111111] lg:inline-block">
                {sessionHistory.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="nb-btn-sm inline-flex min-h-11 items-center justify-between gap-2 bg-[#1F1F24] px-3 py-2 text-xs text-[#F6F5F0] hover:bg-[#2A2A32] sm:px-3.5 lg:w-full"
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                <BookOpen className="h-4 w-4 shrink-0 text-[#BAE6FD]" aria-hidden="true" />
                <span className="truncate">Panduan</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setDriveConfigOpen(true)}
              className="nb-btn-sm inline-flex min-h-11 items-center justify-between gap-2 bg-[#1F1F24] px-3 py-2 text-xs text-[#F6F5F0] hover:bg-[#2A2A32] sm:px-3.5 lg:w-full"
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                <FolderOpen className="h-4 w-4 shrink-0 text-[#D9F99D]" aria-hidden="true" />
                <span className="truncate">Google Drive</span>
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-black text-[#111111] ${
                  driveReady ? "bg-[#D9F99D]" : "bg-[#FEF08A]"
                }`}
              >
                {driveReady ? "Aktif" : "Atur"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAiUsageOpen(true)}
              className="nb-btn-sm inline-flex min-h-11 items-center justify-between gap-2 bg-[#1F1F24] px-3 py-2 text-xs text-[#F6F5F0] hover:bg-[#2A2A32] sm:px-3.5 lg:w-full"
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                <Activity className="h-4 w-4 shrink-0 text-[#FEF08A]" aria-hidden="true" />
                <span className="truncate">Usage AI</span>
              </span>
              <span className="rounded-full bg-[#FEF08A] px-2 py-0.5 font-mono text-[10px] font-black text-[#111111]">
                {aiUsageStats.usedTodayRequests}/{aiUsageStats.dailyQuotaLimit}
              </span>
            </button>
          </nav>

          {/* Desktop Bento Telemetry inside Dark Sidebar */}
          <div className="hidden space-y-3 lg:block">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl border-2 border-[#3F3F46] bg-[#1F1F24] p-3">
                <span className="nb-micro block text-zinc-400">BERKAS</span>
                <span className="mt-1 block font-mono text-2xl font-black text-[#D9F99D]">
                  0{loadedPagesCount}/02
                </span>
                <span className="text-[11px] font-semibold text-zinc-300">
                  Halaman siap
                </span>
              </div>

              <div className="rounded-2xl border-2 border-[#3F3F46] bg-[#1F1F24] p-3">
                <span className="nb-micro block text-zinc-400">EKSPOR</span>
                <span className="mt-1 block font-mono text-2xl font-black text-[#BAE6FD]">
                  {String(sessionHistory.length).padStart(2, "0")}
                </span>
                <span className="text-[11px] font-semibold text-zinc-300">
                  PDF diunduh
                </span>
              </div>
            </div>

            {/* Compact Live AI Quota Card in Dark Sidebar */}
            <button
              type="button"
              onClick={() => setAiUsageOpen(true)}
              className="w-full rounded-2xl border-2 border-[#3F3F46] bg-[#1F1F24] p-3 text-left transition-colors hover:border-[#FEF08A]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="nb-micro text-[#FEF08A]">KUOTA AI HARI INI</span>
                <span className="font-mono text-[11px] font-black text-[#D9F99D]">
                  Sisa {aiRemaining}
                </span>
              </div>
              <div className="mt-1.5 flex items-baseline justify-between gap-2">
                <span className="font-mono text-lg font-black text-[#F6F5F0]">
                  {aiUsageStats.usedTodayRequests} / {aiUsageStats.dailyQuotaLimit}
                </span>
                <span className="text-[11px] font-semibold text-zinc-300">
                  Reset {aiResetMeta ? aiResetMeta.wibTimeLabel : "15:00 WIB"}
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full border border-[#52525B] bg-[#141414]">
                <div
                  style={{ width: `${aiPct}%` }}
                  className="h-full bg-[#FEF08A]"
                />
              </div>
            </button>

            <div className="rounded-2xl border-2 border-[#3F3F46] bg-[#1F1F24] p-3.5">
              <span className="nb-micro block text-[#FEF08A]">
                POLA STANDAR ARSIP
              </span>
              <p className="mt-1.5 font-mono text-xs font-bold leading-relaxed text-[#F6F5F0]">
                SU.[5D No].[4D Thn].[Hak].[5D Hak].pdf
              </p>
            </div>
          </div>
        </div>

        {/* Desktop Sidebar Bottom Shortcut Legend */}
        <div className="hidden border-t-2 border-[#27272A] p-5 lg:block">
          <div className="rounded-2xl border-2 border-[#3F3F46] bg-[#1F1F24] p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wider text-[#FBCFE8] uppercase">
              <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Shortcut Cepat</span>
            </div>
            <ul className="mt-2.5 space-y-1.5 text-xs">
              {[
                { k: "Ctrl+Enter", d: "Unduh PDF" },
                { k: "R", d: "Putar +90°" },
                { k: "S", d: "Tukar Hal 1 & 2" },
                { k: "1 / 2", d: "Ganti Tab" },
              ].map((item) => (
                <li
                  key={item.k}
                  className="flex items-center justify-between text-zinc-300"
                >
                  <span>{item.d}</span>
                  <kbd className="rounded-md border border-[#52525B] bg-[#141414] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#FEF08A]">
                    {item.k}
                  </kbd>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>

      {/* Main Warm Off-White Canvas (#F6F5F0) */}
      <main
        id="main-workspace"
        tabIndex={-1}
        className="flex min-w-0 flex-1 flex-col bg-[#F6F5F0]"
      >
        {!hasWorkspace ? (
          <UploadScreen
            onSelectSlotFiles={handleUploadSlotFiles}
            onSelectBatchFiles={(files) => handleUploadSlotFiles("page1", files)}
            onOpenCamera={(slot) => setCameraSlot(slot)}
            isDecoding={isDecoding}
          />
        ) : (
          <div className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 gap-4 p-3 sm:gap-5 sm:p-5 xl:grid-cols-[minmax(0,63fr)_minmax(340px,37fr)]">
            <DocumentWorkspacePanel
              activeTab={activeTab}
              onSelectTab={setActiveTab}
              page1={page1}
              page2={page2}
              onSwapPages={handleSwapPages}
              onRotateActive={handleRotateActive}
              onAutoCropActive={() => void handleAutoCropActive()}
              onOpenManualCrop={() => setCropModalOpen(true)}
              onFilterChange={handleFilterChange}
              onAdjustmentChange={handleAdjustmentChange}
              onResetAdjustments={() => handleAdjustmentChange(0, 0)}
              onUploadSlot={(slot, file) =>
                void handleUploadSingleFile(slot, file)
              }
              onOpenCamera={(slot) => setCameraSlot(slot)}
            />

            <NamingExportPanel
              aiStatus={aiStatus}
              aiSource={aiSource}
              ocrProgress={ocrProgress}
              aiMessage={aiMessage}
              isWrongPageSlot={isWrongPageSlot}
              hasPage1={Boolean(page1)}
              hasPage2={Boolean(page2)}
              namingMode={namingMode}
              onChangeNamingMode={setNamingMode}
              fields={fields}
              onChangeFields={setFields}
              customFilename={customFilename}
              onChangeCustomFilename={setCustomFilename}
              confidences={confidences}
              rawEvidence={rawEvidence}
              warnings={warnings}
              pdfQuality={pdfQuality}
              onChangePdfQuality={setPdfQuality}
              isGeneratingPdf={isGeneratingPdf}
              isUploadingDrive={isUploadingDrive}
              driveReady={driveReady}
              autoUploadOnExport={autoUploadOnExport}
              onToggleAutoUpload={handleToggleAutoUpload}
              driveFolderId={driveRootFolderId}
              driveFolderUrl={driveFolderUrl}
              lastDriveResult={lastDriveResult}
              lastDriveError={lastDriveError}
              isDuplicateFilename={isDuplicateFilename}
              extractionVersion={extractionVersion}
              onReExtractAi={() => {
                const target = page1 ?? page2;
                if (target?.processedDataUrl) {
                  void runVisionExtraction(target);
                }
              }}
              onRunLocalOcr={() => {
                const target = page1 ?? page2;
                if (target?.processedDataUrl) {
                  void runLocalOcrExtraction(target);
                }
              }}
              onSwapPages={handleSwapPages}
              onExportPdf={() => void handleExportPdf()}
              onUploadToDrive={() => void handleUploadOnlyToDrive()}
              onOpenDriveConfig={() => setDriveConfigOpen(true)}
              onResetWorkspace={handleResetWorkspace}
              onAnnounce={setLiveMessage}
              onNotifyError={(msg) => showToast("error", msg)}
            />
          </div>
        )}
      </main>

      {/* Toast Notification */}
      {toast ? (
        <div
          role="status"
          className={`nb-card fixed bottom-3 left-3 right-3 z-40 flex items-start gap-2.5 px-4 py-3 text-xs font-extrabold text-[#111111] sm:bottom-4 sm:left-auto sm:right-4 sm:max-w-md sm:text-sm ${
            toast.kind === "success" ? "bg-[#D9F99D]" : "bg-[#FBCFE8]"
          }`}
        >
          {toast.kind === "success" ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          )}
          <span>{toast.text}</span>
        </div>
      ) : null}

      {/* Centralized Polite Live Region */}
      <div aria-live="polite" className="visually-hidden">
        {liveMessage}
      </div>

      {/* Native Modals */}
      {activePage ? (
        <ManualCropModal
          open={cropModalOpen}
          onClose={() => setCropModalOpen(false)}
          pageLabel={
            activeTab === "page1"
              ? "Halaman 1 (Data SU)"
              : "Halaman 2 (Peta Bidang)"
          }
          rawUrl={activePage.rawUrl}
          rotation={activePage.rotation}
          initialCorners={activePage.corners}
          onApply={handleApplyCrop}
        />
      ) : null}

      <HistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        items={sessionHistory}
        onClearHistory={() => {
          void clearSessionHistory().then(() => {
            setSessionHistory([]);
            showToast("success", "Riwayat sesi telah dikosongkan.");
          });
        }}
      />

      <CameraCaptureModal
        open={cameraSlot !== null}
        slotLabel={
          cameraSlot === "page2"
            ? "Halaman 2 (Peta Bidang)"
            : "Halaman 1 (Data SU)"
        }
        onClose={() => setCameraSlot(null)}
        onCaptureFile={(file) => {
          const slot = cameraSlot ?? "page1";
          void handleUploadSingleFile(slot, file);
        }}
      />

      <GuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />

      <DriveConfigDialog
        key={driveConfigOpen ? "drive-open" : "drive-closed"}
        open={driveConfigOpen}
        onClose={() => setDriveConfigOpen(false)}
        serverStatus={driveStatus}
        appsScriptUrl={appsScriptUrl}
        rootFolderInput={driveRootFolderId}
        autoUploadOnExport={autoUploadOnExport}
        onSaveConfig={({
          appsScriptUrl: nextUrl,
          rootFolderId: nextRoot,
          autoUploadOnExport: nextAuto,
        }) => {
          if (!nextUrl || nextUrl === DEFAULT_APPS_SCRIPT_URL) {
            setAppsScriptUrl(DEFAULT_APPS_SCRIPT_URL);
            try {
              localStorage.removeItem(APPS_SCRIPT_STORAGE_KEY);
            } catch {
              // Ignore
            }
          } else {
            setAppsScriptUrl(nextUrl);
            try {
              localStorage.setItem(APPS_SCRIPT_STORAGE_KEY, nextUrl);
            } catch {
              // Ignore
            }
          }
          setDriveRootFolderId(nextRoot);
          setAutoUploadOnExport(nextAuto);
          try {
            localStorage.setItem(DRIVE_ROOT_STORAGE_KEY, nextRoot);
            localStorage.setItem(
              DRIVE_AUTO_UPLOAD_STORAGE_KEY,
              String(nextAuto),
            );
          } catch {
            // Ignore storage restrictions
          }
          showToast("success", "Pengaturan Google Drive disimpan.");
        }}
        onClearAppsScript={() => {
          setAppsScriptUrl(DEFAULT_APPS_SCRIPT_URL);
          try {
            localStorage.removeItem(APPS_SCRIPT_STORAGE_KEY);
          } catch {
            // Ignore
          }
          showToast(
            "success",
            "URL Google Apps Script dikembalikan ke URL bawaan sistem.",
          );
        }}
      />

      <AiUsageSidebar
        key={aiUsageOpen ? "usage-open" : "usage-closed"}
        open={aiUsageOpen}
        onClose={() => setAiUsageOpen(false)}
        stats={aiUsageStats}
        onUpdateDailyLimit={(newLimit) => {
          setAiUsageStats((prev) => {
            const next = { ...prev, dailyQuotaLimit: newLimit };
            saveAiUsageStats(next);
            return next;
          });
          showToast(
            "success",
            `Batas kuota harian AI diperbarui menjadi ${newLimit} request.`,
          );
        }}
        onResetLocalCounters={() => {
          const fresh = {
            ...createInitialAiUsageStats(),
            dailyQuotaLimit: aiUsageStats.dailyQuotaLimit,
          };
          saveAiUsageStats(fresh);
          setAiUsageStats(fresh);
          showToast("success", "Catatan pemakaian AI lokal telah direset.");
        }}
      />
    </div>
  );
}
