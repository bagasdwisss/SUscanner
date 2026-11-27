"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  CloudUpload,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FolderPlus,
  Layers,
  Link2,
  Play,
  RefreshCw,
  Scissors,
  Sparkles,
  Trash2,
} from "lucide-react";
import { AppDialog } from "./AppDialog";
import {
  applyCorrectionMemoryToFields,
  learnWilayahCodeFromConfirmedScan,
  loadCorrectionMemory,
} from "@/lib/correction-memory";
import {
  detectPaperCornersFromCanvas,
  normalizeUploadedImage,
  prepareCleanCropForAi,
  processDocumentPage,
  renderRotatedCanvas,
} from "@/lib/document-scanner";
import { extractSearchableOcrWords, runLocalTesseractOcr } from "@/lib/local-ocr";
import { generateSuPdf } from "@/lib/pdf-generator";
import { splitMultiPagePdfToImageFiles } from "@/lib/pdf-splitter";
import { buildStructuredBackupZipBlob, triggerBlobDownload } from "@/lib/backup-export";
import {
  applyExtractionToForm,
  buildStandardFilename,
  createEmptyConfidences,
  createEmptyFields,
  HAK_OPTIONS,
  normalizeKecamatanName,
  normalizeKelurahanName,
  padFiveDigits,
  validateStandardFields,
} from "@/lib/su-formatter";
import {
  getKecamatanOptions,
  getKelurahanOptions,
  validateHakRegionCrossCheck,
} from "@/lib/wilayah-dict";
import type {
  AiExtractionResult,
  BatchQueuePair,
  DriveConflictPolicy,
  DriveUploadResult,
  OfflineUploadJob,
  PdfQualityPreset,
  SessionHistoryItem,
  StandardHakCode,
} from "@/lib/su-types";

type PairingStrategy = "auto" | "pairs" | "single";
type QueueFilter = "all" | "review" | "ready" | "done";

interface BatchQueueModalProps {
  open: boolean;
  onClose: () => void;
  initialFiles?: File[] | null;
  onConsumedInitialFiles?: () => void;
  pdfQuality: PdfQualityPreset;
  conflictPolicy: DriveConflictPolicy;
  appsScriptUrl: string;
  rootFolderId: string;
  syncToSheet: boolean;
  driveSheetUrl?: string | null;
  onSheetUrlDiscovered?: (url: string) => void;
  onExportedItem: (item: SessionHistoryItem) => Promise<void> | void;
  onEnqueueOffline: (job: OfflineUploadJob) => Promise<void> | void;
  onNotify: (kind: "success" | "error", text: string) => void;
  onRecordAiUsage: (evt: {
    engine: "gemini" | "local-ocr";
    model: string;
    status: number;
    ok: boolean;
    promptTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  }) => void;
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(
      String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length))),
    );
  }
  return btoa(parts.join(""));
}

function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

