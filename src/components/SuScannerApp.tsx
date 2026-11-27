"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  BookOpen,
  History,
  Layers,
  Menu,
  Plus,
  CheckCircle2,
  AlertCircle,
  Keyboard,
  FolderOpen,
  FolderSearch,
  WifiOff,
  X,
} from "lucide-react";
import { UploadScreen } from "./UploadScreen";
import { DocumentWorkspacePanel } from "./DocumentWorkspacePanel";
import { NamingExportPanel } from "./NamingExportPanel";
import { ManualCropModal } from "./ManualCropModal";
import { CameraCaptureModal } from "./CameraCaptureModal";
import { GuideDialog, HistoryDialog } from "./InfoModals";
import { DriveConfigDialog } from "./DriveConfigDialog";
import { AiUsageSidebar } from "./AiUsageSidebar";
import { BatchQueueModal } from "./BatchQueueModal";
import { DriveExplorerModal } from "./DriveExplorerModal";
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
  DRIVE_CONFLICT_POLICY_KEY,
  DRIVE_ROOT_STORAGE_KEY,
  DRIVE_SHEET_URL_KEY,
  DRIVE_SYNC_SHEET_KEY,
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
  rotateEdgeMidpoints,
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
import { splitMultiPagePdfToImageFiles } from "@/lib/pdf-splitter";
import {
  extractSearchableOcrWords,
  runLocalTesseractOcr,
} from "@/lib/local-ocr";
import {
  clearSessionHistory,
  formatBytes,
  loadSessionHistory,
  saveSessionHistoryItem,
} from "@/lib/session-history";
import {
  enqueueOfflineJob,
  loadOfflineQueue,
  removeOfflineJob,
  updateOfflineJobAttempt,
} from "@/lib/offline-queue";
import {
  applyCorrectionMemoryToFields,
  clearAllCorrectionMemory,
  deleteCorrectionRule,
  learnWilayahCodeFromConfirmedScan,
  loadCorrectionMemory,
  type CorrectionMemoryState,
} from "@/lib/correction-memory";
import type {
  AiEngineSource,
  AiExtractionResult,
  AiStatus,
  DriveConflictPolicy,
  DriveStatusResponse,
  DriveUploadResult,
  EdgeMidpoints,
  NamingMode,
  OcrWordBox,
  OfflineUploadJob,
  PageSlot,
  PdfOrientationMode,
  PdfQualityPreset,
  QuadCorners,
  ScanFilter,
  ScannedPageState,
  SessionHistoryItem,
  SuFieldConfidences,
  SuNamingFields,
} from "@/lib/su-types";

