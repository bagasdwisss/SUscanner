import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { loadImageElement } from "./document-scanner";
import {
  computeOcrWordPdfPlacement,
  computePdfPageMetrics,
  type PdfPageRotationDeg,
} from "./pdf-layout";
import type {
  OcrWordBox,
  PdfOrientationMode,
  PdfQualityPreset,
} from "./su-types";

export interface PdfPageInput {
  dataUrl: string;
  width: number;
  height: number;
  ocrWords?: OcrWordBox[];
}

export interface PdfGenerationMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
}

export interface PdfGenerationResult {
  bytes: Uint8Array;
  blob: Blob;
  sizeBytes: number;
  pageCount: number;
  qualityUsed: number;
  searchableWordCount: number;
}

const PRESET_CONFIG: Record<
  PdfQualityPreset,
  { maxSide: number; startQuality: number; targetMaxBytes: number }
> = {
  high: { maxSide: 2800, startQuality: 0.95, targetMaxBytes: 4_800_000 },
  standard: { maxSide: 2250, startQuality: 0.91, targetMaxBytes: 2_600_000 },
  compact: { maxSide: 1750, startQuality: 0.88, targetMaxBytes: 1_750_000 },
};

/**
 * Strips non-WinAnsi characters so PDF StandardFonts.Helvetica never fails
 * while preserving readable alphanumeric letters, punctuation, and Indonesian characters.
 */
function sanitizeWinAnsiText(raw: string): string {
  return raw
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function reencodeJpegBytes(
  img: HTMLImageElement,
  maxSide: number,
  quality: number,
  orientationMode: PdfOrientationMode,
): Promise<{
  bytes: Uint8Array;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
  rotationDeg: PdfPageRotationDeg;
}> {
  const metrics = computePdfPageMetrics(
    img.naturalWidth,
    img.naturalHeight,
    maxSide,
    orientationMode,
  );

  const canvas = document.createElement("canvas");
  canvas.width = metrics.outW;
  canvas.height = metrics.outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Kanvas 2D tidak tersedia untuk kompresi PDF.");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, metrics.outW, metrics.outH);

  if (metrics.rotationDeg === -90) {
    ctx.save();
    ctx.translate(0, metrics.srcScaledW);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, 0, 0, metrics.srcScaledW, metrics.srcScaledH);
    ctx.restore();
  } else if (metrics.rotationDeg === 90) {
    ctx.save();
    ctx.translate(metrics.srcScaledH, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, 0, 0, metrics.srcScaledW, metrics.srcScaledH);
    ctx.restore();
  } else {
    ctx.drawImage(img, 0, 0, metrics.srcScaledW, metrics.srcScaledH);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) =>
        b ? resolve(b) : reject(new Error("Gagal mengompresi gambar PDF.")),
      "image/jpeg",
      quality,
    );
  });

  const buffer = await blob.arrayBuffer();
  return {
    bytes: new Uint8Array(buffer),
    width: metrics.outW,
    height: metrics.outH,
    pageWidth: metrics.pageWidth,
    pageHeight: metrics.pageHeight,
    rotationDeg: metrics.rotationDeg,
  };
}

async function encodePdfDocument(
  pages: PdfPageInput[],
  loadedImages: HTMLImageElement[],
  maxSide: number,
  quality: number,
  metadata?: PdfGenerationMetadata,
  orientationMode: PdfOrientationMode = "landscape-ccw",
): Promise<{ bytes: Uint8Array; searchableWordCount: number }> {
  const encodedPages = await Promise.all(
    loadedImages.map((img) =>
      reencodeJpegBytes(img, maxSide, quality, orientationMode),
    ),
  );

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(metadata?.title || "Surat Ukur (SU) - Arsip Digital");
  pdfDoc.setProducer("SU-Scanner");
  pdfDoc.setCreator("SU-Scanner ATR/BPN");
  if (metadata?.author) pdfDoc.setAuthor(metadata.author);
  if (metadata?.subject) pdfDoc.setSubject(metadata.subject);
  if (metadata?.keywords?.length) pdfDoc.setKeywords(metadata.keywords);

  const hasWords = pages.some((p) => (p.ocrWords?.length ?? 0) > 0);
  const hiddenFont = hasWords
    ? await pdfDoc.embedFont(StandardFonts.Helvetica)
    : null;
  let searchableWordCount = 0;

  for (let i = 0; i < encodedPages.length; i++) {
    const ep = encodedPages[i];
    const sourceWords = pages[i].ocrWords;
    const embedded = await pdfDoc.embedJpg(ep.bytes);
    const { pageWidth, pageHeight } = ep;

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });

    // Embed invisible selectable & Ctrl+F searchable OCR text overlay aligned to rotated/landscape coordinates
    if (hiddenFont && sourceWords && sourceWords.length > 0) {
      for (const word of sourceWords) {
        const clean = sanitizeWinAnsiText(word.text);
        if (!clean) continue;
        const placement = computeOcrWordPdfPlacement(
          word,
          pageWidth,
          pageHeight,
          ep.rotationDeg,
        );
        try {
          page.drawText(clean, {
            x: placement.x,
            y: placement.y,
            size: placement.fontSize,
            font: hiddenFont,
            color: rgb(0, 0, 0),
            opacity: 0,
            ...(placement.rotateDeg !== 0
              ? { rotate: degrees(placement.rotateDeg) }
              : {}),
          });
          searchableWordCount++;
        } catch {
          // Skip unencodable glyphs cleanly
        }
      }
    }
  }

  return {
    bytes: await pdfDoc.save({ useObjectStreams: true }),
    searchableWordCount,
  };
}

