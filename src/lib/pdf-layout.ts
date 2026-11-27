import type { OcrWordBox, PdfOrientationMode } from "./su-types.ts";

export type PdfPageRotationDeg = 0 | 90 | -90;

export interface PdfPageMetrics {
  rotationDeg: PdfPageRotationDeg;
  srcScaledW: number;
  srcScaledH: number;
  outW: number;
  outH: number;
  pageWidth: number;
  pageHeight: number;
}

export interface PdfWordPlacement {
  x: number;
  y: number;
  fontSize: number;
  rotateDeg: PdfPageRotationDeg;
}

/**
 * Resolves the 90-degree rotation needed to force portrait inputs into Landscape
 * when a landscape orientation mode is selected.
 */
export function resolvePageRotationForOrientation(
  srcWidth: number,
  srcHeight: number,
  mode: PdfOrientationMode = "landscape-ccw",
): PdfPageRotationDeg {
  if (mode === "auto") return 0;
  if (srcHeight > srcWidth) {
    return mode === "landscape-cw" ? 90 : -90;
  }
  return 0;
}

/**
 * Computes scaled pixel dimensions and final PDF page point dimensions (~A4 long-side 841.89pt)
 * honoring the requested PDF orientation mode.
 */
export function computePdfPageMetrics(
  srcWidth: number,
  srcHeight: number,
  maxSide: number,
  orientationMode: PdfOrientationMode = "landscape-ccw",
): PdfPageMetrics {
  const safeW = Math.max(1, srcWidth);
  const safeH = Math.max(1, srcHeight);
  const scale = Math.min(1, maxSide / Math.max(safeW, safeH));
  const srcScaledW = Math.max(1, Math.round(safeW * scale));
  const srcScaledH = Math.max(1, Math.round(safeH * scale));
  const rotationDeg = resolvePageRotationForOrientation(
    safeW,
    safeH,
    orientationMode,
  );
  const outW = rotationDeg === 0 ? srcScaledW : srcScaledH;
  const outH = rotationDeg === 0 ? srcScaledH : srcScaledW;
  const longSidePx = Math.max(outW, outH);
  const ptScale = 841.89 / Math.max(1, longSidePx);

  return {
    rotationDeg,
    srcScaledW,
    srcScaledH,
    outW,
    outH,
    pageWidth: outW * ptScale,
    pageHeight: outH * ptScale,
  };
}

/**
 * Maps normalized source-image OCR word boxes ([0..1] top-left) onto PDF page coordinates
 * including 90-degree page rotations so Ctrl+F search remains aligned with rotated scans.
 */
export function computeOcrWordPdfPlacement(
  word: OcrWordBox,
  pageWidth: number,
  pageHeight: number,
  rotationDeg: PdfPageRotationDeg,
): PdfWordPlacement {
  const clampVal = (v: number, lo: number, hi: number) =>
    v < lo ? lo : v > hi ? hi : v;

  if (rotationDeg === -90) {
    const boxH = Math.max(4, (word.y1 - word.y0) * pageWidth);
    const fontSize = Math.max(4, Math.min(36, boxH * 0.85));
    return {
      x: clampVal(word.y1 * pageWidth, 2, pageWidth - 4),
      y: clampVal(word.x0 * pageHeight, 2, pageHeight - 4),
      fontSize,
      rotateDeg: 90,
    };
  }

  if (rotationDeg === 90) {
    const boxH = Math.max(4, (word.y1 - word.y0) * pageWidth);
    const fontSize = Math.max(4, Math.min(36, boxH * 0.85));
    return {
      x: clampVal((1 - word.y1) * pageWidth, 2, pageWidth - 4),
      y: clampVal((1 - word.x0) * pageHeight, 2, pageHeight - 4),
      fontSize,
      rotateDeg: -90,
    };
  }

  const boxH = Math.max(4, (word.y1 - word.y0) * pageHeight);
  const fontSize = Math.max(4, Math.min(36, boxH * 0.85));
  return {
    x: clampVal(word.x0 * pageWidth, 0, pageWidth - 4),
    y: clampVal(pageHeight - word.y1 * pageHeight, 2, pageHeight - 4),
    fontSize,
    rotateDeg: 0,
  };
}