const PDF_ORIENTATION_STORAGE_KEY = "su_scanner_pdf_orientation_v1";

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
  const [swapSequence, setSwapSequence] = useState(0);
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
  const [conflictPolicy, setConflictPolicy] =
    useState<DriveConflictPolicy>("revision");
  const [syncToSheet, setSyncToSheet] = useState(true);
  const [driveSheetUrl, setDriveSheetUrl] = useState<string | null>(null);
  const [isEnsuringSheet, setIsEnsuringSheet] = useState(false);
  const [searchablePdf, setSearchablePdf] = useState(true);
  const [isUploadingDrive, setIsUploadingDrive] = useState(false);
  const [driveLockedSignature, setDriveLockedSignature] = useState<string | null>(
    null,
  );
  const [lastDriveResult, setLastDriveResult] =
    useState<DriveUploadResult | null>(null);
  const [lastDriveError, setLastDriveError] = useState<string | null>(null);
  const [driveConfigOpen, setDriveConfigOpen] = useState(false);

  // Batch Queue, PDF Splitter, Drive Explorer, Offline Sync & Correction Memory
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [pendingBatchFiles, setPendingBatchFiles] = useState<File[] | null>(
    null,
  );
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [offlineJobs, setOfflineJobs] = useState<OfflineUploadJob[]>([]);
  const [isSyncingOffline, setIsSyncingOffline] = useState(false);
  const [correctionMemory, setCorrectionMemory] =
    useState<CorrectionMemoryState>({
      rules: [],
      wilayahCodes: [],
    });

  // Export & Modals (default to highest image quality and landscape PDF orientation)
  const [pdfQuality, setPdfQuality] = useState<PdfQualityPreset>("high");
  const [pdfOrientation, setPdfOrientation] =
    useState<PdfOrientationMode>("landscape-ccw");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>(
    [],
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cameraSlot, setCameraSlot] = useState<PageSlot | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isNavFloating, setIsNavFloating] = useState(false);
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [liveMessage, setLiveMessage] = useState("");

  const aiAbortRef = useRef<AbortController | null>(null);
  const aiTargetIdRef = useRef<string | null>(null);
  const scrollSentinelRef = useRef<HTMLDivElement>(null);
  const offlineSyncLockRef = useRef(false);
  const driveUploadLockRef = useRef(false);

  useEffect(() => {
    const sentinel = scrollSentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsNavFloating(!entry.isIntersecting);
      },
      { threshold: [0] },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    loadSessionHistory().then(setSessionHistory);
    loadOfflineQueue().then(setOfflineJobs);

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
      setCorrectionMemory(loadCorrectionMemory());
      try {
        const storedUrl = localStorage.getItem(APPS_SCRIPT_STORAGE_KEY) || "";
        const storedRoot = extractDriveFolderId(
          localStorage.getItem(DRIVE_ROOT_STORAGE_KEY),
        );
        const storedAuto =
          localStorage.getItem(DRIVE_AUTO_UPLOAD_STORAGE_KEY) === "true";
        const storedPolicy = localStorage.getItem(
          DRIVE_CONFLICT_POLICY_KEY,
        ) as DriveConflictPolicy | null;
        const storedOrientation = localStorage.getItem(
          PDF_ORIENTATION_STORAGE_KEY,
        ) as PdfOrientationMode | null;
        const storedSheet = localStorage.getItem(DRIVE_SYNC_SHEET_KEY);
        const storedSheetUrl = localStorage.getItem(DRIVE_SHEET_URL_KEY);

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
        if (
          storedPolicy === "revision" ||
          storedPolicy === "overwrite" ||
          storedPolicy === "skip"
        ) {
          setConflictPolicy(storedPolicy);
        }
        if (
          storedOrientation === "landscape-ccw" ||
          storedOrientation === "landscape-cw" ||
          storedOrientation === "auto"
        ) {
          setPdfOrientation(storedOrientation);
        }
        if (storedSheet === "false") {
          setSyncToSheet(false);
        }
        if (storedSheetUrl && storedSheetUrl.startsWith("https://docs.google.com/")) {
          setDriveSheetUrl(storedSheetUrl);
        }

        const effectiveRoot = storedRoot || DEFAULT_DRIVE_ROOT_FOLDER_ID;
        const effectiveScript =
          storedUrl && validateAppsScriptWebhookUrl(storedUrl)
            ? storedUrl
            : DEFAULT_APPS_SCRIPT_URL;
        fetch("/api/drive/explore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "list",
            rootFolderId: effectiveRoot,
            query: "Rekap_Scan_SU",
            appsScriptUrl: effectiveScript,
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then(
            (resData: { items?: Array<{ name: string; kind: string; url: string }> } | null) => {
              const found = resData?.items?.find(
                (it) =>
                  it.kind === "file" &&
                  it.name.toLowerCase().includes("rekap_scan_su") &&
                  it.url,
              );
              if (found?.url) {
                setDriveSheetUrl(found.url);
                try {
                  localStorage.setItem(DRIVE_SHEET_URL_KEY, found.url);
                } catch {
                  // Ignore
                }
              }
            },
          )
          .catch(() => {
            // Non-blocking discovery
          });
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

  const rememberSheetUrl = useCallback((url?: string | null) => {
    if (!url || !url.startsWith("https://")) return;
    setDriveSheetUrl(url);
    try {
      localStorage.setItem(DRIVE_SHEET_URL_KEY, url);
    } catch {
      // Ignore storage restrictions
    }
  }, []);

  const handleEnsureSheet = useCallback(async () => {
    setIsEnsuringSheet(true);
    try {
      const res = await fetch("/api/drive/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "init_sheet",
          rootFolderId: driveRootFolderId,
          appsScriptUrl: appsScriptUrl.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        sheetUrl?: string;
        existed?: boolean;
        error?: string;
      } | null;
      if (res.ok && json?.ok && json.sheetUrl) {
        rememberSheetUrl(json.sheetUrl);
        showToast(
          "success",
          json.existed
            ? 'Google Sheets "Rekap_Scan_SU" ditemukan dan siap dibuka!'
            : 'Google Sheets "Rekap_Scan_SU" berhasil dibuat di Drive Induk!',
        );
        window.open(json.sheetUrl, "_blank", "noopener,noreferrer");
      } else {
        showToast(
          "error",
          json?.error ||
            'Spreadsheet "Rekap_Scan_SU" otomatis dibuat di Folder Induk Drive saat Anda mengunggah PDF pertama.',
        );
      }
    } catch {
      showToast("error", "Gagal menghubungi endpoint Google Sheets.");
    } finally {
      setIsEnsuringSheet(false);
    }
  }, [appsScriptUrl, driveRootFolderId, rememberSheetUrl, showToast]);

  const runLocalOcrExtraction = useCallback(
    async (
      sourceTarget:
        | string
        | {
            id: string;
            rawUrl?: string;
            rotation?: 0 | 90 | 180 | 270;
            corners?: QuadCorners;
            edgeMidpoints?: EdgeMidpoints;
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
            edgeMidpoints: sourceTarget.edgeMidpoints,
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

        const { processed, meanConfidence, ocrWords } = outcome;
        const memAdjusted = applyCorrectionMemoryToFields(
          processed.fields,
          { teksLokasi: processed.rawEvidence.teksLokasi },
        );
        if (ocrWords && ocrWords.length > 0 && resolvedId) {
          setPage1((curr) =>
            curr && curr.id === resolvedId ? { ...curr, ocrWords } : curr,
          );
          setPage2((curr) =>
            curr && curr.id === resolvedId ? { ...curr, ocrWords } : curr,
          );
        }

        setFields(memAdjusted.fields);
        setConfidences(processed.confidences);
        setIsWrongPageSlot(processed.isWrongPageSlot);
        setRawEvidence(processed.rawEvidence);
        setWarnings(
          memAdjusted.appliedNotes.length > 0
            ? [...processed.warnings, ...memAdjusted.appliedNotes]
            : processed.warnings,
        );
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
            edgeMidpoints?: EdgeMidpoints;
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
                maxSide: 1920,
              })
            : await prepareImageForAi(
                typeof sourceTarget === "string"
                  ? sourceTarget
                  : sourceTarget.processedDataUrl,
                1920,
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
        const memAdjusted = applyCorrectionMemoryToFields(
          processed.fields,
          { teksLokasi: processed.rawEvidence.teksLokasi },
        );

        setFields(memAdjusted.fields);
        setConfidences(processed.confidences);
        setIsWrongPageSlot(processed.isWrongPageSlot);
        setRawEvidence(processed.rawEvidence);
        setWarnings(
          memAdjusted.appliedNotes.length > 0
            ? [...processed.warnings, ...memAdjusted.appliedNotes]
            : processed.warnings,
        );
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
        qualityReport: processed.qualityReport,
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
          edgeMidpoints: updated.edgeMidpoints,
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
            qualityReport: result.qualityReport,
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
            edgeMidpoints: updated.edgeMidpoints,
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
      const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");
      setIsDecoding(true);
      try {
        let targetFile = file;
        if (isPdf) {
          const splitPages = await splitMultiPagePdfToImageFiles(file, {
            maxPages: 120,
          });
          if (splitPages.length > 2) {
            setPendingBatchFiles([file]);
            setBatchModalOpen(true);
            showToast(
              "success",
              `PDF "${file.name}" (${splitPages.length} halaman) dibuka ke Pemecah PDF & Antrean Batch.`,
            );
            return;
          }
          if (splitPages.length === 2 && !page1 && !page2) {
            const [s1, s2] = await Promise.all([
              buildInitialPageState(splitPages[0].file),
              buildInitialPageState(splitPages[1].file),
            ]);
            setPage1(s1);
            setPage2(s2);
            setActiveTab("page1");
            void runVisionExtraction(s1);
            showToast(
              "success",
              `PDF 2 halaman "${file.name}" otomatis masuk ke Halaman 1 & Halaman 2.`,
            );
            return;
          }
          if (splitPages[0]) {
            targetFile = splitPages[0].file;
          }
        }

        const oldUrl = slot === "page1" ? page1?.rawUrl : page2?.rawUrl;
        const newState = await buildInitialPageState(targetFile);
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
            : "Gagal membaca berkas. Pastikan format JPG, PNG, WEBP, HEIC, atau PDF valid.",
        );
      } finally {
        setIsDecoding(false);
      }
    },
    [buildInitialPageState, page1, page2, runVisionExtraction, showToast],
  );

  const handleUploadSlotFiles = useCallback(
    async (slot: PageSlot, files: File[]) => {
      const hasMultiOrPdf =
        files.length >= 3 ||
        (files.length >= 2 &&
          files.some(
            (f) =>
              f.type === "application/pdf" ||
              f.name.toLowerCase().endsWith(".pdf"),
          ));
      if (hasMultiOrPdf) {
        setPendingBatchFiles(files);
        setBatchModalOpen(true);
        showToast(
          "success",
          `${files.length} berkas diarahkan ke Antrean Batch & Pemecah PDF.`,
        );
        return;
      }

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
    setSwapSequence((n) => n + 1);
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
      const nextMids = target.edgeMidpoints
        ? rotateEdgeMidpoints(target.edgeMidpoints, delta)
        : undefined;
      void reprocessSlot(activeTab, {
        ...target,
        rotation: nextRot,
        corners: nextCorners,
        edgeMidpoints: nextMids,
        autoDetectedCorners: nextAuto,
      });
    },
    [activeTab, page1, page2, reprocessSlot],
  );

  const handleApplyCrop = useCallback(
    (corners: QuadCorners, edgeMidpoints?: EdgeMidpoints) => {
      const target = activeTab === "page1" ? page1 : page2;
      if (!target) return;
      const isFull =
        JSON.stringify(corners) === JSON.stringify(FULL_FRAME_CORNERS) &&
        !edgeMidpoints;
      const shouldReExtract =
        activeTab === "page1" &&
        !isFull &&
        (!fields.nomorSu || !fields.nomorHak || !fields.kecamatan);
      void reprocessSlot(
        activeTab,
        {
          ...target,
          corners,
          edgeMidpoints,
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
    setDriveLockedSignature(null);
    setExtractionVersion((v) => v + 1);
    setLiveMessage("Workspace direset. Siap memindai dokumen berikutnya.");
  }, [page1, page2]);

  const currentFilename =
    namingMode === "standard"
      ? buildStandardFilename(fields)
      : sanitizeCustomFilename(customFilename);

  const driveDocSignature = [
    page1?.id ?? "none",
    page2?.id ?? "none",
    currentFilename,
    normalizeKecamatanName(fields.kecamatan),
    normalizeKelurahanName(fields.kelurahan),
    driveRootFolderId,
    conflictPolicy,
  ].join("|");
  const driveUploadedForCurrent = driveLockedSignature === driveDocSignature;

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
      extraMeta?: {
        nomorSu?: string;
        tahunSu?: string;
        kodeHak?: string;
        nomorHak?: string;
        nib?: string;
        luasTanah?: string;
        pageCount?: number;
      },
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

      const sheetMeta = syncToSheet
        ? {
            logToSheet: true,
            nomorSu: extraMeta?.nomorSu,
            tahunSu: extraMeta?.tahunSu,
            kodeHak: extraMeta?.kodeHak,
            nomorHak: extraMeta?.nomorHak,
            nib: extraMeta?.nib,
            luasTanah: extraMeta?.luasTanah,
            pageCount: extraMeta?.pageCount ?? 1,
          }
        : undefined;

      const queueForOffline = async (reasonMsg: string) => {
        const job: OfflineUploadJob = {
          id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: Date.now(),
          filename,
          kecamatan: kecamatanClean,
          kelurahan: kelurahanClean || undefined,
          rootFolderId: driveRootFolderId,
          conflictPolicy,
          nomorSu: extraMeta?.nomorSu || "",
          tahunSu: extraMeta?.tahunSu || "",
          kodeHak: extraMeta?.kodeHak || "",
          nomorHak: extraMeta?.nomorHak || "",
          nib: extraMeta?.nib,
          luasTanah: extraMeta?.luasTanah,
          pageCount: extraMeta?.pageCount ?? 1,
          sizeBytes: pdfBytes.byteLength,
          pdfBytes: new Uint8Array(pdfBytes).buffer,
          attempts: 1,
          lastError: reasonMsg,
        };
        const nextQueue = await enqueueOfflineJob(job);
        setOfflineJobs(nextQueue);
        showToast(
          "error",
          `${reasonMsg} Disimpan ke Antrean Offline (${nextQueue.length} berkas) & otomatis dikirim saat online.`,
        );
      };

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        await queueForOffline("Koneksi internet terputus (Offline).");
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
            conflictPolicy,
            sheetMeta,
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
          if (res.status >= 500) {
            await queueForOffline(msg);
          } else {
            showToast("error", msg);
          }
          return null;
        }

        setLastDriveResult(payload);
        setLastDriveError(null);
        rememberSheetUrl(payload.sheetUrl);

        if (rawEvidence.teksNomorHak) {
          const updatedMem = learnWilayahCodeFromConfirmedScan({
            rawNomorHak: rawEvidence.teksNomorHak,
            kecamatan: payload.kecamatanName || kecamatanClean,
            kelurahan: payload.kelurahanName || kelurahanClean,
          });
          setCorrectionMemory(updatedMem);
        }

        if (payload.skipped) {
          showToast(
            "success",
            `${payload.fileName} dilewati karena sudah ada di folder Drive.`,
          );
        } else if (kelurahanClean && payload.nestedSupported === false) {
          showToast(
            "success",
            `PDF tersimpan di /${payload.folderName}/. Perbarui deploy Apps Script Anda agar subfolder Kelurahan "${kelurahanClean}" dibuat otomatis.`,
          );
        } else {
          showToast(
            "success",
            payload.overwritten
              ? `File lama "${payload.fileName}" ditimpa dengan revisi terbaru!`
              : payload.folderCreated
                ? `Subfolder "${payload.folderName}" dibuat & ${payload.fileName} disimpan ke Drive!`
                : `Subfolder "${payload.folderName}" sudah ada — ${payload.fileName} dimasukkan ke folder tersebut.`,
          );
        }
        return payload;
      } catch {
        await queueForOffline("Koneksi ke endpoint unggah Google Drive terputus.");
        return null;
      } finally {
        setIsUploadingDrive(false);
      }
    },
    [
      appsScriptUrl,
      conflictPolicy,
      driveRootFolderId,
      rawEvidence.teksNomorHak,
      rememberSheetUrl,
      showToast,
      syncToSheet,
    ],
  );

  const flushOfflineQueue = useCallback(
    async (silent = false) => {
      if (offlineSyncLockRef.current) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (!silent) {
          showToast("error", "Perangkat masih offline. Tidak bisa mengirim antrean.");
        }
        return;
      }

      const queue = await loadOfflineQueue();
      if (queue.length === 0) return;

      offlineSyncLockRef.current = true;
      setIsSyncingOffline(true);
      let sentCount = 0;

      try {
        for (const job of queue) {
          try {
            const pdfBase64 = uint8ArrayToBase64(new Uint8Array(job.pdfBytes));
            const res = await fetch("/api/drive/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                filename: job.filename,
                kecamatan: job.kecamatan,
                kelurahan: job.kelurahan || null,
                rootFolderId: job.rootFolderId || driveRootFolderId,
                pdfBase64,
                appsScriptUrl: appsScriptUrl.trim() || null,
                conflictPolicy: job.conflictPolicy,
                sheetMeta: syncToSheet
                  ? {
                      logToSheet: true,
                      nomorSu: job.nomorSu,
                      tahunSu: job.tahunSu,
                      kodeHak: job.kodeHak,
                      nomorHak: job.nomorHak,
                      nib: job.nib,
                      luasTanah: job.luasTanah,
                      pageCount: job.pageCount || 1,
                    }
                  : undefined,
              }),
            });
            const data = (await res.json().catch(() => null)) as
              | DriveUploadResult
              | { ok?: false; error?: string }
              | null;
            if (res.ok && data && "ok" in data && data.ok) {
              sentCount++;
              rememberSheetUrl(data.sheetUrl);
              const nextQ = await removeOfflineJob(job.id);
              setOfflineJobs(nextQ);
            } else {
              const nextQ = await updateOfflineJobAttempt(
                job.id,
                (data && "error" in data && data.error) || `HTTP ${res.status}`,
              );
              setOfflineJobs(nextQ);
            }
          } catch (err) {
            const nextQ = await updateOfflineJobAttempt(
              job.id,
              err instanceof Error ? err.message : "Network error",
            );
            setOfflineJobs(nextQ);
          }
        }
        if (sentCount > 0) {
          showToast(
            "success",
            `${sentCount} berkas dari Antrean Offline berhasil disinkronkan ke Google Drive!`,
          );
        } else if (!silent) {
          showToast("error", "Gagal menyinkronkan antrean offline saat ini.");
        }
      } finally {
        offlineSyncLockRef.current = false;
        setIsSyncingOffline(false);
      }
    },
    [
      appsScriptUrl,
      driveRootFolderId,
      rememberSheetUrl,
      showToast,
      syncToSheet,
    ],
  );

  useEffect(() => {
    const onOnline = () => {
      void flushOfflineQueue(true);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flushOfflineQueue]);

  const handleToggleAutoUpload = useCallback((nextVal: boolean) => {
    setAutoUploadOnExport(nextVal);
    try {
      localStorage.setItem(DRIVE_AUTO_UPLOAD_STORAGE_KEY, String(nextVal));
    } catch {
      // Ignore storage unavailable errors
    }
  }, []);

  const preparePagesForPdfExport = useCallback(async () => {
    const rawPages: Array<{ slot: PageSlot; page: ScannedPageState }> = [];
    if (page1?.processedDataUrl) rawPages.push({ slot: "page1", page: page1 });
    if (page2?.processedDataUrl) rawPages.push({ slot: "page2", page: page2 });

    return Promise.all(
      rawPages.map(async ({ slot, page }) => {
        let ocrWords: OcrWordBox[] | undefined = page.ocrWords;
        if (searchablePdf && (!ocrWords || ocrWords.length === 0)) {
          try {
            ocrWords = await extractSearchableOcrWords(page.processedDataUrl);
            if (ocrWords.length > 0) {
              const setter = slot === "page1" ? setPage1 : setPage2;
              setter((curr) =>
                curr && curr.id === page.id ? { ...curr, ocrWords } : curr,
              );
            }
          } catch {
            ocrWords = undefined;
          }
        }
        return {
          dataUrl: page.processedDataUrl,
          width: page.processedWidth,
          height: page.processedHeight,
          ocrWords: searchablePdf ? ocrWords : undefined,
        };
      }),
    );
  }, [page1, page2, searchablePdf]);

  const handleExportPdf = useCallback(async () => {
    const pages = await preparePagesForPdfExport();
    if (pages.length === 0) {
      showToast("error", "Unggah minimal 1 halaman Surat Ukur terlebih dahulu.");
      return;
    }

    setIsGeneratingPdf(true);
    try {
      const pdfMeta = {
        title: currentFilename.replace(/\.pdf$/i, ""),
        author: "SU-Scanner",
        subject: `Surat Ukur ${padFiveDigits(fields.nomorSu)}/${sanitizeDigits(fields.tahunSu)} - ${normalizeKecamatanName(fields.kecamatan) || "Kantah"}`,
        keywords: [
          fields.nib ? `NIB:${fields.nib}` : "",
          fields.luasTanah ? `Luas:${fields.luasTanah}` : "",
          normalizeKecamatanName(fields.kecamatan),
          normalizeKelurahanName(fields.kelurahan),
        ].filter(Boolean),
      };
      const result = await generateSuPdf(pages, pdfQuality, undefined, pdfMeta, pdfOrientation);
      triggerPdfDownload(result.blob, currentFilename);

      const kecamatanClean = normalizeKecamatanName(fields.kecamatan);
      const kelurahanClean = normalizeKelurahanName(fields.kelurahan);
      if (kecamatanClean && rawEvidence.teksNomorHak) {
        setCorrectionMemory(
          learnWilayahCodeFromConfirmedScan({
            rawNomorHak: rawEvidence.teksNomorHak,
            kecamatan: kecamatanClean,
            kelurahan: kelurahanClean,
          }),
        );
      }

      let uploaded: DriveUploadResult | null = null;
      if (autoUploadOnExport && driveReady && kecamatanClean) {
        const uploadBytes =
          result.bytes.byteLength > 2_850_000
            ? (await generateSuPdf(pages, pdfQuality, 2_850_000, pdfMeta, pdfOrientation)).bytes
            : result.bytes;
        uploaded = await performDriveUpload(
          uploadBytes,
          currentFilename,
          kecamatanClean,
          kelurahanClean,
          {
            nomorSu: padFiveDigits(fields.nomorSu),
            tahunSu: sanitizeDigits(fields.tahunSu),
            kodeHak: getEffectiveKodeHak(fields),
            nomorHak: padFiveDigits(fields.nomorHak),
            nib: fields.nib,
            luasTanah: fields.luasTanah,
            pageCount: result.pageCount,
          },
        );
        if (uploaded) {
          setDriveLockedSignature(driveDocSignature);
        }
      }

      const historyItem: SessionHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        filename: uploaded?.fileName || currentFilename,
        createdAt: Date.now(),
        pageCount: result.pageCount,
        sizeBytes: result.sizeBytes,
        nomorSu: padFiveDigits(fields.nomorSu),
        tahunSu: sanitizeDigits(fields.tahunSu),
        kodeHak: getEffectiveKodeHak(fields),
        nomorHak: padFiveDigits(fields.nomorHak),
        kecamatan: uploaded?.kecamatanName || kecamatanClean || undefined,
        kelurahan: uploaded?.kelurahanName || kelurahanClean || undefined,
        nib: fields.nib || undefined,
        luasTanah: fields.luasTanah || undefined,
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
              ? `PDF diunduh (${formatBytes(result.sizeBytes)}), upload gagal/masuk Antrean Offline.`
              : `PDF ${result.searchableWordCount > 0 ? `Searchable (${result.searchableWordCount} kata) ` : ""}diunduh (${formatBytes(
                  result.sizeBytes,
                )}).`,
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
    currentFilename,
    driveDocSignature,
    driveReady,
    fields,
    pdfOrientation,
    pdfQuality,
    performDriveUpload,
    preparePagesForPdfExport,
    rawEvidence.teksNomorHak,
    showToast,
  ]);

  const handleUploadOnlyToDrive = useCallback(async () => {
    if (
      driveUploadLockRef.current ||
      driveLockedSignature === driveDocSignature
    ) {
      return;
    }

    if (!driveReady) {
      setDriveConfigOpen(true);
      showToast(
        "error",
        "Hubungkan Google Drive terlebih dahulu (pengaturan 1 kali), lalu klik Upload Langsung ke Drive lagi.",
      );
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

    // Lock synchronously before awaiting PDF prep/upload so rapid double clicks never duplicate uploads
    driveUploadLockRef.current = true;
    setDriveLockedSignature(driveDocSignature);
    setIsUploadingDrive(true);
    setIsGeneratingPdf(true);
    setLastDriveError(null);

    try {
      const pages = await preparePagesForPdfExport();
      if (pages.length === 0) {
        setDriveLockedSignature(null);
        showToast("error", "Unggah minimal 1 halaman Surat Ukur terlebih dahulu.");
        return;
      }

      const pdfMeta = {
        title: currentFilename.replace(/\.pdf$/i, ""),
        author: "SU-Scanner",
        subject: `Surat Ukur ${padFiveDigits(fields.nomorSu)}/${sanitizeDigits(fields.tahunSu)} - ${kecamatanClean}`,
      };
      const result = await generateSuPdf(pages, pdfQuality, 2_850_000, pdfMeta, pdfOrientation);
      const uploaded = await performDriveUpload(
        result.bytes,
        currentFilename,
        kecamatanClean,
        kelurahanClean,
        {
          nomorSu: padFiveDigits(fields.nomorSu),
          tahunSu: sanitizeDigits(fields.tahunSu),
          kodeHak: getEffectiveKodeHak(fields),
          nomorHak: padFiveDigits(fields.nomorHak),
          nib: fields.nib,
          luasTanah: fields.luasTanah,
          pageCount: result.pageCount,
        },
      );
      if (uploaded) {
        const historyItem: SessionHistoryItem = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          filename: uploaded.fileName || currentFilename,
          createdAt: Date.now(),
          pageCount: result.pageCount,
          sizeBytes: result.sizeBytes,
          nomorSu: padFiveDigits(fields.nomorSu),
          tahunSu: sanitizeDigits(fields.tahunSu),
          kodeHak: getEffectiveKodeHak(fields),
          nomorHak: padFiveDigits(fields.nomorHak),
          kecamatan: uploaded.kecamatanName || kecamatanClean,
          kelurahan: uploaded.kelurahanName || kelurahanClean || undefined,
          nib: fields.nib || undefined,
          luasTanah: fields.luasTanah || undefined,
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
      driveUploadLockRef.current = false;
      setIsGeneratingPdf(false);
      setIsUploadingDrive(false);
    }
  }, [
    currentFilename,
    driveDocSignature,
    driveLockedSignature,
    driveReady,
    fields,
    pdfOrientation,
    pdfQuality,
    performDriveUpload,
    preparePagesForPdfExport,
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
        batchModalOpen ||
        explorerOpen ||
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
    batchModalOpen,
    cameraSlot,
    cropModalOpen,
    driveConfigOpen,
    explorerOpen,
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
    <div className="su-app-shell flex min-h-dvh flex-col bg-[#FFFFFF] text-[#111114]">
      {/* Invisible 1px scroll sentinel for state-aware floating navbar */}
      <div
        ref={scrollSentinelRef}
        aria-hidden="true"
        className="pointer-events-none -mb-px h-px w-full"
      />

      {/* Wollo 3-Column State-Aware Sticky -> Floating Minimalist SaaS Navbar */}
      <header
        data-floating={isNavFloating ? "true" : "false"}
        className="su-sticky-header pointer-events-none sticky top-0 z-30 w-full"
      >
        <div className="su-floating-bar pointer-events-auto">
          <div className="su-floating-bar-inner mx-auto flex w-full max-w-[1280px] items-center justify-between gap-2 px-4 sm:px-6 lg:px-5 xl:gap-2.5 xl:px-10">
          {/* Column 1 (Left): Brand Wordmark su-scanner with curved smile/scan underline */}
          <div className="flex shrink-0 items-center gap-2 lg:justify-self-start xl:gap-2.5">
            <div className="flex items-baseline gap-2">
              <span className="relative inline-block whitespace-nowrap text-[22px] font-extrabold leading-none tracking-[-0.04em] text-[#111114] sm:text-[24px]">
                su
                <svg
                  aria-hidden="true"
                  viewBox="0 0 28 8"
                  className="pointer-events-none absolute -bottom-1.5 left-0 h-2 w-7 text-[#5E17EB]"
                  fill="none"
                >
                  <path
                    d="M2 2.5C7 6.5 18 6.5 25 2"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                </svg>
                -scanner
              </span>
              <span className="hidden shrink-0 whitespace-nowrap rounded-full border border-[#E5E7EB] bg-[#F6F7F9] px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#4B5563] uppercase sm:inline-flex lg:hidden 2xl:inline-flex">
                ATR/BPN
              </span>
            </div>
          </div>

          {/* Column 2 (Center): Centered Pill Navbar (Desktop) */}
          <nav
            aria-label="Utilitas Aplikasi"
            className="hidden items-center gap-0.5 rounded-full border border-[#E5E7EB]/80 bg-[#F6F7F9] px-1 py-1 shadow-[0_1px_2px_rgba(0,0,0,0.02)] lg:flex xl:gap-1 xl:px-2 xl:py-1.5"
          >
            <button
              type="button"
              onClick={() => setBatchModalOpen(true)}
              className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1.5 text-xs font-medium tracking-[-0.01em] text-[#4B5563] transition-colors hover:bg-white hover:text-[#111114] xl:px-3 xl:text-[13px]"
            >
              <Layers className="h-4 w-4 shrink-0 text-[#5E17EB]" aria-hidden="true" />
              <span>Batch / PDF</span>
            </button>

            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1.5 text-xs font-medium tracking-[-0.01em] text-[#4B5563] transition-colors hover:bg-white hover:text-[#111114] xl:px-3 xl:text-[13px]"
            >
              <History className="h-4 w-4 shrink-0 text-[#5E17EB]" aria-hidden="true" />
              <span>Riwayat</span>
              <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-[#111114] shadow-2xs">
                {sessionHistory.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setExplorerOpen(true)}
              className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1.5 text-xs font-medium tracking-[-0.01em] text-[#4B5563] transition-colors hover:bg-white hover:text-[#111114] xl:px-3 xl:text-[13px]"
            >
              <FolderSearch className="h-4 w-4 shrink-0 text-[#4B5563]" aria-hidden="true" />
              <span>Jelajah</span>
            </button>

            <button
              type="button"
              onClick={() => setDriveConfigOpen(true)}
              className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1.5 text-xs font-medium tracking-[-0.01em] text-[#4B5563] transition-colors hover:bg-white hover:text-[#111114] xl:px-3 xl:text-[13px]"
            >
              <FolderOpen className="h-4 w-4 shrink-0 text-[#4B5563]" aria-hidden="true" />
              <span>Google Drive</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold xl:px-2 ${
                  driveReady
                    ? "bg-[#ECFDF5] text-[#065F46]"
                    : "bg-[#FFFBEB] text-[#92400E]"
                }`}
              >
                {driveReady ? "Aktif" : "Atur"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1.5 text-xs font-medium tracking-[-0.01em] text-[#4B5563] transition-colors hover:bg-white hover:text-[#111114] xl:px-3 xl:text-[13px]"
            >
              <BookOpen className="h-4 w-4 shrink-0 text-[#4B5563]" aria-hidden="true" />
              <span>Panduan</span>
            </button>

            <button
              type="button"
              onClick={() => setAiUsageOpen(true)}
              className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1.5 text-xs font-medium tracking-[-0.01em] text-[#4B5563] transition-colors hover:bg-white hover:text-[#111114] xl:px-3 xl:text-[13px]"
            >
              <Activity className="h-4 w-4 shrink-0 text-[#5E17EB]" aria-hidden="true" />
              <span>Usage AI</span>
              <span className="rounded-full bg-[#F5F3FF] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#4C0FD1] xl:px-2">
                {aiUsageStats.usedTodayRequests}/{aiUsageStats.dailyQuotaLimit}
              </span>
            </button>
          </nav>

          {/* Column 3 (Right): Offline Queue Pill + Active Workspace CTA */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {offlineJobs.length > 0 ? (
              <button
                type="button"
                onClick={() => void flushOfflineQueue(false)}
                disabled={isSyncingOffline}
                title="Kirim ulang berkas yang tersimpan saat offline ke Google Drive"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-2.5 py-1 text-xs font-bold text-[#92400E] hover:bg-[#FEF3C7]"
              >
                <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{offlineJobs.length}</span>
              </button>
            ) : null}

            {hasWorkspace ? (
              <>
                <span className="hidden shrink-0 whitespace-nowrap rounded-full border border-[#E5E7EB] bg-[#F6F7F9] px-2.5 py-1 font-mono text-xs font-semibold text-[#111114] md:inline-flex lg:hidden xl:inline-flex">
                  0{loadedPagesCount}/02 Hal
                </span>
                <button
                  type="button"
                  onClick={handleResetWorkspace}
                  className="nb-btn-sm wollo-cta-dark inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-xs font-semibold sm:px-4 sm:text-[13px]"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Scan Baru</span>
                </button>
              </>
            ) : null}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? "Tutup menu navigasi" : "Buka menu navigasi"}
              className="nb-btn-sm inline-flex min-h-10 min-w-10 items-center justify-center bg-[#F6F7F9] text-[#111114] hover:bg-white lg:hidden"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
          </div>
        </div>

        {/* Responsive Mobile/Tablet Navigation Drawer */}
        {mobileMenuOpen ? (
          <div
            className={`pointer-events-auto lg:hidden ${
              isNavFloating
                ? "mx-3 mt-3.5 rounded-2xl border border-[#E5E7EB] bg-white/95 px-4 py-3.5 shadow-xl backdrop-blur-xl sm:mx-5"
                : "border-t border-[#E5E7EB] bg-white px-4 py-3.5"
            }`}
          >
            <nav
              aria-label="Utilitas Aplikasi Mobile"
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setHistoryOpen(true);
                }}
                className="nb-btn-sm inline-flex min-h-11 items-center justify-between gap-2 bg-[#F6F7F9] px-3 py-2 text-xs font-semibold text-[#111114]"
              >
                <span className="inline-flex items-center gap-1.5">
                  <History className="h-4 w-4 text-[#5E17EB]" aria-hidden="true" />
                  Riwayat
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 font-mono text-[11px]">
                  {sessionHistory.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setGuideOpen(true);
                }}
                className="nb-btn-sm inline-flex min-h-11 items-center gap-1.5 bg-[#F6F7F9] px-3 py-2 text-xs font-semibold text-[#111114]"
              >
                <BookOpen className="h-4 w-4 text-[#4B5563]" aria-hidden="true" />
                Panduan
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setDriveConfigOpen(true);
                }}
                className="nb-btn-sm inline-flex min-h-11 items-center justify-between gap-2 bg-[#F6F7F9] px-3 py-2 text-xs font-semibold text-[#111114]"
              >
                <span className="inline-flex items-center gap-1.5">
                  <FolderOpen className="h-4 w-4 text-[#4B5563]" aria-hidden="true" />
                  Drive
                </span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    driveReady
                      ? "bg-[#ECFDF5] text-[#065F46]"
                      : "bg-[#FFFBEB] text-[#92400E]"
                  }`}
                >
                  {driveReady ? "Aktif" : "Atur"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setAiUsageOpen(true);
                }}
                className="nb-btn-sm inline-flex min-h-11 items-center justify-between gap-2 bg-[#F6F7F9] px-3 py-2 text-xs font-semibold text-[#111114]"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-[#5E17EB]" aria-hidden="true" />
                  Usage AI
                </span>
                <span className="rounded-full bg-[#F5F3FF] px-2 py-0.5 font-mono text-[10px] font-bold text-[#4C0FD1]">
                  {aiUsageStats.usedTodayRequests}/{aiUsageStats.dailyQuotaLimit}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setBatchModalOpen(true);
                }}
                className="nb-btn-sm inline-flex min-h-11 items-center gap-1.5 bg-[#F5F3FF] px-3 py-2 text-xs font-semibold text-[#4C0FD1]"
              >
                <Layers className="h-4 w-4" aria-hidden="true" />
                Batch / PDF
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setExplorerOpen(true);
                }}
                className="nb-btn-sm inline-flex min-h-11 items-center gap-1.5 bg-[#F6F7F9] px-3 py-2 text-xs font-semibold text-[#111114]"
              >
                <FolderSearch className="h-4 w-4 text-[#4B5563]" aria-hidden="true" />
                Jelajah Drive
              </button>
            </nav>

            {/* Mobile Live Quota Bar */}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setAiUsageOpen(true);
              }}
              className="mt-2.5 flex w-full items-center justify-between rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] px-3 py-2 text-xs"
            >
              <span className="font-bold text-[#111114]">
                KUOTA AI HARI INI ({aiUsageStats.usedTodayRequests}/
                {aiUsageStats.dailyQuotaLimit})
              </span>
              <span className="font-mono text-[#4B5563]">
                Reset {aiResetMeta ? aiResetMeta.wibTimeLabel : "15:00 WIB"}
              </span>
            </button>
          </div>
        ) : null}
      </header>

      {/* Main Clean White Canvas (#FFFFFF / #F9FAFB inside workspace) */}
      <main
        id="main-workspace"
        tabIndex={-1}
        className={`flex min-w-0 flex-1 flex-col ${
          hasWorkspace ? "bg-[#F9FAFB]" : "bg-[#FFFFFF]"
        }`}
      >
        {!hasWorkspace ? (
          <UploadScreen
            onSelectSlotFiles={handleUploadSlotFiles}
            onSelectBatchFiles={(files) => handleUploadSlotFiles("page1", files)}
            onOpenCamera={(slot) => setCameraSlot(slot)}
            onOpenBatchModal={() => setBatchModalOpen(true)}
            isDecoding={isDecoding}
          />
        ) : (
          <div className="mx-auto flex w-full max-w-[1360px] flex-1 flex-col gap-4 p-4 pb-24 sm:gap-5 sm:p-6 sm:pb-24">
            <div className="grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,63fr)_minmax(340px,37fr)]">
              <DocumentWorkspacePanel
                activeTab={activeTab}
                swapSequence={swapSequence}
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
                pdfOrientation={pdfOrientation}
                onChangePdfOrientation={(mode) => {
                  setPdfOrientation(mode);
                  try {
                    localStorage.setItem(PDF_ORIENTATION_STORAGE_KEY, mode);
                  } catch {
                    // Ignore
                  }
                }}
                isGeneratingPdf={isGeneratingPdf}
                isUploadingDrive={isUploadingDrive}
                driveUploadedForCurrent={driveUploadedForCurrent}
                driveReady={driveReady}
                autoUploadOnExport={autoUploadOnExport}
                onToggleAutoUpload={handleToggleAutoUpload}
                driveFolderId={driveRootFolderId}
                driveFolderUrl={driveFolderUrl}
                lastDriveResult={lastDriveResult}
                lastDriveError={lastDriveError}
                isDuplicateFilename={isDuplicateFilename}
                extractionVersion={extractionVersion}
                conflictPolicy={conflictPolicy}
                onChangeConflictPolicy={(policy) => {
                  setConflictPolicy(policy);
                  try {
                    localStorage.setItem(DRIVE_CONFLICT_POLICY_KEY, policy);
                  } catch {
                    // Ignore
                  }
                }}
                searchablePdf={searchablePdf}
                onToggleSearchablePdf={setSearchablePdf}
                syncToSheet={syncToSheet}
                onToggleSyncToSheet={(next) => {
                  setSyncToSheet(next);
                  try {
                    localStorage.setItem(DRIVE_SYNC_SHEET_KEY, String(next));
                  } catch {
                    // Ignore
                  }
                }}
                driveSheetUrl={driveSheetUrl}
                isEnsuringSheet={isEnsuringSheet}
                onEnsureSheet={() => void handleEnsureSheet()}
                learnedWilayahCodes={correctionMemory.wilayahCodes}
                appsScriptUrl={appsScriptUrl}
                pendingOfflineCount={offlineJobs.length}
                onSyncOfflineNow={() => void flushOfflineQueue(false)}
                onFieldCorrected={(field, fromVal, toVal) => {
                  import("@/lib/correction-memory").then((mod) => {
                    setCorrectionMemory(
                      mod.recordFieldCorrection(field, fromVal, toVal),
                    );
                  });
                }}
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

            {/* Subtle Desktop Shortcut Legend Bar at bottom of Workspace */}
            <div className="hidden flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-2.5 text-xs text-[#4B5563] lg:flex">
              <div className="flex items-center gap-2 font-semibold text-[#111114]">
                <Keyboard className="h-4 w-4 text-[#5E17EB]" aria-hidden="true" />
                <span>Shortcut Keyboard</span>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {[
                  { k: "Ctrl+Enter", d: "Unduh PDF" },
                  { k: "R", d: "Putar +90°" },
                  { k: "S", d: "Tukar Hal 1 & 2" },
                  { k: "1 / 2", d: "Ganti Tab" },
                ].map((item) => (
                  <span key={item.k} className="inline-flex items-center gap-1.5">
                    <span>{item.d}</span>
                    <kbd className="rounded-md border border-[#E5E7EB] bg-[#F6F7F9] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#111114]">
                      {item.k}
                    </kbd>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span>Ekspor sesi: {String(sessionHistory.length).padStart(2, "0")}</span>
                <span aria-hidden="true">·</span>
                <div className="flex items-center gap-1.5">
                  <span>Kuota AI:</span>
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#E5E7EB]">
                    <div
                      style={{ width: `${aiPct}%` }}
                      className="h-full bg-[#5E17EB]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Toast Notification */}
      {toast ? (
        <div
          role="status"
          className={`nb-card fixed bottom-3 left-3 right-3 z-40 flex items-start gap-2.5 px-4 py-3 text-xs font-semibold shadow-lg sm:bottom-4 sm:left-auto sm:right-4 sm:max-w-md sm:text-sm ${
            toast.kind === "success"
              ? "border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]"
              : "border-[#FECDD3] bg-[#FFF1F2] text-[#9F1239]"
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
          initialMidpoints={activePage.edgeMidpoints}
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
        offlineJobs={offlineJobs}
        isSyncingOffline={isSyncingOffline}
        onRetryOfflineQueue={() => void flushOfflineQueue(false)}
        onRemoveOfflineJob={(id) => {
          void removeOfflineJob(id).then(setOfflineJobs);
        }}
        correctionRules={correctionMemory.rules}
        wilayahCodes={correctionMemory.wilayahCodes}
        onDeleteCorrectionRule={(id) => {
          setCorrectionMemory(deleteCorrectionRule(id));
        }}
        onClearCorrectionMemory={() => {
          setCorrectionMemory(clearAllCorrectionMemory());
          showToast("success", "Memori koreksi lokal dibersihkan.");
        }}
        driveSheetUrl={driveSheetUrl}
        onNotify={showToast}
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
        conflictPolicy={conflictPolicy}
        syncToSheet={syncToSheet}
        sheetUrl={driveSheetUrl}
        onSheetUrlDiscovered={rememberSheetUrl}
        onSaveConfig={({
          appsScriptUrl: nextUrl,
          rootFolderId: nextRoot,
          autoUploadOnExport: nextAuto,
          conflictPolicy: nextPolicy,
          syncToSheet: nextSheet,
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
          setConflictPolicy(nextPolicy);
          setSyncToSheet(nextSheet);
          try {
            localStorage.setItem(DRIVE_ROOT_STORAGE_KEY, nextRoot);
            localStorage.setItem(
              DRIVE_AUTO_UPLOAD_STORAGE_KEY,
              String(nextAuto),
            );
            localStorage.setItem(DRIVE_CONFLICT_POLICY_KEY, nextPolicy);
            localStorage.setItem(DRIVE_SYNC_SHEET_KEY, String(nextSheet));
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

      <BatchQueueModal
        open={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        initialFiles={pendingBatchFiles}
        onConsumedInitialFiles={() => setPendingBatchFiles(null)}
        pdfQuality={pdfQuality}
        pdfOrientation={pdfOrientation}
        conflictPolicy={conflictPolicy}
        appsScriptUrl={appsScriptUrl}
        rootFolderId={driveRootFolderId}
        syncToSheet={syncToSheet}
        driveSheetUrl={driveSheetUrl}
        onSheetUrlDiscovered={rememberSheetUrl}
        onExportedItem={async (item) => {
          const updated = await saveSessionHistoryItem(item);
          setSessionHistory(updated);
        }}
        onEnqueueOffline={async (job) => {
          const updated = await enqueueOfflineJob(job);
          setOfflineJobs(updated);
        }}
        onNotify={showToast}
        onRecordAiUsage={(evt) => {
          setAiUsageStats((prev) => {
            const next = recordAiUsageEvent(prev, evt);
            saveAiUsageStats(next);
            return next;
          });
        }}
      />

      <DriveExplorerModal
        open={explorerOpen}
        onClose={() => setExplorerOpen(false)}
        rootFolderId={driveRootFolderId}
        appsScriptUrl={appsScriptUrl}
        onNotify={showToast}
        onOpenDriveConfig={() => {
          setExplorerOpen(false);
          setDriveConfigOpen(true);
        }}
      />
    </div>
  );
}
