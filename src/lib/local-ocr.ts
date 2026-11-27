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
  x0Frac: number;
  x1Frac: number;
  y0Frac: number;
  y1Frac: number;
}

/**
 * Normalizes illumination and boosts crisp ink readability on an HTMLCanvas,
 * suppressing green/yellow ATR/BPN guilloche watermark microtext using Red-weighted
 * ink isolation plus a 28px quiet-zone border for Tesseract LSTM.
 */
function buildEnhancedOcrCanvas(
  sourceImg: HTMLImageElement,
  cropFraction?: { x0?: number; x1?: number; y0?: number; y1?: number },
): EnhancedCanvasMeta {
  const srcW = sourceImg.naturalWidth;
  const srcH = sourceImg.naturalHeight;
  const x0Frac = cropFraction?.x0 ?? 0;
  const x1Frac = cropFraction?.x1 ?? 1;
  const y0Frac = cropFraction?.y0 ?? 0;
  const y1Frac = cropFraction?.y1 ?? 1;
  const sx = Math.round(srcW * x0Frac);
  const sw = Math.max(64, Math.round(srcW * (x1Frac - x0Frac)));
  const sy = Math.round(srcH * y0Frac);
  const sh = Math.max(64, Math.round(srcH * (y1Frac - y0Frac)));

  const longSide = Math.max(sw, sh);
  const scale =
    longSide < 1200
      ? Math.min(1.45, 1400 / Math.max(1, longSide))
      : longSide > 2200
        ? 2200 / longSide
        : 1;
  const workW = Math.max(64, Math.round(sw * scale));
  const workH = Math.max(64, Math.round(sh * scale));

  const workCanvas = document.createElement("canvas");
  workCanvas.width = workW;
  workCanvas.height = workH;
  const workCtx = workCanvas.getContext("2d", { willReadFrequently: true });
  if (!workCtx) {
    return {
      dataUrl: "",
      workW,
      workH,
      pad: 0,
      x0Frac,
      x1Frac,
      y0Frac,
      y1Frac,
    };
  }

  workCtx.imageSmoothingEnabled = true;
  workCtx.imageSmoothingQuality = "high";
  workCtx.fillStyle = "#ffffff";
  workCtx.fillRect(0, 0, workW, workH);
  workCtx.drawImage(sourceImg, sx, sy, sw, sh, 0, 0, workW, workH);

  const imgData = workCtx.getImageData(0, 0, workW, workH);
  const { data } = imgData;

  // Detect yellow/olive ATR/BPN guilloche security paper so green microtext & teal stamps are suppressed
  let chromaSum = 0;
  let chromaCount = 0;
  for (let y = 0; y < workH; y += 12) {
    const row = y * workW;
    for (let x = 0; x < workW; x += 12) {
      const p = (row + x) * 4;
      const rgAvg = (data[p] + data[p + 1]) * 0.5;
      chromaSum += Math.max(0, rgAvg - data[p + 2]);
      chromaCount++;
    }
  }
  const avgYellowChroma = chromaCount > 0 ? chromaSum / chromaCount : 0;
  const isSecurityPaper = avgYellowChroma > 24;

  // For green/yellow security paper, weighting Red strongly keeps dark typewriter/pen ink sharp
  // while pushing green 'BADANPERTANAHANNASIONAL' microtext & green stamps up near paper brightness.
  const measureInkVal = (r: number, g: number, b: number): number =>
    isSecurityPaper
      ? 0.68 * r + 0.24 * g + 0.08 * b
      : 0.299 * r + 0.587 * g + 0.114 * b;

  const block = Math.max(36, Math.round(Math.min(workW, workH) * 0.055));
  const gw = Math.max(4, Math.ceil(workW / block));
  const gh = Math.max(4, Math.ceil(workH / block));
  const rawGrid = new Float32Array(gw * gh);

  for (let by = 0; by < gh; by++) {
    const y0 = by * block;
    const y1 = Math.min(workH, y0 + block);
    for (let bx = 0; bx < gw; bx++) {
      const x0 = bx * block;
      const x1 = Math.min(workW, x0 + block);
      if (isSecurityPaper) {
        const blockSamples: number[] = [];
        for (let y = y0; y < y1; y += 3) {
          const row = y * workW;
          for (let x = x0; x < x1; x += 3) {
            const p = (row + x) * 4;
            blockSamples.push(measureInkVal(data[p], data[p + 1], data[p + 2]));
          }
        }
        blockSamples.sort((a, b) => a - b);
        const p84Idx = Math.max(0, Math.floor((blockSamples.length - 1) * 0.84));
        rawGrid[by * gw + bx] =
          blockSamples.length > 0 ? Math.max(125, blockSamples[p84Idx]) : 185;
      } else {
        let maxVal = 170;
        for (let y = y0; y < y1; y += 3) {
          const row = y * workW;
          for (let x = x0; x < x1; x += 3) {
            const p = (row + x) * 4;
            const v = measureInkVal(data[p], data[p + 1], data[p + 2]);
            if (v > maxVal) maxVal = v;
          }
        }
        rawGrid[by * gw + bx] = maxVal;
      }
    }
  }

  // Smooth/dilate background grid across 3x3 blocks so bold titles or stamps never pull down paper brightness
  const bgGrid = new Float32Array(gw * gh);
  for (let by = 0; by < gh; by++) {
    for (let bx = 0; bx < gw; bx++) {
      let bestBg = rawGrid[by * gw + bx];
      if (isSecurityPaper) {
        for (let ky = Math.max(0, by - 1); ky <= Math.min(gh - 1, by + 1); ky++) {
          for (let kx = Math.max(0, bx - 1); kx <= Math.min(gw - 1, bx + 1); kx++) {
            const nb = rawGrid[ky * gw + kx];
            if (nb > bestBg) bestBg = nb;
          }
        }
      }
      bgGrid[by * gw + bx] = bestBg;
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
      const val = measureInkVal(data[p], data[p + 1], data[p + 2]);
      let norm = (val * 255) / Math.max(isSecurityPaper ? 90 : 85, bg);
      if (isSecurityPaper) {
        // P82 Red-channel normalization wipes green guilloche microtext (>=178) while keeping typewriter ink razor crisp
        norm =
          norm >= 178
            ? 255
            : norm <= 105
              ? 0
              : Math.round(((norm - 105) / 73) * 255);
      } else {
        norm = norm > 208 ? 255 : clamp((norm - 138) * 1.55 + 132, 0, 255);
      }
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
      x0Frac,
      x1Frac,
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
    x0Frac,
    x1Frac,
    y0Frac,
    y1Frac,
  };
}

function buildSmoothOcrCanvas(
  sourceImg: HTMLImageElement,
  cropFraction?: { x0?: number; x1?: number; y0?: number; y1?: number },
): EnhancedCanvasMeta {
  const srcW = sourceImg.naturalWidth;
  const srcH = sourceImg.naturalHeight;
  const x0Frac = cropFraction?.x0 ?? 0;
  const x1Frac = cropFraction?.x1 ?? 1;
  const y0Frac = cropFraction?.y0 ?? 0;
  const y1Frac = cropFraction?.y1 ?? 1;
  const sx = Math.round(srcW * x0Frac);
  const sw = Math.max(64, Math.round(srcW * (x1Frac - x0Frac)));
  const sy = Math.round(srcH * y0Frac);
  const sh = Math.max(64, Math.round(srcH * (y1Frac - y0Frac)));

  const longSide = Math.max(sw, sh);
  const scale =
    longSide < 1200
      ? Math.min(1.45, 1400 / Math.max(1, longSide))
      : longSide > 2200
        ? 2200 / longSide
        : 1;
  const workW = Math.max(64, Math.round(sw * scale));
  const workH = Math.max(64, Math.round(sh * scale));

  const pad = 24;
  const canvas = document.createElement("canvas");
  canvas.width = workW + pad * 2;
  canvas.height = workH + pad * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      dataUrl: "",
      workW,
      workH,
      pad: 0,
      x0Frac,
      x1Frac,
      y0Frac,
      y1Frac,
    };
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if ("filter" in ctx) {
    ctx.filter = "grayscale(1) contrast(1.25)";
  }
  ctx.drawImage(sourceImg, sx, sy, sw, sh, pad, pad, workW, workH);
  if ("filter" in ctx) {
    ctx.filter = "none";
  }

  return {
    dataUrl: canvas.toDataURL("image/png"),
    workW,
    workH,
    pad,
    x0Frac,
    x1Frac,
    y0Frac,
    y1Frac,
  };
}