export function BatchQueueModal({
  open,
  onClose,
  initialFiles,
  onConsumedInitialFiles,
  pdfQuality,
  conflictPolicy: defaultConflictPolicy,
  appsScriptUrl,
  rootFolderId,
  syncToSheet,
  driveSheetUrl,
  onSheetUrlDiscovered,
  onExportedItem,
  onEnqueueOffline,
  onNotify,
  onRecordAiUsage,
}: BatchQueueModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const stopFlagRef = useRef(false);
  const uploadAllLockRef = useRef(false);
  const consumedInitialRef = useRef<File[] | null>(null);
  const kecListId = useId();
  const kelListId = useId();

  const [items, setItems] = useState<BatchQueuePair[]>([]);
  const [pairingStrategy, setPairingStrategy] =
    useState<PairingStrategy>("auto");
  const [filterTab, setFilterTab] = useState<QueueFilter>("all");
  const [conflictPolicy, setConflictPolicy] = useState<DriveConflictPolicy>(
    defaultConflictPolicy,
  );
  const [searchablePdf, setSearchablePdf] = useState<boolean>(true);
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestMessage, setIngestMessage] = useState<string | null>(null);
  const [isProcessingAi, setIsProcessingAi] = useState(false);
  const [isUploadingAll, setIsUploadingAll] = useState(false);
  const [isBuildingZip, setIsBuildingZip] = useState(false);
  const [discoveredSheetUrl, setDiscoveredSheetUrl] = useState<string | null>(
    driveSheetUrl ?? null,
  );

  const kecamatanOptions = useMemo(() => getKecamatanOptions(), []);
  const allKelurahanOptions = useMemo(() => getKelurahanOptions(), []);

  const ingestFiles = async (rawFiles: File[]) => {
    if (rawFiles.length === 0) return;
    setIsIngesting(true);
    setIngestMessage("Menyiapkan berkas antrean…");

    try {
      const flatImageFiles: File[] = [];
      for (const f of rawFiles) {
        if (isPdfFile(f)) {
          const pages = await splitMultiPagePdfToImageFiles(f, {
            maxPages: 120,
            onProgress: (cur, tot) =>
              setIngestMessage(`Memecah PDF "${f.name}": halaman ${cur}/${tot}…`),
          });
          for (const p of pages) flatImageFiles.push(p.file);
        } else {
          flatImageFiles.push(f);
        }
      }

      if (flatImageFiles.length === 0) {
        onNotify("error", "Tidak ada halaman gambar/PDF yang dapat dimuat.");
        return;
      }

      const decoded: Array<{
        fileName: string;
        rawUrl: string;
        rawWidth: number;
        rawHeight: number;
        corners: BatchQueuePair["page1Corners"];
        processedUrl: string;
        quality: BatchQueuePair["page1Quality"];
      }> = [];

      for (let i = 0; i < flatImageFiles.length; i++) {
        const file = flatImageFiles[i];
        setIngestMessage(
          `Auto-crop & cek ketajaman berkas ${i + 1}/${flatImageFiles.length}…`,
        );
        const norm = await normalizeUploadedImage(file);
        const rotCanvas = await renderRotatedCanvas(norm.rawUrl, 0);
        const detected = detectPaperCornersFromCanvas(rotCanvas);
        const proc = await processDocumentPage({
          rawUrl: norm.rawUrl,
          rotation: 0,
          corners: detected.corners,
          filter: "original",
          brightness: 0,
          contrast: 0,
          maxOutputSide: 2200,
          jpegQuality: 0.92,
        });
        decoded.push({
          fileName: file.name,
          rawUrl: norm.rawUrl,
          rawWidth: norm.rawWidth,
          rawHeight: norm.rawHeight,
          corners: detected.corners,
          processedUrl: proc.dataUrl,
          quality: proc.qualityReport,
        });
      }

      const newPairs: BatchQueuePair[] = [];
      if (pairingStrategy === "pairs") {
        for (let i = 0; i < decoded.length; i += 2) {
          const p1 = decoded[i];
          const p2 = decoded[i + 1];
          newPairs.push({
            id: `batch-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            status: "pending",
            page1FileName: p1.fileName,
            page1RawUrl: p1.rawUrl,
            page1Width: p1.rawWidth,
            page1Height: p1.rawHeight,
            page1Corners: p1.corners,
            page1ProcessedUrl: p1.processedUrl,
            page1Quality: p1.quality,
            ...(p2
              ? {
                  page2FileName: p2.fileName,
                  page2RawUrl: p2.rawUrl,
                  page2Width: p2.rawWidth,
                  page2Height: p2.rawHeight,
                  page2Corners: p2.corners,
                  page2ProcessedUrl: p2.processedUrl,
                  page2Quality: p2.quality,
                }
              : {}),
            fields: createEmptyFields(),
            confidences: createEmptyConfidences(),
            warnings: [...(p1.quality?.warnings ?? [])],
          });
        }
      } else {
        for (let i = 0; i < decoded.length; i++) {
          const p1 = decoded[i];
          newPairs.push({
            id: `batch-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            status: "pending",
            page1FileName: p1.fileName,
            page1RawUrl: p1.rawUrl,
            page1Width: p1.rawWidth,
            page1Height: p1.rawHeight,
            page1Corners: p1.corners,
            page1ProcessedUrl: p1.processedUrl,
            page1Quality: p1.quality,
            fields: createEmptyFields(),
            confidences: createEmptyConfidences(),
            warnings: [...(p1.quality?.warnings ?? [])],
          });
        }
      }

      setItems((prev) => [...prev, ...newPairs]);
      onNotify(
        "success",
        `${newPairs.length} item SU (${flatImageFiles.length} halaman) ditambahkan ke antrean.`,
      );
    } catch (err) {
      onNotify(
        "error",
        err instanceof Error ? err.message : "Gagal memuat berkas antrean.",
      );
    } finally {
      setIsIngesting(false);
      setIngestMessage(null);
    }
  };

  const ingestFilesRef = useRef(ingestFiles);
  useEffect(() => {
    ingestFilesRef.current = ingestFiles;
  });

  useEffect(() => {
    if (!open || !initialFiles || initialFiles.length === 0) return;
    if (consumedInitialRef.current === initialFiles) return;
    consumedInitialRef.current = initialFiles;
    Promise.resolve().then(() => {
      onConsumedInitialFiles?.();
      void ingestFilesRef.current(initialFiles);
    });
  }, [open, initialFiles, onConsumedInitialFiles]);

  const processQueueAiAndPairing = async () => {
    stopFlagRef.current = false;
    setIsProcessingAi(true);
    const currentSnapshot = [...items];
    const memory = loadCorrectionMemory();

    try {
      for (let idx = 0; idx < currentSnapshot.length; idx++) {
        if (stopFlagRef.current) break;
        const item = currentSnapshot[idx];
        if (
          item.status === "uploaded" ||
          item.status === "ready" ||
          item.status === "needs-review"
        ) {
          continue;
        }

        setItems((prev) =>
          prev.map((x) =>
            x.id === item.id ? { ...x, status: "processing", errorMessage: undefined } : x,
          ),
        );

        let extracted: ReturnType<typeof applyExtractionToForm> | null = null;
        let aiSource: "gemini" | "local-ocr" = "gemini";
        let page1Words = item.page1OcrWords;

        try {
          const aiImg = await prepareCleanCropForAi({
            rawUrl: item.page1RawUrl,
            rotation: 0,
            corners: item.page1Corners,
            maxSide: 1600,
          });
          const res = await fetch("/api/extract-su", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageDataUrl: aiImg }),
          });
          const payload = (await res.json().catch(() => null)) as {
            extraction?: AiExtractionResult;
            model?: string;
            usage?: { promptTokens?: number; outputTokens?: number; totalTokens?: number };
          } | null;

          if (res.ok && payload?.extraction) {
            onRecordAiUsage({
              engine: "gemini",
              model: payload.model || "gemini",
              status: res.status,
              ok: true,
              promptTokens: payload.usage?.promptTokens,
              outputTokens: payload.usage?.outputTokens,
              totalTokens: payload.usage?.totalTokens,
            });
            extracted = applyExtractionToForm(payload.extraction);
          } else {
            onRecordAiUsage({
              engine: "gemini",
              model: payload?.model || "gemini",
              status: res.status,
              ok: false,
            });
          }
        } catch {
          // Network or upstream issue -> falls back cleanly to built-in OCR below
        }

        if (!extracted) {
          aiSource = "local-ocr";
          try {
            const ocrRes = await runLocalTesseractOcr(item.page1ProcessedUrl);
            extracted = ocrRes.processed;
            page1Words = ocrRes.ocrWords;
            onRecordAiUsage({
              engine: "local-ocr",
              model: "tesseract.js-ind",
              status: 200,
              ok: true,
            });
          } catch {
            // Still leave editable manually
          }
        }

        if (extracted) {
          const learned = applyCorrectionMemoryToFields(
            extracted.fields,
            extracted.rawEvidence,
            memory,
          );
          const mergedFields = learned.fields;
          const cross = validateHakRegionCrossCheck({
            rawNomorHak: extracted.rawEvidence.teksNomorHak,
            kecamatan: mergedFields.kecamatan,
            kelurahan: mergedFields.kelurahan,
            learnedCodes: memory.wilayahCodes,
          });
          const val = validateStandardFields(mergedFields);
          const allWarnings = [
            ...(item.page1Quality?.warnings ?? []),
            ...extracted.warnings,
            ...learned.appliedNotes,
            ...(cross.status === "mismatch" && cross.message ? [cross.message] : []),
          ];

          // Auto-pairing layout detection: if pairingStrategy === "auto", Page 1 looks like Peta Bidang
          // (isWrongPageSlot === true) and previous item has no Page 2 yet, attach it as Page 2!
          const canAttachToPrevious =
            pairingStrategy === "auto" &&
            extracted.isWrongPageSlot &&
            !item.page2ProcessedUrl &&
            idx > 0;

          let attachedToPrev = false;
          if (canAttachToPrevious) {
            setItems((prev) => {
              const curIdx = prev.findIndex((p) => p.id === item.id);
              if (curIdx > 0 && !prev[curIdx - 1].page2ProcessedUrl) {
                attachedToPrev = true;
                const copy = [...prev];
                copy[curIdx - 1] = {
                  ...copy[curIdx - 1],
                  page2FileName: item.page1FileName,
                  page2RawUrl: item.page1RawUrl,
                  page2Width: item.page1Width,
                  page2Height: item.page1Height,
                  page2Corners: item.page1Corners,
                  page2ProcessedUrl: item.page1ProcessedUrl,
                  page2Quality: item.page1Quality,
                };
                copy.splice(curIdx, 1);
                return copy;
              }
              return prev;
            });
          }

          if (!attachedToPrev) {
            const hasWarningOrMissing =
              !val.valid ||
              !mergedFields.kecamatan.trim() ||
              allWarnings.length > 0 ||
              extracted.confidences.nomorSu.level !== "high" ||
              extracted.confidences.nomorHak.level !== "high";

            setItems((prev) =>
              prev.map((x) =>
                x.id === item.id
                  ? {
                      ...x,
                      status: hasWarningOrMissing ? "needs-review" : "ready",
                      fields: mergedFields,
                      confidences: extracted!.confidences,
                      warnings: allWarnings,
                      aiSource,
                      page1OcrWords: page1Words,
                    }
                  : x,
              ),
            );
          }
        } else {
          setItems((prev) =>
            prev.map((x) =>
              x.id === item.id
                ? {
                    ...x,
                    status: "needs-review",
                    warnings: [
                      ...x.warnings,
                      "Gagal ekstrak otomatis — harap isi kolom SU secara manual.",
                    ],
                  }
                : x,
            ),
          );
        }

        // Safe rate-limit pacing between items
        if (idx < currentSnapshot.length - 1 && !stopFlagRef.current) {
          await new Promise((r) => setTimeout(r, 650));
        }
      }
    } finally {
      setIsProcessingAi(false);
    }
  };

  const buildItemPdf = async (
    item: BatchQueuePair,
    maxBytesForDrive?: number,
  ) => {
    let p1Words = item.page1OcrWords;
    if (searchablePdf && (!p1Words || p1Words.length === 0)) {
      try {
        p1Words = await extractSearchableOcrWords(item.page1ProcessedUrl);
      } catch {
        // Proceed smoothly even if OCR worker fails
      }
    }
    const pages = [
      {
        dataUrl: item.page1ProcessedUrl,
        width: item.page1Width,
        height: item.page1Height,
        ocrWords: p1Words,
      },
      ...(item.page2ProcessedUrl && item.page2Width && item.page2Height
        ? [
            {
              dataUrl: item.page2ProcessedUrl,
              width: item.page2Width,
              height: item.page2Height,
              ocrWords: item.page2OcrWords,
            },
          ]
        : []),
    ];

    const filename = buildStandardFilename(item.fields);
    return generateSuPdf(pages, pdfQuality, maxBytesForDrive, {
      title: filename,
      author: "SU-Scanner",
      subject: `Surat Ukur ${item.fields.kecamatan}${item.fields.kelurahan ? ` / ${item.fields.kelurahan}` : ""}`,
      keywords: [item.fields.nib || "", item.fields.luasTanah || ""].filter(
        Boolean,
      ),
    });
  };

  const handleUploadAllReady = async () => {
    if (uploadAllLockRef.current) return;
    uploadAllLockRef.current = true;
    setIsUploadingAll(true);
    let successCount = 0;
    let offlineQueued = 0;

    try {
      for (const item of items) {
        if (item.status === "uploaded" || item.status === "uploading") continue;
        const val = validateStandardFields(item.fields);
        const kec = normalizeKecamatanName(item.fields.kecamatan);
        if (!val.valid || !kec) continue;

        setItems((prev) =>
          prev.map((x) => (x.id === item.id ? { ...x, status: "uploading" } : x)),
        );

        try {
          const filename = buildStandardFilename(item.fields);
          const kel = normalizeKelurahanName(item.fields.kelurahan);
          const pdf = await buildItemPdf(item, 2_850_000);
          const pdfBase64 = uint8ToBase64(pdf.bytes);

          const isOffline =
            typeof navigator !== "undefined" && navigator.onLine === false;

          if (isOffline) {
            await onEnqueueOffline({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              createdAt: Date.now(),
              filename,
              kecamatan: kec,
              kelurahan: kel || undefined,
              rootFolderId,
              conflictPolicy,
              nomorSu: padFiveDigits(item.fields.nomorSu),
              tahunSu: item.fields.tahunSu,
              kodeHak: item.fields.kodeHak || "M",
              nomorHak: padFiveDigits(item.fields.nomorHak),
              nib: item.fields.nib,
              luasTanah: item.fields.luasTanah,
              pageCount: pdf.pageCount,
              sizeBytes: pdf.sizeBytes,
              pdfBytes: pdf.bytes.slice().buffer,
              attempts: 0,
              lastError: "Koneksi offline — menunggu internet pulih.",
            });
            offlineQueued++;
            setItems((prev) =>
              prev.map((x) =>
                x.id === item.id
                  ? {
                      ...x,
                      status: "ready",
                      warnings: ["Masuk antrean offline (menunggu koneksi)."],
                    }
                  : x,
              ),
            );
            continue;
          }

          const res = await fetch("/api/drive/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename,
              kecamatan: kec,
              kelurahan: kel || undefined,
              rootFolderId,
              pdfBase64,
              conflictPolicy,
              appsScriptUrl,
              sheetMeta: {
                logToSheet: syncToSheet,
                nomorSu: padFiveDigits(item.fields.nomorSu),
                tahunSu: item.fields.tahunSu,
                kodeHak: item.fields.kodeHak || "M",
                nomorHak: padFiveDigits(item.fields.nomorHak),
                nib: item.fields.nib || "",
                luasTanah: item.fields.luasTanah || "",
                pageCount: pdf.pageCount,
              },
            }),
          });
          const data = (await res.json().catch(() => null)) as
            | DriveUploadResult
            | { ok: false; error?: string }
            | null;

          if (res.ok && data && "ok" in data && data.ok) {
            successCount++;
            if (data.sheetUrl) {
              setDiscoveredSheetUrl(data.sheetUrl);
              onSheetUrlDiscovered?.(data.sheetUrl);
            }
            learnWilayahCodeFromConfirmedScan({
              rawNomorHak: "",
              kecamatan: kec,
              kelurahan: kel,
            });
            await onExportedItem({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              filename: data.fileName || filename,
              createdAt: Date.now(),
              pageCount: pdf.pageCount,
              sizeBytes: pdf.sizeBytes,
              nomorSu: padFiveDigits(item.fields.nomorSu),
              tahunSu: item.fields.tahunSu,
              kodeHak: item.fields.kodeHak || "M",
              nomorHak: padFiveDigits(item.fields.nomorHak),
              kecamatan: data.kecamatanName || kec,
              kelurahan: data.kelurahanName || kel || undefined,
              nib: item.fields.nib,
              luasTanah: item.fields.luasTanah,
              driveFileUrl: data.fileUrl,
              driveFolderUrl: data.folderUrl,
              pdfBytes: pdf.bytes.slice().buffer,
            });
            setItems((prev) =>
              prev.map((x) =>
                x.id === item.id
                  ? { ...x, status: "uploaded", driveResult: data }
                  : x,
              ),
            );
          } else {
            throw new Error(
              (data && "error" in data && data.error) || `HTTP ${res.status}`,
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Upload gagal.";
          setItems((prev) =>
            prev.map((x) =>
              x.id === item.id
                ? { ...x, status: "error", errorMessage: msg }
                : x,
            ),
          );
        }
      }

      if (successCount > 0 || offlineQueued > 0) {
        onNotify(
          "success",
          `Batch selesai: ${successCount} file diunggah ke Drive${offlineQueued > 0 ? `, ${offlineQueued} masuk antrean offline` : ""}.`,
        );
      }
    } finally {
      uploadAllLockRef.current = false;
      setIsUploadingAll(false);
    }
  };

  const handleDownloadBatchZip = async () => {
    const validItems = items.filter(
      (it) => validateStandardFields(it.fields).valid && it.fields.kecamatan.trim(),
    );
    if (validItems.length === 0) {
      onNotify(
        "error",
        "Minimal 1 item batch harus memiliki kolom SU & Kecamatan yang lengkap.",
      );
      return;
    }

    setIsBuildingZip(true);
    try {
      const historyItems: SessionHistoryItem[] = [];
      for (const it of validItems) {
        const pdf = await buildItemPdf(it);
        const filename = buildStandardFilename(it.fields);
        historyItems.push({
          id: it.id,
          filename,
          createdAt: Date.now(),
          pageCount: pdf.pageCount,
          sizeBytes: pdf.sizeBytes,
          nomorSu: padFiveDigits(it.fields.nomorSu),
          tahunSu: it.fields.tahunSu,
          kodeHak: it.fields.kodeHak || "M",
          nomorHak: padFiveDigits(it.fields.nomorHak),
          kecamatan: normalizeKecamatanName(it.fields.kecamatan),
          kelurahan: normalizeKelurahanName(it.fields.kelurahan) || undefined,
          nib: it.fields.nib,
          luasTanah: it.fields.luasTanah,
          driveFileUrl: it.driveResult?.fileUrl,
          driveFolderUrl: it.driveResult?.folderUrl,
          pdfBytes: pdf.bytes.slice().buffer,
        });
      }
      const { blob, includedPdfCount } =
        await buildStructuredBackupZipBlob(historyItems);
      const stamp = new Date().toISOString().slice(0, 10);
      triggerBlobDownload(blob, `SU-Batch-${stamp}.zip`);
      onNotify(
        "success",
        `Paket ZIP terstruktur (${includedPdfCount} PDF per Kecamatan/Kelurahan) diunduh.`,
      );
    } catch (err) {
      onNotify(
        "error",
        err instanceof Error ? err.message : "Gagal mengemas ZIP.",
      );
    } finally {
      setIsBuildingZip(false);
    }
  };

  const visibleItems = items.filter((it) => {
    if (filterTab === "review") {
      return it.status === "needs-review" || it.status === "error" || it.warnings.length > 0;
    }
    if (filterTab === "ready") return it.status === "ready";
    if (filterTab === "done") return it.status === "uploaded";
    return true;
  });

  const mergeWithPrevious = (idxInAll: number) => {
    if (idxInAll <= 0) return;
    setItems((prev) => {
      const target = prev[idxInAll];
      const host = prev[idxInAll - 1];
      if (!target || !host || host.page2ProcessedUrl) return prev;
      const next = [...prev];
      next[idxInAll - 1] = {
        ...host,
        page2FileName: target.page1FileName,
        page2RawUrl: target.page1RawUrl,
        page2Width: target.page1Width,
        page2Height: target.page1Height,
        page2Corners: target.page1Corners,
        page2ProcessedUrl: target.page1ProcessedUrl,
        page2Quality: target.page1Quality,
      };
      next.splice(idxInAll, 1);
      return next;
    });
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      lightDismiss={false}
      title="Antrean Batch Massal & Pemecah PDF (Auto-Pairing)"
      subtitle="Unggah puluhan foto warkah atau 1 file PDF bundle scanner (ADF). Ekstrak paralel aman rate-limit lalu tinjau item kuning/merah sebelum Upload Semua."
      maxWidthClass="max-w-5xl"
      footer={
        <>
          {items.length > 0 ? (
            <button
              type="button"
              disabled={isProcessingAi || isUploadingAll}
              onClick={() => setItems([])}
              className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-white px-3.5 py-2 text-xs text-[#9F1239] hover:bg-[#FFF1F2] disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Kosongkan Antrean
            </button>
          ) : null}
          {discoveredSheetUrl || driveSheetUrl ? (
            <a
              href={discoveredSheetUrl || driveSheetUrl || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 border-[#A7F3D0] bg-[#ECFDF5] px-3.5 py-2 text-xs text-[#065F46] hover:bg-[#D1FAE5]"
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              Buka Google Sheets
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          ) : null}
          <button
            type="button"
            disabled={isBuildingZip || items.length === 0}
            onClick={() => void handleDownloadBatchZip()}
            className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-white px-3.5 py-2 text-xs text-[#111114] hover:bg-[#F9FAFB] disabled:opacity-50"
          >
            <Archive className="h-4 w-4 text-[#5E17EB]" aria-hidden="true" />
            {isBuildingZip ? "Mengemas ZIP…" : "Unduh Backup ZIP"}
          </button>
          <button
            type="button"
            disabled={isUploadingAll || isProcessingAi || items.length === 0}
            onClick={() => void handleUploadAllReady()}
            className="nb-btn-sm wollo-cta-dark inline-flex min-h-10 items-center gap-1.5 px-4 py-2 text-xs disabled:opacity-50"
          >
            <CloudUpload className="h-4 w-4" aria-hidden="true" />
            {isUploadingAll ? "Mengunggah Batch…" : "Upload Semua yang Siap"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="nb-btn-sm inline-flex min-h-10 items-center bg-[#F6F7F9] px-4 py-2 text-xs text-[#111114]"
          >
            Tutup
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Shared Datalists for Official Wilayah Autocomplete */}
        <datalist id={kecListId}>
          {kecamatanOptions.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
        <datalist id={kelListId}>
          {allKelurahanOptions.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>

        {/* Top Control Bar */}
        <div className="nb-card flex flex-wrap items-center justify-between gap-3 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.pdf"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const picked = e.target.files ? Array.from(e.target.files) : [];
                if (picked.length > 0) void ingestFiles(picked);
                e.target.value = "";
              }}
              className="hidden"
            />
            <button
              type="button"
              disabled={isIngesting}
              onClick={() => inputRef.current?.click()}
              className="nb-btn-sm wollo-cta-primary inline-flex min-h-10 items-center gap-1.5 px-4 py-2 text-xs"
            >
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
              Pilih Banyak Foto / File PDF Massal
            </button>

            <select
              aria-label="Mode Pengelompokan Halaman"
              value={pairingStrategy}
              onChange={(e) =>
                setPairingStrategy(e.target.value as PairingStrategy)
              }
              className="su-control min-h-10 rounded-xl px-3 py-1.5 text-xs font-semibold"
            >
              <option value="auto">Auto-Pair (Deteksi Layout Hal 1 &amp; 2)</option>
              <option value="pairs">Pasangkan Tiap 2 File Berurutan (1+2, 3+4…)</option>
              <option value="single">1 Lembar per PDF (SU Tahun 60-an)</option>
            </select>

            <select
              aria-label="Kebijakan Konflik Drive"
              value={conflictPolicy}
              onChange={(e) =>
                setConflictPolicy(e.target.value as DriveConflictPolicy)
              }
              className="su-control min-h-10 rounded-xl px-3 py-1.5 text-xs font-semibold"
            >
              <option value="revision">Konflik: Simpan _rev2</option>
              <option value="overwrite">Konflik: Timpa File Lama</option>
              <option value="skip">Konflik: Lewati Otomatis</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] px-3 py-1.5 text-xs font-semibold text-[#111114]">
              <input
                type="checkbox"
                checked={searchablePdf}
                onChange={(e) => setSearchablePdf(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              <span>PDF Ctrl+F</span>
            </label>

            {isProcessingAi ? (
              <button
                type="button"
                onClick={() => {
                  stopFlagRef.current = true;
                }}
                className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 border-[#FECDD3] bg-[#FFF1F2] px-4 py-2 text-xs text-[#9F1239]"
              >
                Hentikan Proses
              </button>
            ) : (
              <button
                type="button"
                disabled={items.length === 0 || isIngesting}
                onClick={() => void processQueueAiAndPairing()}
                className="nb-btn-sm wollo-cta-dark inline-flex min-h-10 items-center gap-1.5 px-4 py-2 text-xs disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                Proses AI &amp; OCR ({items.filter((i) => i.status === "pending").length})
              </button>
            )}
          </div>
        </div>

        {isIngesting && ingestMessage ? (
          <div className="nb-card flex items-center gap-3 border-[#DDD6FE] bg-[#F5F3FF] px-4 py-3 text-xs font-semibold text-[#4C0FD1]">
            <Scissors className="h-4 w-4 shrink-0 animate-pulse" aria-hidden="true" />
            <span>{ingestMessage}</span>
          </div>
        ) : null}

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-[#E5E7EB] bg-white p-1 text-xs">
            {(
              [
                { id: "all", label: `Semua (${items.length})` },
                {
                  id: "review",
                  label: `Perlu Cek (${items.filter((i) => i.status === "needs-review" || i.status === "error" || i.warnings.length > 0).length})`,
                },
                {
                  id: "ready",
                  label: `Siap Upload (${items.filter((i) => i.status === "ready").length})`,
                },
                {
                  id: "done",
                  label: `Terunggah (${items.filter((i) => i.status === "uploaded").length})`,
                },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilterTab(t.id)}
                className={`rounded-full px-3 py-1 font-semibold transition-colors ${
                  filterTab === t.id
                    ? "bg-[#5E17EB] text-white"
                    : "text-[#4B5563] hover:bg-[#F6F7F9]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <span className="text-xs font-medium text-[#4B5563]">
            PDF multi-halaman dipecah otomatis via `pdfjs-dist` (hingga 120 halaman per berkas).
          </span>
        </div>

        {/* Queue Rows */}
        {visibleItems.length === 0 ? (
          <div className="nb-card bg-white p-8 text-center">
            <Layers className="mx-auto h-9 w-9 text-[#5E17EB]" aria-hidden="true" />
            <p className="mt-2.5 text-sm font-bold text-[#111114]">
              {items.length === 0
                ? "Belum ada berkas di antrean batch"
                : "Tidak ada item di kategori filter ini"}
            </p>
            <p className="mt-1 text-xs text-[#4B5563]">
              Klik <strong>Pilih Banyak Foto / File PDF Massal</strong> untuk memasukkan puluhan foto SU sekaligus atau memecah 1 file PDF scanner kantor.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {visibleItems.map((it) => {
              const allIdx = items.findIndex((x) => x.id === it.id);
              const val = validateStandardFields(it.fields);
              const previewName = buildStandardFilename(it.fields);
              const statusTone =
                it.status === "uploaded"
                  ? "border-[#A7F3D0] bg-[#ECFDF5]"
                  : it.status === "error" || !val.valid
                    ? "border-[#FECDD3] bg-[#FFF1F2]/60"
                    : it.status === "needs-review" || it.warnings.length > 0
                      ? "border-[#FDE68A] bg-[#FFFBEB]/60"
                      : "border-[#E5E7EB] bg-white";

              return (
                <div
                  key={it.id}
                  className={`nb-card-sm space-y-2.5 p-3.5 ${statusTone}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="nb-pill bg-white font-mono">
                        #{allIdx + 1} · {it.page2ProcessedUrl ? "2 HAL" : "1 HAL"}
                      </span>
                      <span className="max-w-[200px] truncate font-mono text-xs font-bold text-[#111114]">
                        {it.page1FileName}
                        {it.page2FileName ? ` + ${it.page2FileName}` : ""}
                      </span>
                      {it.status === "processing" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#F5F3FF] px-2.5 py-0.5 text-[11px] font-semibold text-[#5E17EB]">
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          Memproses…
                        </span>
                      ) : it.status === "uploaded" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-[11px] font-bold text-[#065F46]">
                          <CheckCircle2 className="h-3 w-3" />
                          Terunggah
                        </span>
                      ) : it.status === "ready" && val.valid ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2.5 py-0.5 text-[11px] font-bold text-[#065F46]">
                          <Sparkles className="h-3 w-3" />
                          Siap Upload
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#FFFBEB] px-2.5 py-0.5 text-[11px] font-bold text-[#92400E]">
                          <AlertTriangle className="h-3 w-3" />
                          Perlu Cek
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {allIdx > 0 &&
                      !it.page2ProcessedUrl &&
                      !items[allIdx - 1]?.page2ProcessedUrl ? (
                        <button
                          type="button"
                          onClick={() => mergeWithPrevious(allIdx)}
                          className="nb-btn-sm inline-flex items-center gap-1 bg-white px-2.5 py-1 text-[11px] text-[#5E17EB]"
                          title="Jadikan gambar ini sebagai Halaman 2 (Peta Bidang) untuk item sebelumnya"
                        >
                          <Link2 className="h-3 w-3" />
                          Gabung sbg Hal 2
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          setItems((prev) => prev.filter((x) => x.id !== it.id))
                        }
                        aria-label={`Hapus ${it.page1FileName}`}
                        className="nb-btn-sm inline-flex items-center bg-white p-1.5 text-[#9F1239]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Quick inline edit grid */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                    <input
                      type="text"
                      aria-label="Nomor SU"
                      placeholder="No SU (5D)"
                      value={it.fields.nomorSu}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) =>
                            x.id === it.id
                              ? {
                                  ...x,
                                  fields: { ...x.fields, nomorSu: e.target.value },
                                }
                              : x,
                          ),
                        )
                      }
                      className="su-control min-h-9 rounded-lg px-2.5 py-1 font-mono text-xs font-bold"
                    />
                    <input
                      type="text"
                      aria-label="Tahun SU"
                      placeholder="Tahun"
                      value={it.fields.tahunSu}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) =>
                            x.id === it.id
                              ? {
                                  ...x,
                                  fields: { ...x.fields, tahunSu: e.target.value },
                                }
                              : x,
                          ),
                        )
                      }
                      className="su-control min-h-9 rounded-lg px-2.5 py-1 font-mono text-xs font-bold"
                    />
                    <select
                      aria-label="Jenis Hak"
                      value={it.fields.kodeHak}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) =>
                            x.id === it.id
                              ? {
                                  ...x,
                                  fields: {
                                    ...x.fields,
                                    kodeHak: e.target.value as StandardHakCode,
                                  },
                                }
                              : x,
                          ),
                        )
                      }
                      className="su-control min-h-9 rounded-lg px-2 py-1 text-xs font-bold"
                    >
                      {HAK_OPTIONS.map((o) => (
                        <option key={o.code} value={o.code}>
                          {o.code}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      aria-label="Nomor Hak"
                      placeholder="No Hak (5D)"
                      value={it.fields.nomorHak}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) =>
                            x.id === it.id
                              ? {
                                  ...x,
                                  fields: { ...x.fields, nomorHak: e.target.value },
                                }
                              : x,
                          ),
                        )
                      }
                      className="su-control min-h-9 rounded-lg px-2.5 py-1 font-mono text-xs font-bold"
                    />
                    <input
                      type="text"
                      list={kecListId}
                      aria-label="Kecamatan"
                      placeholder="Kecamatan"
                      value={it.fields.kecamatan}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) =>
                            x.id === it.id
                              ? {
                                  ...x,
                                  fields: { ...x.fields, kecamatan: e.target.value },
                                }
                              : x,
                          ),
                        )
                      }
                      className="su-control min-h-9 rounded-lg px-2.5 py-1 text-xs font-bold"
                    />
                    <input
                      type="text"
                      list={kelListId}
                      aria-label="Kelurahan"
                      placeholder="Kelurahan"
                      value={it.fields.kelurahan}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((x) =>
                            x.id === it.id
                              ? {
                                  ...x,
                                  fields: { ...x.fields, kelurahan: e.target.value },
                                }
                              : x,
                          ),
                        )
                      }
                      className="su-control min-h-9 rounded-lg px-2.5 py-1 text-xs font-bold"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1 font-mono font-semibold text-[#4B5563]">
                      <FileText className="h-3 w-3 text-[#5E17EB]" />
                      {previewName}
                    </span>
                    {it.errorMessage ? (
                      <span className="font-bold text-[#9F1239]">
                        Galat: {it.errorMessage}
                      </span>
                    ) : it.warnings.length > 0 ? (
                      <span className="font-semibold text-[#92400E]">
                        {it.warnings[0]}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppDialog>
  );
}
