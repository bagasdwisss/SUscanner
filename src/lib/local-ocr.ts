import { applyExtractionToForm, type PostProcessedExtraction } from "./su-formatter";
import { loadImageElement } from "./document-scanner";
import {
  mergeMultiPassOcrResults,
  parseSuratUkurOcrText,
} from "./local-ocr-parser";

export interface LocalOcrOutcome {
  processed: PostProcessedExtraction;
  rawText: string;
  meanConfidence: number;
}

function clamp(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val;
}

/**
 * Normalizes illumination and boosts crisp ink readability on an HTMLCanvas,
 * adding a 28px white quiet-zone border so Tesseract LSTM reads edge digits reliably.
 */
function buildEnhancedOcrCanvas(
  sourceImg: HTMLImageElement,
  cropFraction?: { y0: number; y1: number },
): string {
  const srcW = sourceImg.naturalWidth;
  const srcH = sourceImg.naturalHeight;
  const sy = cropFraction ? Math.round(srcH * cropFraction.y0) : 0;
  const sh = cropFraction
    ? Math.max(64, Math.round(srcH * (cropFraction.y1 - cropFraction.y0)))
    : srcH;

  // Upscale small images so dot-matrix / typewriter fonts have crisp stroke height
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
  if (!workCtx) return "";

  workCtx.imageSmoothingEnabled = true;
  workCtx.imageSmoothingQuality = "high";
  workCtx.fillStyle = "#ffffff";
  workCtx.fillRect(0, 0, workW, workH);
  workCtx.drawImage(sourceImg, 0, sy, srcW, sh, 0, 0, workW, workH);

  // Coarse 16x16 illumination flattening + gentle ink sharpening
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

  // Add 28px white quiet-zone padding around canvas
  const pad = 28;
  const outCanvas = document.createElement("canvas");
  outCanvas.width = workW + pad * 2;
  outCanvas.height = workH + pad * 2;
  const outCtx = outCanvas.getContext("2d");
  if (!outCtx) return workCanvas.toDataURL("image/png");
  outCtx.fillStyle = "#ffffff";
  outCtx.fillRect(0, 0, outCanvas.width, outCanvas.height);
  outCtx.drawImage(workCanvas, pad, pad);
  return outCanvas.toDataURL("image/png");
}

/**
 * Runs deep 2-stage client-side OCR via `tesseract.js`:
 * Pass 1 scans the clean padded top identity header region (immune to bottom map clutter);
 * Pass 2 only runs on the full padded sheet if any field is still missing.
 */
export async function runLocalTesseractOcr(
  imageDataUrl: string,
  onProgress?: (percent: number) => void,
): Promise<LocalOcrOutcome> {
  const { createWorker, PSM } = await import("tesseract.js");
  onProgress?.(5);

  const img = await loadImageElement(imageDataUrl);
  const headerCropUrl = buildEnhancedOcrCanvas(img, { y0: 0, y1: 0.62 });
  const fullPaddedUrl = buildEnhancedOcrCanvas(img);

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

    const headerRes = await worker.recognize(headerCropUrl || imageDataUrl);
    const headerConf =
      typeof headerRes.data.confidence === "number"
        ? headerRes.data.confidence
        : 72;
    const headerParsed = parseSuratUkurOcrText(
      headerRes.data.text || "",
      headerConf,
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
        fullPaddedUrl || imageDataUrl,
        { rotateAuto: true },
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
    }

    onProgress?.(100);
    const { extraction, meanConfidence } = mergeMultiPassOcrResults(
      { result: headerParsed, meanConfidence: headerConf },
      fullPass,
    );
    const processed = applyExtractionToForm(extraction);
    return { processed, rawText: combinedRawText, meanConfidence };
  } finally {
    await worker.terminate();
  }
}
