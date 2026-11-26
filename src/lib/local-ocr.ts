import { applyExtractionToForm, type PostProcessedExtraction } from "./su-formatter";
import { loadImageElement } from "./document-scanner";
import {
  mergeMultiPassOcrResults,
  parseSuratUkurOcrText,
} from "./local-ocr-parser";
import type { OcrWordBox } from "./su-types";

export interface LocalOcrOutcome {
  processed: PostProcessedExtraction;
  rawText: string;
  meanConfidence: number;
  ocrWords: OcrWordBox[];
}

function clamp(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val;
}

interface EnhancedCanvasMeta {
  dataUrl: string;
  workW: number;
  workH: number;
  pad: number;
  y0Frac: number;
  y1Frac: number;
}

/**
 * Normalizes illumination and boosts crisp ink readability on an HTMLCanvas,
 * adding a 28px white quiet-zone border so Tesseract LSTM reads edge digits reliably.
 */
function buildEnhancedOcrCanvas(
  sourceImg: HTMLImageElement,
  cropFraction?: { y0: number; y1: number },
): EnhancedCanvasMeta {
  const srcW = sourceImg.naturalWidth;
  const srcH = sourceImg.naturalHeight;
  const y0Frac = cropFraction?.y0 ?? 0;
  const y1Frac = cropFraction?.y1 ?? 1;
  const sy = cropFraction ? Math.round(srcH * y0Frac) : 0;
  const sh = cropFraction
    ? Math.max(64, Math.round(srcH * (y1Frac - y0Frac)))
    : srcH;

  const longSide = Math.max(srcW, sh);
  const scale =
    longSide < 1800
      ? Math.min(2.2, 2000 / Math.max(1, longSide))
      : longSide > 2400
        ? 2400 / longSide
        : 1;
  const workW = Math.max(64, Math.round(srcW * scale));
  const workH = Math.max(64, Math.round(sh * scale));

  const workCanvas = document.createElement("canvas");
  workCanvas.width = workW;
  workCanvas.height = workH;
  const workCtx = workCanvas.getContext("2d", { willReadFrequently: true });
  if (!workCtx) {
    return { dataUrl: "", workW, workH, pad: 0, y0Frac, y1Frac };
  }

  workCtx.imageSmoothingEnabled = true;
  workCtx.imageSmoothingQuality = "high";
  workCtx.fillStyle = "#ffffff";
  workCtx.fillRect(0, 0, workW, workH);
  workCtx.drawImage(sourceImg, 0, sy, srcW, sh, 0, 0, workW, workH);

  const imgData = workCtx.getImageData(0, 0, workW, workH);
  const { data } = imgData;
  const block = 16;
  const gw = Math.max(4, Math.ceil(workW / block));
  const gh = Math.max(4, Math.ceil(workH / block));
  const bgGrid = new Float32Array(gw * gh);

  for (let by = 0; by < gh; by++) {
    const y0 = by * block;
    const y1 = Math.min(workH, y0 + block);
    for (let bx = 0; bx < gw; bx++) {
      const x0 = bx * block;
      const x1 = Math.min(workW, x0 + block);
      let maxLum = 180;
      for (let y = y0; y < y1; y += 3) {
        const row = y * workW;
        for (let x = x0; x < x1; x += 3) {
          const p = (row + x) * 4;
          const l = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
          if (l > maxLum) maxLum = l;
        }
      }
      bgGrid[by * gw + bx] = maxLum;
    }
  }

  for (let y = 0; y < workH; y++) {
    const fy = (y / Math.max(1, workH - 1)) * (gh - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(gh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < workW; x++) {
      const fx = (x / Math.max(1, workW - 1)) * (gw - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(gw - 1, x0 + 1);
      const tx = fx - x0;

      const bg =
        bgGrid[y0 * gw + x0] * (1 - tx) * (1 - ty) +
        bgGrid[y0 * gw + x1] * tx * (1 - ty) +
        bgGrid[y1 * gw + x0] * (1 - tx) * ty +
        bgGrid[y1 * gw + x1] * tx * ty;

      const p = (y * workW + x) * 4;
      const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      let norm = (lum * 255) / Math.max(90, bg);
      norm = norm > 232 ? 255 : clamp((norm - 148) * 1.38 + 148, 0, 255);
      data[p] = norm;
      data[p + 1] = norm;
      data[p + 2] = norm;
    }
  }
  workCtx.putImageData(imgData, 0, 0);

  const pad = 28;
  const outCanvas = document.createElement("canvas");
  outCanvas.width = workW + pad * 2;
  outCanvas.height = workH + pad * 2;
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) {
    return {
      dataUrl: workCanvas.toDataURL("image/png"),
      workW,
      workH,
      pad: 0,
      y0Frac,
      y1Frac,
    };
  }
  outCtx.fillStyle = "#ffffff";
  outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);
  outCtx.drawImage(workCanvas, pad, pad);

  return {
    dataUrl: outCanvas.toDataURL("image/png"),
    workW,
    workH,
    pad,
    y0Frac,
    y1Frac,
  };
}

