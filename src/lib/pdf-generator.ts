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
  high: { maxSide: 2300, startQuality: 0.88, targetMaxBytes: 1_900_000 },
  standard: { maxSide: 1800, startQuality: 0.78, targetMaxBytes: 1_450_000 },
  compact: { maxSide: 1400, startQuality: 0.65, targetMaxBytes: 900_000 },
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

/**
 * Generates a mixed-orientation multi-page PDF matching each page's natural
 * aspect ratio without cropping edges, with adaptive JPEG compression (FR-12..14).
 */
export async function generateSuPdf(
  pages: PdfPageInput[],
  preset: PdfQualityPreset,
): Promise<PdfGenerationResult> {
  if (pages.length === 0) {
    throw new Error("Minimal 1 halaman diperlukan untuk membuat PDF.");
  }

  const config = PRESET_CONFIG[preset];
  const qualitySteps =
    preset === "high"
      ? [config.startQuality, 0.8, 0.72]
      : [config.startQuality, config.startQuality - 0.1, config.startQuality - 0.18, 0.52];

  let lastBytes: Uint8Array = new Uint8Array();
  let lastQuality = config.startQuality;

  for (const quality of qualitySteps) {
    const q = Math.max(0.48, Math.min(0.92, quality));
    const encodedPages = await Promise.all(
      pages.map((p) => reencodeJpegBytes(p.dataUrl, config.maxSide, q)),
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

    const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
    lastBytes = pdfBytes;
    lastQuality = q;

    if (pdfBytes.byteLength <= config.targetMaxBytes) {
      break;
    }
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
