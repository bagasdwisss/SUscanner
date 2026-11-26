import { PDFDocument } from "pdf-lib";
import { loadImageElement } from "./document-scanner";
import type { PdfQualityPreset } from "./su-types";

export interface PdfPageInput {
  dataUrl: string;
  width: number;
  height: number;
}

export interface PdfGenerationResult {
  bytes: Uint8Array;
  blob: Blob;
  sizeBytes: number;
  pageCount: number;
  qualityUsed: number;
}

const PRESET_CONFIG: Record<
  PdfQualityPreset,
  { maxSide: number; startQuality: number; targetMaxBytes: number }
> = {
  high: { maxSide: 2800, startQuality: 0.94, targetMaxBytes: 4_800_000 },
  standard: { maxSide: 1900, startQuality: 0.82, targetMaxBytes: 1_500_000 },
  compact: { maxSide: 1400, startQuality: 0.68, targetMaxBytes: 900_000 },
};

async function reencodeJpegBytes(
  dataUrl: string,
  maxSide: number,
  quality: number,
): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const img = await loadImageElement(dataUrl);
  const scale = Math.min(
    1,
    maxSide / Math.max(img.naturalWidth, img.naturalHeight),
  );
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Kanvas 2D tidak tersedia untuk kompresi PDF.");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

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
    width: w,
    height: h,
  };
}

async function encodePdfDocument(
  pages: PdfPageInput[],
  maxSide: number,
  quality: number,
): Promise<Uint8Array> {
  const encodedPages = await Promise.all(
    pages.map((p) => reencodeJpegBytes(p.dataUrl, maxSide, quality)),
  );

  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle("Surat Ukur (SU) - Arsip Digital");
  pdfDoc.setProducer("SU-Scanner");

  for (const ep of encodedPages) {
    const embedded = await pdfDoc.embedJpg(ep.bytes);
    // Normalize longer side to A4 long edge (~841.89 pt) while preserving exact aspect ratio
    const longSidePx = Math.max(ep.width, ep.height);
    const ptScale = 841.89 / Math.max(1, longSidePx);
    const pageWidth = ep.width * ptScale;
    const pageHeight = ep.height * ptScale;

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawImage(embedded, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });
  }

  return pdfDoc.save({ useObjectStreams: true });
}

/**
 * Generates a mixed-orientation multi-page PDF matching each page's natural
 * aspect ratio without cropping edges, with adaptive JPEG compression (FR-12..14).
 */
export async function generateSuPdf(
  pages: PdfPageInput[],
  preset: PdfQualityPreset,
  maxBytesOverride?: number,
): Promise<PdfGenerationResult> {
  if (pages.length === 0) {
    throw new Error("Minimal 1 halaman diperlukan untuk membuat PDF.");
  }

  const config = PRESET_CONFIG[preset];
  const targetMaxBytes = maxBytesOverride
    ? Math.min(config.targetMaxBytes, maxBytesOverride)
    : config.targetMaxBytes;
  const qualitySteps =
    preset === "high"
      ? [config.startQuality, 0.86, 0.78, 0.68, 0.58]
      : [config.startQuality, config.startQuality - 0.1, config.startQuality - 0.18, 0.52];

  let lastBytes: Uint8Array = new Uint8Array();
  let lastQuality = config.startQuality;

  for (const quality of qualitySteps) {
    const q = Math.max(0.45, Math.min(0.92, quality));
    const pdfBytes = await encodePdfDocument(pages, config.maxSide, q);
    lastBytes = pdfBytes;
    lastQuality = q;

    if (pdfBytes.byteLength <= targetMaxBytes) {
      break;
    }
  }

  // Ensure Vercel Serverless 4.5 MB JSON body limit (~3.0 MB binary PDF) is never exceeded
  if (maxBytesOverride && lastBytes.byteLength > maxBytesOverride) {
    lastBytes = await encodePdfDocument(pages, 1350, 0.48);
    lastQuality = 0.48;
  }

  const normalizedBuffer = new Uint8Array(lastBytes).buffer;
  const blob = new Blob([normalizedBuffer], { type: "application/pdf" });

  return {
    bytes: lastBytes,
    blob,
    sizeBytes: lastBytes.byteLength,
    pageCount: pages.length,
    qualityUsed: lastQuality,
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
    link.remove();
    URL.revokeObjectURL(url);
  }, 1500);
}