function extractNormalizedWordsFromBlocks(
  blocks: Array<{
    paragraphs?: Array<{
      lines?: Array<{
        words?: Array<{
          text: string;
          confidence: number;
          bbox: { x0: number; y0: number; x1: number; y1: number };
        }>;
      }>;
    }>;
  }> | null,
  meta: EnhancedCanvasMeta,
): OcrWordBox[] {
  if (!blocks || meta.workW <= 0 || meta.workH <= 0) return [];
  const words: OcrWordBox[] = [];
  const spanY = meta.y1Frac - meta.y0Frac;

  for (const blk of blocks) {
    for (const para of blk.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const w of line.words ?? []) {
          const text = (w.text || "").trim();
          if (!text || w.confidence < 20) continue;
          const x0 = clamp((w.bbox.x0 - meta.pad) / meta.workW, 0, 1);
          const x1 = clamp((w.bbox.x1 - meta.pad) / meta.workW, 0, 1);
          const localY0 = clamp((w.bbox.y0 - meta.pad) / meta.workH, 0, 1);
          const localY1 = clamp((w.bbox.y1 - meta.pad) / meta.workH, 0, 1);
          const y0 = clamp(meta.y0Frac + localY0 * spanY, 0, 1);
          const y1 = clamp(meta.y0Frac + localY1 * spanY, 0, 1);
          if (x1 > x0 && y1 > y0) {
            words.push({ text, x0, y0, x1, y1 });
          }
        }
      }
    }
  }
  return words;
}

/**
 * Runs deep 2-stage client-side OCR via `tesseract.js` and captures word coordinates
 * so Searchable PDF export is ready immediately.
 */
export async function runLocalTesseractOcr(
  imageDataUrl: string,
  onProgress?: (percent: number) => void,
): Promise<LocalOcrOutcome> {
  const { createWorker, PSM } = await import("tesseract.js");
  onProgress?.(5);

  const img = await loadImageElement(imageDataUrl);
  const headerMeta = buildEnhancedOcrCanvas(img, { y0: 0, y1: 0.62 });
  const fullMeta = buildEnhancedOcrCanvas(img);

  const worker = await createWorker("ind", 1, {
    logger: (msg) => {
      if (msg.status === "recognizing text" && typeof msg.progress === "number") {
        onProgress?.(Math.min(95, Math.max(15, Math.round(15 + msg.progress * 45))));
      } else if (msg.status === "loading language traineddata") {
        onProgress?.(10);
      }
    },
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });

    const headerRes = await worker.recognize(
      headerMeta.dataUrl || imageDataUrl,
      undefined,
      { text: true, blocks: true },
    );
    const headerConf =
      typeof headerRes.data.confidence === "number"
        ? headerRes.data.confidence
        : 72;
    const headerParsed = parseSuratUkurOcrText(
      headerRes.data.text || "",
      headerConf,
    );
    let ocrWords = extractNormalizedWordsFromBlocks(
      headerRes.data.blocks,
      headerMeta,
    );

    const headerComplete = Boolean(
      headerParsed.nomor_su_raw &&
        headerParsed.tahun_su &&
        headerParsed.kode_jenis_hak_huruf &&
        headerParsed.nomor_hak_raw &&
        headerParsed.kecamatan_raw,
    );

    let fullPass: {
      result: ReturnType<typeof parseSuratUkurOcrText>;
      meanConfidence: number;
    } | null = null;
    let combinedRawText = headerRes.data.text || "";

    if (!headerComplete) {
      onProgress?.(65);
      const fullRes = await worker.recognize(
        fullMeta.dataUrl || imageDataUrl,
        { rotateAuto: true },
        { text: true, blocks: true },
      );
      const fullConf =
        typeof fullRes.data.confidence === "number"
          ? fullRes.data.confidence
          : headerConf;
      fullPass = {
        result: parseSuratUkurOcrText(fullRes.data.text || "", fullConf),
        meanConfidence: fullConf,
      };
      combinedRawText = `${combinedRawText}\n---FULL---\n${fullRes.data.text || ""}`;
      const fullWords = extractNormalizedWordsFromBlocks(
        fullRes.data.blocks,
        fullMeta,
      );
      if (fullWords.length > 0) {
        ocrWords = fullWords;
      }
    }

    onProgress?.(100);
    const { extraction, meanConfidence } = mergeMultiPassOcrResults(
      { result: headerParsed, meanConfidence: headerConf },
      fullPass,
    );
    const processed = applyExtractionToForm(extraction);
    return { processed, rawText: combinedRawText, meanConfidence, ocrWords };
  } finally {
    await worker.terminate();
  }
}

/**
 * Generates normalized OCR word bounding boxes on-demand for any scanned page
 * (e.g., when fields were read by Gemini Vision) so PDFs remain Ctrl+F searchable.
 */
export async function extractSearchableOcrWords(
  imageDataUrl: string,
  onProgress?: (percent: number) => void,
): Promise<OcrWordBox[]> {
  const { createWorker, PSM } = await import("tesseract.js");
  onProgress?.(10);
  const img = await loadImageElement(imageDataUrl);
  const fullMeta = buildEnhancedOcrCanvas(img);

  const worker = await createWorker("ind", 1, {
    logger: (msg) => {
      if (msg.status === "recognizing text" && typeof msg.progress === "number") {
        onProgress?.(Math.min(95, Math.max(20, Math.round(20 + msg.progress * 75))));
      }
    },
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });
    const res = await worker.recognize(
      fullMeta.dataUrl || imageDataUrl,
      undefined,
      { text: true, blocks: true },
    );
    onProgress?.(100);
    return extractNormalizedWordsFromBlocks(res.data.blocks, fullMeta);
  } finally {
    await worker.terminate();
  }
}