/**
 * Generates a multi-page PDF with always-landscape orientation by default (auto-rotating
 * portrait scans 90° to fill the landscape sheet) and optional invisible Ctrl+F OCR layer.
 */
export async function generateSuPdf(
  pages: PdfPageInput[],
  preset: PdfQualityPreset,
  maxBytesOverride?: number,
  metadata?: PdfGenerationMetadata,
  orientationMode: PdfOrientationMode = "landscape-ccw",
): Promise<PdfGenerationResult> {
  if (pages.length === 0) {
    throw new Error("Minimal 1 halaman diperlukan untuk membuat PDF.");
  }

  const config = PRESET_CONFIG[preset];
  const targetMaxBytes = maxBytesOverride
    ? Math.min(config.targetMaxBytes, maxBytesOverride)
    : config.targetMaxBytes;
  // Drive uploads use a calibrated maxSide & quality so the 2.85 MB target hits on the 1st pass
  const isDriveCap = Boolean(maxBytesOverride && maxBytesOverride <= 3_000_000);
  const effectiveMaxSide = isDriveCap
    ? Math.min(config.maxSide, pages.length >= 2 ? 2050 : 2350)
    : config.maxSide;
  const qualitySteps =
    preset === "high"
      ? isDriveCap
        ? pages.length >= 2
          ? [0.86, 0.78, 0.7]
          : [0.91, 0.84, 0.76]
        : [0.95, 0.9, 0.85]
      : preset === "standard"
        ? isDriveCap && pages.length >= 2
          ? [0.85, 0.78]
          : [0.91, 0.86, 0.82]
        : [0.88, 0.84, 0.8];

  const loadedImages = await Promise.all(
    pages.map((p) => loadImageElement(p.dataUrl)),
  );

  let lastBytes: Uint8Array = new Uint8Array();
  let lastQuality = qualitySteps[0] ?? config.startQuality;
  let lastWordCount = 0;

  for (const quality of qualitySteps) {
    const q = Math.max(0.55, Math.min(0.96, quality));
    const encoded = await encodePdfDocument(
      pages,
      loadedImages,
      effectiveMaxSide,
      q,
      metadata,
      orientationMode,
    );
    lastBytes = encoded.bytes;
    lastQuality = q;
    lastWordCount = encoded.searchableWordCount;

    if (lastBytes.byteLength <= targetMaxBytes) {
      break;
    }
  }

  // Ensure Vercel Serverless 4.5 MB JSON body limit (~3.0 MB binary PDF) is never exceeded
  if (maxBytesOverride && lastBytes.byteLength > maxBytesOverride) {
    const fallback = await encodePdfDocument(
      pages,
      loadedImages,
      1650,
      0.76,
      metadata,
      orientationMode,
    );
    lastBytes = fallback.bytes;
    lastQuality = 0.76;
    lastWordCount = fallback.searchableWordCount;
  }

  const normalizedBuffer = new Uint8Array(lastBytes).buffer;
  const blob = new Blob([normalizedBuffer], { type: "application/pdf" });

  return {
    bytes: lastBytes,
    blob,
    sizeBytes: lastBytes.byteLength,
    pageCount: pages.length,
    qualityUsed: lastQuality,
    searchableWordCount: lastWordCount,
  };
}

export function triggerPdfDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1500);
}
