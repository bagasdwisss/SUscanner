"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  History,
  Plus,
  ScanLine,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { UploadScreen } from "./UploadScreen";
import { DocumentWorkspacePanel } from "./DocumentWorkspacePanel";
import { NamingExportPanel } from "./NamingExportPanel";
import { ManualCropModal } from "./ManualCropModal";
import { GuideDialog, HistoryDialog } from "./InfoModals";
import {
  cloneCorners,
  detectPaperCornersFromCanvas,
  FULL_FRAME_CORNERS,
  normalizeUploadedImage,
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
  getEffectiveKodeHak,
  padFiveDigits,
  sanitizeCustomFilename,
  sanitizeDigits,
} from "@/lib/su-formatter";
import { generateSuPdf, triggerPdfDownload } from "@/lib/pdf-generator";
import {
  clearSessionHistory,
  formatBytes,
  loadSessionHistory,
  saveSessionHistoryItem,
} from "@/lib/session-history";
import type {
  AiExtractionResult,
  AiStatus,
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

export function SuScannerApp() {
  const [page1, setPage1] = useState<ScannedPageState | null>(null);
  const [page2, setPage2] = useState<ScannedPageState | null>(null);
  const [activeTab, setActiveTab] = useState<PageSlot>("page1");
  const [isDecoding, setIsDecoding] = useState(false);
  const [allowSinglePagePdf, setAllowSinglePagePdf] = useState(false);

  // AI & Naming state
  const [aiStatus, setAiStatus] = useState<AiStatus>("idle");
  const [aiMessage, setAiMessage] = useState<string | null>(null);
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
    nibTerdeteksi: string | null;
  }>({
    teksNomorSu: null,
    teksNomorHak: null,
    nibTerdeteksi: null,
  });
  const [warnings, setWarnings] = useState<string[]>([]);
  const [extractionVersion, setExtractionVersion] = useState(0);

  // Export & Modals
  const [pdfQuality, setPdfQuality] = useState<PdfQualityPreset>("standard");
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<SessionHistoryItem[]>(
    [],
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [liveMessage, setLiveMessage] = useState("");

  const aiAbortRef = useRef<AbortController | null>(null);
  const page1IdRef = useRef<string | null>(null);
  const page2IdRef = useRef<string | null>(null);

  useEffect(() => {
    page1IdRef.current = page1?.id ?? null;
  }, [page1?.id]);

  useEffect(() => {
    page2IdRef.current = page2?.id ?? null;
  }, [page2?.id]);

  useEffect(() => {
    loadSessionHistory().then(setSessionHistory);
  }, []);

  const showToast = useCallback((kind: "success" | "error", text: string) => {
    const id = Date.now();
    setToast({ id, kind, text });
    setLiveMessage(text);
    setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 4500);
  }, []);

  const runVisionExtraction = useCallback(
    async (page1DataUrl: string, targetPageId: string) => {
      aiAbortRef.current?.abort();
      const controller = new AbortController();
      aiAbortRef.current = controller;

      setAiStatus("extracting");
      setAiMessage("Mengirim gambar Halaman 1 teroptimasi ke Vision AI…");
      setIsWrongPageSlot(false);
      setWarnings([]);

      try {
        const aiImageDataUrl = await prepareImageForAi(page1DataUrl, 1800);
        if (controller.signal.aborted) return;

        const response = await fetch("/api/extract-su", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl: aiImageDataUrl }),
          signal: controller.signal,
        });

        const data = await response.json();
        if (controller.signal.aborted || page1IdRef.current !== targetPageId) {
          return;
        }

        if (!response.ok) {
          if (data?.code === "AI_NOT_CONFIGURED") {
            setAiStatus("unconfigured");
            setAiMessage(data.error);
          } else {
            setAiStatus("error");
            setAiMessage(
              data?.error ||
                "Gagal mengekstrak teks via AI. Silakan isi kolom secara manual.",
            );
          }
          return;
        }

        const extraction = data.extraction as AiExtractionResult;
        const processed = applyExtractionToForm(extraction);

        setFields(processed.fields);
        setConfidences(processed.confidences);
        setIsWrongPageSlot(processed.isWrongPageSlot);
        setRawEvidence(processed.rawEvidence);
        setWarnings(processed.warnings);
        setExtractionVersion((v) => v + 1);
        setAiStatus("success");
        setAiMessage(
          `Ekstraksi selesai (${data.model || "Gemini 2.5 Flash"}). Periksa kolom bertanda kuning/merah sebelum mengunduh.`,
        );
        setLiveMessage("Ekstraksi nama file Surat Ukur oleh AI selesai.");
      } catch (error) {
        if (controller.signal.aborted) return;
        const msg =
          error instanceof Error && error.name === "AbortError"
            ? "Permintaan dibatalkan."
            : "Koneksi ke layanan AI terganggu. Anda tetap dapat mengisi nama file dan mengekspor PDF secara offline.";
        setAiStatus("error");
        setAiMessage(msg);
      }
    },
    [],
  );

  const buildInitialPageState = useCallback(
    async (file: File): Promise<ScannedPageState> => {
      const normalized = await normalizeUploadedImage(file);
      const rotCanvas = await renderRotatedCanvas(normalized.rawUrl, 0);
      const detected = detectPaperCornersFromCanvas(rotCanvas);
      const initialFilter: ScanFilter = "magic";
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

        if (triggerAi && slot === "page1") {
          void runVisionExtraction(result.dataUrl, updated.id);
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
          void runVisionExtraction(newState.processedDataUrl, newState.id);
        } else {
          setPage2(newState);
          setAllowSinglePagePdf(false);
          setActiveTab("page2");
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
    [
      buildInitialPageState,
      page1,
      page2,
      runVisionExtraction,
      showToast,
    ],
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
          setAllowSinglePagePdf(false);
          setActiveTab("page1");
          void runVisionExtraction(s1.processedDataUrl, s1.id);
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
      void runVisionExtraction(oldP2.processedDataUrl, oldP2.id);
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
      void reprocessSlot(activeTab, {
        ...target,
        corners,
        hasAutoContour: !isFull,
      });
    },
    [activeTab, page1, page2, reprocessSlot],
  );

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
    if (page1?.rawUrl) URL.revokeObjectURL(page1.rawUrl);
    if (page2?.rawUrl) URL.revokeObjectURL(page2.rawUrl);

    setPage1(null);
    setPage2(null);
    setActiveTab("page1");
    setAllowSinglePagePdf(false);
    setAiStatus("idle");
    setAiMessage(null);
    setIsWrongPageSlot(false);
    setNamingMode("standard");
    setFields(createEmptyFields());
    setCustomFilename("SU.dokumen.pdf");
    setConfidences(createEmptyConfidences());
    setRawEvidence({
      teksNomorSu: null,
      teksNomorHak: null,
      nibTerdeteksi: null,
    });
    setWarnings([]);
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

  const handleExportPdf = useCallback(async () => {
    if (!page1?.processedDataUrl) {
      showToast("error", "Halaman 1 belum siap.");
      return;
    }
    const pages = [{ dataUrl: page1.processedDataUrl, width: page1.processedWidth, height: page1.processedHeight }];
    if (page2?.processedDataUrl) {
      pages.push({
        dataUrl: page2.processedDataUrl,
        width: page2.processedWidth,
        height: page2.processedHeight,
      });
    } else if (!allowSinglePagePdf) {
      showToast(
        "error",
        "Halaman 2 belum diunggah. Tambahkan Halaman 2 atau centang opsi PDF 1 halaman.",
      );
      return;
    }

    setIsGeneratingPdf(true);
    try {
      const result = await generateSuPdf(pages, pdfQuality);
      triggerPdfDownload(result.blob, currentFilename);

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
        pdfBytes: new Uint8Array(result.bytes).buffer,
      };
      const updatedHistory = await saveSessionHistoryItem(historyItem);
      setSessionHistory(updatedHistory);

      showToast(
        "success",
        `PDF berhasil dibuat & diunduh: ${currentFilename} (${formatBytes(
          result.sizeBytes,
        )})`,
      );
    } catch (err) {
      showToast(
        "error",
        err instanceof Error ? err.message : "Gagal membuat dokumen PDF.",
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [
    allowSinglePagePdf,
    currentFilename,
    fields,
    page1,
    page2,
    pdfQuality,
    showToast,
  ]);

  // Keyboard shortcuts for desktop operators (PRD Section 9.6)
  useEffect(() => {
    const hasWorkspace = Boolean(page1 || page2);
    if (!hasWorkspace) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (historyOpen || guideOpen || cropModalOpen) return;

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
    cropModalOpen,
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

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Top App Bar */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--surface-card)]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-ink)] shadow-xs">
              <ScanLine className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <span className="block text-sm font-bold tracking-tight text-[var(--ink-primary)] sm:text-base">
                SU-Scanner Pro
              </span>
              <span className="hidden text-[11px] font-medium text-[var(--ink-secondary)] sm:block">
                Digitalisasi Arsip Surat Ukur ATR/BPN
              </span>
            </div>
          </div>

          <nav
            aria-label="Utilitas Aplikasi"
            className="flex flex-wrap items-center gap-2"
          >
            {hasWorkspace ? (
              <button
                type="button"
                onClick={handleResetWorkspace}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3.5 py-2 text-xs font-bold text-[var(--accent-ink)] shadow-xs transition-opacity hover:opacity-90"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Scan Baru
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-xs font-semibold text-[var(--ink-primary)] transition-colors hover:bg-[var(--surface-muted)]"
            >
              <History className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
              <span>Riwayat Sesi ({sessionHistory.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-xs font-semibold text-[var(--ink-primary)] transition-colors hover:bg-[var(--surface-muted)]"
            >
              <BookOpen className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
              <span>Panduan &amp; Shortcut</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-workspace" tabIndex={-1} className="flex flex-1 flex-col">
        {!hasWorkspace ? (
          <UploadScreen
            onSelectSlotFiles={handleUploadSlotFiles}
            onSelectBatchFiles={(files) => handleUploadSlotFiles("page1", files)}
            isDecoding={isDecoding}
          />
        ) : (
          <div className="mx-auto grid w-full max-w-[1440px] flex-1 grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,65fr)_minmax(340px,35fr)] lg:gap-5">
            <DocumentWorkspacePanel
              activeTab={activeTab}
              onSelectTab={setActiveTab}
              page1={page1}
              page2={page2}
              allowSinglePagePdf={allowSinglePagePdf}
              onToggleAllowSinglePage={setAllowSinglePagePdf}
              onSwapPages={handleSwapPages}
              onRotateActive={handleRotateActive}
              onOpenManualCrop={() => setCropModalOpen(true)}
              onFilterChange={handleFilterChange}
              onAdjustmentChange={handleAdjustmentChange}
              onResetAdjustments={() => handleAdjustmentChange(0, 0)}
              onUploadSlot={(slot, file) => void handleUploadSingleFile(slot, file)}
            />

            <NamingExportPanel
              aiStatus={aiStatus}
              aiMessage={aiMessage}
              isWrongPageSlot={isWrongPageSlot}
              hasPage1={Boolean(page1)}
              hasPage2={Boolean(page2)}
              allowSinglePagePdf={allowSinglePagePdf}
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
              isDuplicateFilename={isDuplicateFilename}
              extractionVersion={extractionVersion}
              onReExtractAi={() => {
                if (page1?.processedDataUrl) {
                  void runVisionExtraction(page1.processedDataUrl, page1.id);
                }
              }}
              onSwapPages={handleSwapPages}
              onExportPdf={() => void handleExportPdf()}
              onResetWorkspace={handleResetWorkspace}
              onAnnounce={setLiveMessage}
            />
          </div>
        )}
      </main>

      {/* Toast Notification */}
      {toast ? (
        <div
          role="status"
          className={`fixed bottom-4 right-4 z-40 flex max-w-md items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold shadow-xl ${
            toast.kind === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
              : "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100"
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

      <GuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}
