export type ImageQualityStatus =
  | "good"
  | "warn_blur"
  | "warn_glare"
  | "warn_both";

export interface ImageQualityReport {
  status: ImageQualityStatus;
  /** Normalized 0..100 sharpness metric based on document ROI Laplacian variance & high-percentile gradient */
  sharpnessScore: number;
  /** Percentage (0..100) of interior ROI pixels clipped by bright specular glare / reflection */
  glarePercent: number;
  warnings: string[];
}

/**
 * Evaluates document scan sharpness (motion blur) and specular glare (lamp/plastic reflection)
 * directly from RGBA pixels inside the interior document ROI (12%..88% bounds).
 */
export function analyzeRgbaImageQuality(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): ImageQualityReport {
  if (w < 24 || h < 24 || data.length < w * h * 4) {
    return {
      status: "good",
      sharpnessScore: 100,
      glarePercent: 0,
      warnings: [],
    };
  }

  const xStart = Math.max(1, Math.floor(w * 0.12));
  const xEnd = Math.min(w - 2, Math.ceil(w * 0.88));
  const yStart = Math.max(1, Math.floor(h * 0.12));
  const yEnd = Math.min(h - 2, Math.ceil(h * 0.88));
  const stride = Math.max(1, Math.floor(Math.max(w, h) / 360));

  const lumAt = (x: number, y: number): number => {
    const p = (y * w + x) * 4;
    return 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  };

  let lapSum = 0;
  let lapSqSum = 0;
  let strongEdgeCount = 0;
  let sampleCount = 0;
  let glareHotPixels = 0;
  let darkInkPixels = 0;

  for (let y = yStart; y <= yEnd; y += stride) {
    for (let x = xStart; x <= xEnd; x += stride) {
      const p = (y * w + x) * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const c = 0.299 * r + 0.587 * g + 0.114 * b;

      const n = lumAt(x, Math.max(0, y - stride));
      const s = lumAt(x, Math.min(h - 1, y + stride));
      const wl = lumAt(Math.max(0, x - stride), y);
      const e = lumAt(Math.min(w - 1, x + stride), y);

      const lap = 4 * c - n - s - wl - e;
      lapSum += lap;
      lapSqSum += lap * lap;

      const localGrad = Math.max(Math.abs(c - wl), Math.abs(c - n));
      if (localGrad >= 26) {
        strongEdgeCount++;
      }

      if (c < 130) {
        darkInkPixels++;
      }

      // Specular glare signature: washed-out pure white (R,G,B >= 249) surrounded by bright halo,
      // counted separately from normal clean paper white by checking low edge contrast locally
      const isPureClippedWhite = r >= 250 && g >= 250 && b >= 250;
      const isFlatSaturatedBlock =
        isPureClippedWhite &&
        Math.abs(c - wl) <= 2 &&
        Math.abs(c - n) <= 2 &&
        Math.abs(c - e) <= 2;
      if (isFlatSaturatedBlock) {
        glareHotPixels++;
      }

      sampleCount++;
    }
  }

  if (sampleCount === 0) {
    return {
      status: "good",
      sharpnessScore: 100,
      glarePercent: 0,
      warnings: [],
    };
  }

  const meanLap = lapSum / sampleCount;
  const lapVariance = Math.max(0, lapSqSum / sampleCount - meanLap * meanLap);
  const edgeDensity = strongEdgeCount / sampleCount;

  // Map variance + crisp edge density to 0..100 (clean document typically variance > 180)
  const sharpnessScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(Math.min(75, (lapVariance / 220) * 65) + Math.min(25, edgeDensity * 280)),
    ),
  );

  // Only flag glare if photo also looks camera-captured (has midtone/ink variance) rather than pure clean white scan
  const nonWhiteRatio = (sampleCount - glareHotPixels) / sampleCount;
  const rawGlarePct = (glareHotPixels / sampleCount) * 100;
  const hasRealPaperGradient = darkInkPixels / sampleCount > 0.01 && nonWhiteRatio < 0.995;
  const glarePercent = hasRealPaperGradient
    ? Math.round(rawGlarePct * 10) / 10
    : 0;

  const isBlurry = sharpnessScore < 28 && darkInkPixels > 3;
  const hasSevereGlare = glarePercent >= 26 && lapVariance > 25 && darkInkPixels / sampleCount > 0.015;

  const warnings: string[] = [];
  if (isBlurry) {
    warnings.push(
      `Area teks tampak buram/goyang (ketajaman ${sharpnessScore}/100). Disarankan foto ulang dengan tangan stabil agar Nomor SU & Hak terbaca akurat.`,
    );
  }
  if (hasSevereGlare) {
    warnings.push(
      `Terdeteksi area pantulan cahaya terang (${glarePercent}%). Miringkan sedikit kamera atau kurangi pantulan lampu pada plastik warkah.`,
    );
  }

  const status: ImageQualityStatus =
    isBlurry && hasSevereGlare
      ? "warn_both"
      : isBlurry
        ? "warn_blur"
        : hasSevereGlare
          ? "warn_glare"
          : "good";

  return {
    status,
    sharpnessScore,
    glarePercent,
    warnings,
  };
}

export async function analyzeImageDataUrlQuality(
  dataUrl: string,
): Promise<ImageQualityReport> {
  if (typeof document === "undefined" || !dataUrl) {
    return { status: "good", sharpnessScore: 100, glarePercent: 0, warnings: [] };
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxSide = 480;
        const scale = Math.min(
          1,
          maxSide / Math.max(1, img.naturalWidth, img.naturalHeight),
        );
        const w = Math.max(32, Math.round(img.naturalWidth * scale));
        const h = Math.max(32, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve({ status: "good", sharpnessScore: 100, glarePercent: 0, warnings: [] });
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        resolve(analyzeRgbaImageQuality(data, w, h));
      } catch {
        resolve({ status: "good", sharpnessScore: 100, glarePercent: 0, warnings: [] });
      }
    };
    img.onerror = () =>
      resolve({ status: "good", sharpnessScore: 100, glarePercent: 0, warnings: [] });
    img.src = dataUrl;
  });
}