/**
 * Lightweight 1450px JPEG canvas builder for fast Searchable PDF word bounding box extraction
 * during Google Drive uploads (avoids slow pixel-loop illumination normalization & PNG encoding).
 */
function buildFastSearchableCanvas(
  sourceImg: HTMLImageElement,
): EnhancedCanvasMeta {
  const srcW = sourceImg.naturalWidth;
  const srcH = sourceImg.naturalHeight;
  const longSide = Math.max(srcW, srcH);
  const scale = longSide > 1450 ? 1450 / longSide : 1;
  const workW = Math.max(64, Math.round(srcW * scale));
  const workH = Math.max(64, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = workW;
  canvas.height = workH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      dataUrl: "",
      workW,
      workH,
      pad: 0,
      x0Frac: 0,
      x1Frac: 1,
      y0Frac: 0,
      y1Frac: 1,
    };
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "medium";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, workW, workH);
  if ("filter" in ctx) {
    ctx.filter = "grayscale(1) contrast(1.18)";
  }
  ctx.drawImage(sourceImg, 0, 0, workW, workH);
  if ("filter" in ctx) {
    ctx.filter = "none";
  }

  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.85),
    workW,
    workH,
    pad: 0,
    x0Frac: 0,
    x1Frac: 1,
    y0Frac: 0,
    y1Frac: 1,
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
  const spanX = meta.x1Frac - meta.x0Frac;
  const spanY = meta.y1Frac - meta.y0Frac;

  for (const blk of blocks) {
    for (const para of blk.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const w of line.words ?? []) {
          const text = (w.text || "").trim();
          if (!text || w.confidence < 20) continue;
          const localX0 = clamp((w.bbox.x0 - meta.pad) / meta.workW, 0, 1);
          const localX1 = clamp((w.bbox.x1 - meta.pad) / meta.workW, 0, 1);
          const localY0 = clamp((w.bbox.y0 - meta.pad) / meta.workH, 0, 1);
          const localY1 = clamp((w.bbox.y1 - meta.pad) / meta.workH, 0, 1);
          const x0 = clamp(meta.x0Frac + localX0 * spanX, 0, 1);
          const x1 = clamp(meta.x0Frac + localX1 * spanX, 0, 1);
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
 * Runs deep multi-stage client-side OCR via `tesseract.js` and captures word coordinates
 * so Searchable PDF export is ready immediately.
 * Automatically isolates the right SURAT UKUR panel on 2-page open booklet spreads.
 */
export async function runLocalTesseractOcr(
  imageDataUrl: string,
  onProgress?: (percent: number) => void,
): Promise<LocalOcrOutcome> {
  const { createWorker, PSM } = await import("tesseract.js");
  onProgress?.(5);

  const img = await loadImageElement(imageDataUrl);
  const isWideSpread = img.naturalWidth / Math.max(1, img.naturalHeight) >= 1.24;

  const primaryMeta = isWideSpread
    ? buildSmoothOcrCanvas(img, { x0: 0.45, x1: 1, y0: 0, y1: 0.88 })
    : buildEnhancedOcrCanvas(img, { x0: 0, x1: 1, y0: 0, y1: 0.74 });
  const fullMeta = isWideSpread
    ? buildEnhancedOcrCanvas(img, { x0: 0.45, x1: 1, y0: 0, y1: 0.88 })
    : buildEnhancedOcrCanvas(img);

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

    const primaryRes = await worker.recognize(
      primaryMeta.dataUrl || imageDataUrl,
      undefined,
      { text: true, blocks: true },
    );
    const primaryConf =
      typeof primaryRes.data.confidence === "number"
        ? primaryRes.data.confidence
        : 70;
    const primaryParsed = parseSuratUkurOcrText(
      primaryRes.data.text || "",
      primaryConf,
    );
    let ocrWords = extractNormalizedWordsFromBlocks(
      primaryRes.data.blocks,
      primaryMeta,
    );

    const primaryComplete = Boolean(
      primaryParsed.nomor_su_raw &&
        primaryParsed.tahun_su &&
        primaryParsed.kode_jenis_hak_huruf &&
        primaryParsed.nomor_hak_raw &&
        primaryParsed.kecamatan_raw &&
        primaryParsed.kelurahan_raw,
    );

    let fullPass: {
      result: ReturnType<typeof parseSuratUkurOcrText>;
      meanConfidence: number;
    } | null = null;
    let combinedRawText = primaryRes.data.text || "";

    // Run guilloche-cleaned pass whenever any primary field is still missing
    if (!primaryComplete) {
      onProgress?.(55);
      const fullRes = await worker.recognize(
        fullMeta.dataUrl || imageDataUrl,
        undefined,
        { text: true, blocks: true },
      );
      const fullConf =
        typeof fullRes.data.confidence === "number"
          ? fullRes.data.confidence
          : primaryConf;
      fullPass = {
        result: parseSuratUkurOcrText(fullRes.data.text || "", fullConf),
        meanConfidence: fullConf,
      };
      combinedRawText = `${combinedRawText}\n---FULL---\n${fullRes.data.text || ""}`;
      const fullWords = extractNormalizedWordsFromBlocks(
        fullRes.data.blocks,
        fullMeta,
      );
      if (fullWords.length > 0 && !isWideSpread) {
        ocrWords = fullWords;
      } else if (fullWords.length > 0 && isWideSpread && ocrWords.length < 12) {
        ocrWords = fullWords;
      }
    }

    let mergedOutcome = mergeMultiPassOcrResults(
      { result: primaryParsed, meanConfidence: primaryConf },
      fullPass,
    );

    // Focused high-res sparse pass on top header boxes / SU title block when any key field is still missing
    const stillMissingCritical =
      !mergedOutcome.extraction.nomor_su_raw ||
      !mergedOutcome.extraction.tahun_su ||
      !mergedOutcome.extraction.nomor_hak_raw ||
      !mergedOutcome.extraction.kecamatan_raw ||
      !mergedOutcome.extraction.kelurahan_raw ||
      !mergedOutcome.extraction.nib_terdeteksi;
    if (stillMissingCritical) {
      onProgress?.(82);
      const sparseCrop = isWideSpread
        ? { x0: 0.46, x1: 1, y0: 0.04, y1: 0.62 }
        : { x0: 0, x1: 1, y0: 0, y1: 0.58 };
      const sparseMeta = isWideSpread
        ? buildSmoothOcrCanvas(img, sparseCrop)
        : buildEnhancedOcrCanvas(img, sparseCrop);
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
      });
      const sparseRes = await worker.recognize(
        sparseMeta.dataUrl || primaryMeta.dataUrl || imageDataUrl,
        undefined,
        { text: true },
      );
      const sparseConf =
        typeof sparseRes.data.confidence === "number"
          ? sparseRes.data.confidence
          : mergedOutcome.meanConfidence;
      const sparseParsed = parseSuratUkurOcrText(
        sparseRes.data.text || "",
        sparseConf,
      );
      combinedRawText = `${combinedRawText}\n---SPARSE---\n${sparseRes.data.text || ""}`;
      mergedOutcome = mergeMultiPassOcrResults(
        {
          result: mergedOutcome.extraction,
          meanConfidence: mergedOutcome.meanConfidence,
        },
        { result: sparseParsed, meanConfidence: sparseConf },
      );
    }

    onProgress?.(100);
    const { extraction, meanConfidence: rawMeanConf } = mergedOutcome;
    const processed = applyExtractionToForm(extraction);
    const extractedCount = [
      processed.fields.nomorSu,
      processed.fields.tahunSu,
      processed.fields.nomorHak,
      processed.fields.kecamatan,
      processed.fields.kelurahan,
    ].filter(Boolean).length;
    const meanConfidence =
      extractedCount === 0
        ? Math.min(rawMeanConf, 35)
        : extractedCount <= 2
          ? Math.min(rawMeanConf, 65)
          : rawMeanConf;
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
  const fastMeta = buildFastSearchableCanvas(img);

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
      user_defined_dpi: "200",
    });
    const res = await worker.recognize(
      fastMeta.dataUrl || imageDataUrl,
      undefined,
      { text: true, blocks: true },
    );
    onProgress?.(100);
    return extractNormalizedWordsFromBlocks(res.data.blocks, fastMeta);
  } finally {
    await worker.terminate();
  }
}
