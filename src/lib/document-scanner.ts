import type { NormalizedPoint, QuadCorners, ScanFilter } from "./su-types";

export const FULL_FRAME_CORNERS: QuadCorners = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

export function cloneCorners(corners: QuadCorners): QuadCorners {
  return [
    { x: corners[0].x, y: corners[0].y },
    { x: corners[1].x, y: corners[1].y },
    { x: corners[2].x, y: corners[2].y },
    { x: corners[3].x, y: corners[3].y },
  ];
}

function clamp(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val;
}

export function isHeicFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return (
    type === "image/heic" ||
    type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

/**
 * Loads an image Blob/URL into an HTMLImageElement cleanly.
 */
export function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Gagal memuat file gambar ke kanvas browser."));
    img.src = src;
  });
}

/**
 * Draws an uploaded File (JPG/PNG/WebP/HEIC) with EXIF orientation applied
 * and returns a normalized Object URL + pixel dimensions.
 */
export async function normalizeUploadedImage(file: File): Promise<{
  rawUrl: string;
  rawWidth: number;
  rawHeight: number;
  mimeType: string;
}> {
  let sourceBlob: Blob = file;
  let mimeType = file.type || "image/jpeg";

  if (isHeicFile(file)) {
    const { heicTo } = await import("heic-to");
    const converted = await heicTo({
      blob: file,
      type: "image/jpeg",
      quality: 0.92,
    });
    sourceBlob = converted;
    mimeType = "image/jpeg";
  }

  const MAX_SOURCE_SIDE = 2600;

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(sourceBlob, {
        imageOrientation: "from-image",
      });
      try {
        const scale = Math.min(
          1,
          MAX_SOURCE_SIDE / Math.max(bitmap.width, bitmap.height),
        );
        const w = Math.max(1, Math.round(bitmap.width * scale));
        const h = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("Kanvas 2D tidak didukung browser.");
        }
        ctx.drawImage(bitmap, 0, 0, w, h);
        const outBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) =>
              b
                ? resolve(b)
                : reject(new Error("Gagal mengonversi gambar sumber.")),
            "image/jpeg",
            0.94,
          );
        });
        return {
          rawUrl: URL.createObjectURL(outBlob),
          rawWidth: w,
          rawHeight: h,
          mimeType,
        };
      } finally {
        bitmap.close();
      }
    } catch {
      // Fall back to <img> loading below
    }
  }

  const tempUrl = URL.createObjectURL(sourceBlob);
  try {
    const img = await loadImageElement(tempUrl);
    const scale = Math.min(
      1,
      MAX_SOURCE_SIDE / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Kanvas 2D tidak didukung browser.");
    }
    ctx.drawImage(img, 0, 0, w, h);
    const outBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Gagal mengonversi gambar sumber.")),
        "image/jpeg",
        0.94,
      );
    });
    return {
      rawUrl: URL.createObjectURL(outBlob),
      rawWidth: w,
      rawHeight: h,
      mimeType,
    };
  } finally {
    URL.revokeObjectURL(tempUrl);
  }
}

/**
 * Renders the raw image with the requested clockwise rotation onto a canvas.
 */
export async function renderRotatedCanvas(
  rawUrl: string,
  rotation: 0 | 90 | 180 | 270,
): Promise<HTMLCanvasElement> {
  const img = await loadImageElement(rawUrl);
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  const isQuarter = rotation === 90 || rotation === 270;
  const outW = isQuarter ? srcH : srcW;
  const outH = isQuarter ? srcW : srcH;

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Kanvas 2D tidak tersedia.");

  ctx.save();
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(img, -srcW / 2, -srcH / 2);
  ctx.restore();
  return canvas;
}

/**
 * Rotates normalized quad corners clockwise or counter-clockwise when image rotates.
 */
export function rotateCorners(
  corners: QuadCorners,
  deltaDeg: 90 | -90,
): QuadCorners {
  const transformed = corners.map((p) =>
    deltaDeg === 90
      ? { x: clamp(1 - p.y, 0, 1), y: clamp(p.x, 0, 1) }
      : { x: clamp(p.y, 0, 1), y: clamp(1 - p.x, 0, 1) },
  );
  return orderCornersClockwise(transformed);
}

/**
 * Orders 4 arbitrary 2D points into [topLeft, topRight, bottomRight, bottomLeft].
 */
export function orderCornersClockwise(pts: NormalizedPoint[]): QuadCorners {
  if (pts.length !== 4) return cloneCorners(FULL_FRAME_CORNERS);

  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const tl = bySum[0];
  const br = bySum[3];
  const remaining = [bySum[1], bySum[2]].sort(
    (a, b) => a.y - a.x - (b.y - b.x),
  );
  const tr = remaining[0];
  const bl = remaining[1];

  return [tl, tr, br, bl];
}

function triangleArea(
  a: NormalizedPoint,
  b: NormalizedPoint,
  c: NormalizedPoint,
): number {
  return Math.abs(
    0.5 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)),
  );
}

function quadArea(q: QuadCorners): number {
  return (
    triangleArea(q[0], q[1], q[2]) + triangleArea(q[0], q[2], q[3])
  );
}

function cross(
  o: NormalizedPoint,
  a: NormalizedPoint,
  b: NormalizedPoint,
): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function convexHull(points: NormalizedPoint[]): NormalizedPoint[] {
  if (points.length <= 3) return points;
  const sorted = [...points].sort((a, b) =>
    a.x === b.x ? a.y - b.y : a.x - b.x,
  );
  const lower: NormalizedPoint[] = [];
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: NormalizedPoint[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Simplifies a convex polygon down to 4 vertices by iteratively dropping
 * the vertex whose removal minimizes lost polygon area.
 */
function reduceHullToQuad(hull: NormalizedPoint[]): QuadCorners | null {
  if (hull.length < 4) return null;
  const poly = [...hull];
  while (poly.length > 4) {
    let minArea = Infinity;
    let removeIdx = 0;
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const prev = poly[(i - 1 + n) % n];
      const curr = poly[i];
      const next = poly[(i + 1) % n];
      const loss = triangleArea(prev, curr, next);
      if (loss < minArea) {
        minArea = loss;
        removeIdx = i;
      }
    }
    poly.splice(removeIdx, 1);
  }
  return orderCornersClockwise(poly);
}

function cornerAnglesValid(q: QuadCorners): boolean {
  for (let i = 0; i < 4; i++) {
    const p0 = q[(i + 3) % 4];
    const p1 = q[i];
    const p2 = q[(i + 1) % 4];
    const v1x = p0.x - p1.x;
    const v1y = p0.y - p1.y;
    const v2x = p2.x - p1.x;
    const v2y = p2.y - p1.y;
    const len1 = Math.hypot(v1x, v1y);
    const len2 = Math.hypot(v2x, v2y);
    if (len1 < 0.08 || len2 < 0.08) return false;
    const cosTheta = clamp((v1x * v2x + v1y * v2y) / (len1 * len2), -1, 1);
    const deg = (Math.acos(cosTheta) * 180) / Math.PI;
    if (deg < 35 || deg > 148) return false;
  }
  return true;
}

/**
 * Automatic paper boundary detector using dual-strategy edge-contour +
 * paper-luminance segmentation on a fast downscaled canvas.
 */
export function detectPaperCornersFromCanvas(sourceCanvas: HTMLCanvasElement): {
  corners: QuadCorners;
  detected: boolean;
} {
  const MAX_WORK = 320;
  const scale = Math.min(
    1,
    MAX_WORK / Math.max(sourceCanvas.width, sourceCanvas.height),
  );
  const w = Math.max(32, Math.round(sourceCanvas.width * scale));
  const h = Math.max(32, Math.round(sourceCanvas.height * scale));

  const workCanvas = document.createElement("canvas");
  workCanvas.width = w;
  workCanvas.height = h;
  const ctx = workCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { corners: cloneCorners(FULL_FRAME_CORNERS), detected: false };

  ctx.drawImage(sourceCanvas, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const n = w * h;
  const lum = new Float32Array(n);
  const chroma = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    chroma[i] = Math.max(r, g, b) - Math.min(r, g, b);
  }

  // Check if image borders are already mostly bright low-chroma paper
  let borderPaperCount = 0;
  let borderTotal = 0;
  let borderLumSum = 0;
  const margin = 4;
  for (let x = 0; x < w; x++) {
    for (const y of [margin, h - 1 - margin]) {
      const idx = y * w + x;
      borderTotal++;
      borderLumSum += lum[idx];
      if (lum[idx] > 155 && chroma[idx] < 45) borderPaperCount++;
    }
  }
  for (let y = margin; y < h - margin; y++) {
    for (const x of [margin, w - 1 - margin]) {
      const idx = y * w + x;
      borderTotal++;
      borderLumSum += lum[idx];
      if (lum[idx] > 155 && chroma[idx] < 45) borderPaperCount++;
    }
  }

  if (borderTotal > 0 && borderPaperCount / borderTotal > 0.78) {
    return { corners: cloneCorners(FULL_FRAME_CORNERS), detected: false };
  }

  // 3x3 Gaussian blur on luminance
  const blurred = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      blurred[i] =
        (lum[i - w - 1] +
          2 * lum[i - w] +
          lum[i - w + 1] +
          2 * lum[i - 1] +
          4 * lum[i] +
          2 * lum[i + 1] +
          lum[i + w - 1] +
          2 * lum[i + w] +
          lum[i + w + 1]) /
        16;
    }
  }

  // Sobel gradient magnitude
  const grad = new Float32Array(n);
  let maxGrad = 1;
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      const gx =
        -blurred[i - w - 1] +
        blurred[i - w + 1] -
        2 * blurred[i - 1] +
        2 * blurred[i + 1] -
        blurred[i + w - 1] +
        blurred[i + w + 1];
      const gy =
        -blurred[i - w - 1] -
        2 * blurred[i - w] -
        blurred[i - w + 1] +
        blurred[i + w - 1] +
        2 * blurred[i + w] +
        blurred[i + w + 1];
      const mag = Math.abs(gx) + Math.abs(gy);
      grad[i] = mag;
      if (mag > maxGrad) maxGrad = mag;
    }
  }

  // Compute paper-vs-background threshold
  const borderMean = borderTotal > 0 ? borderLumSum / borderTotal : 100;
  let centerLumSum = 0;
  let centerCount = 0;
  const cxStart = Math.floor(w * 0.25);
  const cxEnd = Math.floor(w * 0.75);
  const cyStart = Math.floor(h * 0.25);
  const cyEnd = Math.floor(h * 0.75);
  for (let y = cyStart; y < cyEnd; y++) {
    for (let x = cxStart; x < cxEnd; x++) {
      const idx = y * w + x;
      centerLumSum += lum[idx];
      centerCount++;
    }
  }
  const centerMean = centerCount > 0 ? centerLumSum / centerCount : 180;

  const candidates: QuadCorners[] = [];

  // Strategy A: Paper brightness + low-chroma foreground mask
  if (centerMean > borderMean + 12) {
    const paperThresh = borderMean + (centerMean - borderMean) * 0.42;
    const fg = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (lum[i] > paperThresh && chroma[i] < 65) {
        fg[i] = 1;
      }
    }
    const largest = findLargestComponentPoints(fg, w, h);
    if (largest.length >= 20) {
      const hull = convexHull(
        largest.map((p) => ({ x: p.x / (w - 1), y: p.y / (h - 1) })),
      );
      const quad = reduceHullToQuad(hull);
      if (quad) candidates.push(quad);
    }
  }

  // Strategy B: Strong Sobel outer boundary component
  const edgeThresh = Math.max(48, maxGrad * 0.18);
  const edgeMask = new Uint8Array(n);
  for (let y = 2; y < h - 2; y++) {
    const row = y * w;
    for (let x = 2; x < w - 2; x++) {
      const i = row + x;
      if (grad[i] >= edgeThresh) {
        edgeMask[i] = 1;
        edgeMask[i + 1] = 1;
        edgeMask[i + w] = 1;
      }
    }
  }
  const largestEdge = findLargestComponentPoints(edgeMask, w, h);
  if (largestEdge.length >= 24) {
    const hull = convexHull(
      largestEdge.map((p) => ({ x: p.x / (w - 1), y: p.y / (h - 1) })),
    );
    const quad = reduceHullToQuad(hull);
    if (quad) candidates.push(quad);
  }

  let bestQuad: QuadCorners | null = null;
  let bestScore = -1;

  for (const q of candidates) {
    const area = quadArea(q);
    if (area < 0.18 || area > 0.96) continue;
    if (!cornerAnglesValid(q)) continue;

    // Score edge support along the 4 edges of the candidate quad
    let edgeSupport = 0;
    const stepsPerEdge = 36;
    for (let e = 0; e < 4; e++) {
      const a = q[e];
      const b = q[(e + 1) % 4];
      for (let s = 1; s < stepsPerEdge; s++) {
        const t = s / stepsPerEdge;
        const px = Math.round((a.x + (b.x - a.x) * t) * (w - 1));
        const py = Math.round((a.y + (b.y - a.y) * t) * (h - 1));
        let localMax = 0;
        for (let dy = -2; dy <= 2; dy++) {
          const yy = clamp(py + dy, 0, h - 1);
          for (let dx = -2; dx <= 2; dx++) {
            const xx = clamp(px + dx, 0, w - 1);
            const gVal = grad[yy * w + xx];
            if (gVal > localMax) localMax = gVal;
          }
        }
        edgeSupport += Math.min(1, localMax / Math.max(edgeThresh, 1));
      }
    }
    const normalizedEdge = edgeSupport / (4 * (stepsPerEdge - 1));
    const score = normalizedEdge * 0.65 + area * 0.35;
    if (normalizedEdge >= 0.32 && score > bestScore) {
      bestScore = score;
      bestQuad = q;
    }
  }

  if (!bestQuad) {
    return { corners: cloneCorners(FULL_FRAME_CORNERS), detected: false };
  }

  return { corners: bestQuad, detected: true };
}

function findLargestComponentPoints(
  mask: Uint8Array,
  w: number,
  h: number,
): Array<{ x: number; y: number }> {
  const n = w * h;
  const visited = new Uint8Array(n);
  const queue = new Int32Array(n);
  let bestPoints: Array<{ x: number; y: number }> = [];

  for (let start = 0; start < n; start++) {
    if (mask[start] === 0 || visited[start] === 1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    const pts: Array<{ x: number; y: number }> = [];
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;

    while (head < tail) {
      const idx = queue[head++];
      const y = Math.floor(idx / w);
      const x = idx - y * w;
      pts.push({ x, y });
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        const row = ny * w;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const nIdx = row + nx;
          if (mask[nIdx] === 1 && visited[nIdx] === 0) {
            visited[nIdx] = 1;
            queue[tail++] = nIdx;
          }
        }
      }
    }

    const spanW = (maxX - minX) / w;
    const spanH = (maxY - minY) / h;
    if (spanW > 0.25 && spanH > 0.25 && pts.length > bestPoints.length) {
      bestPoints = pts;
    }
  }

  return bestPoints;
}

/**
 * Solves an 8x8 linear system Ax = b via Gaussian elimination with partial pivoting
 * to find the inverse projective homography mapping destination (u,v) -> source (x,y).
 */
function solveInverseHomography(
  dstW: number,
  dstH: number,
  srcCorners: [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ],
): Float64Array {
  const dst = [
    { x: 0, y: 0 },
    { x: dstW - 1, y: 0 },
    { x: dstW - 1, y: dstH - 1 },
    { x: 0, y: dstH - 1 },
  ];

  // Build 8x9 augmented matrix
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const u = dst[i].x;
    const v = dst[i].y;
    const x = srcCorners[i].x;
    const y = srcCorners[i].y;
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
  }

  for (let col = 0; col < 8; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(A[col][col]);
    for (let r = col + 1; r < 8; r++) {
      const val = Math.abs(A[r][col]);
      if (val > maxVal) {
        maxVal = val;
        pivotRow = r;
      }
    }
    if (pivotRow !== col) {
      const tmp = A[col];
      A[col] = A[pivotRow];
      A[pivotRow] = tmp;
    }
    const pivot = A[col][col] || 1e-12;
    for (let j = col; j <= 8; j++) {
      A[col][j] /= pivot;
    }
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const factor = A[r][col];
      if (factor === 0) continue;
      for (let j = col; j <= 8; j++) {
        A[r][j] -= factor * A[col][j];
      }
    }
  }

  const h = new Float64Array(9);
  for (let i = 0; i < 8; i++) h[i] = A[i][8];
  h[8] = 1;
  return h;
}

/**
 * Estimates smooth local background paper illumination via 8x downsampled max+blur
 * so uneven lighting/shadows are removed cleanly while preserving colored BPN stamps.
 */
function computeLocalPaperBackground(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): { bgR: Float32Array; bgG: Float32Array; bgB: Float32Array; dw: number; dh: number } {
  const step = 8;
  const dw = Math.max(8, Math.ceil(w / step));
  const dh = Math.max(8, Math.ceil(h / step));
  const len = dw * dh;

  const maxR = new Float32Array(len);
  const maxG = new Float32Array(len);
  const maxB = new Float32Array(len);

  for (let dy = 0; dy < dh; dy++) {
    const sy0 = dy * step;
    const sy1 = Math.min(h, sy0 + step);
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = dx * step;
      const sx1 = Math.min(w, sx0 + step);
      let bestLum = -1;
      let br = 240;
      let bg = 240;
      let bb = 240;
      for (let sy = sy0; sy < sy1; sy += 2) {
        const row = sy * w;
        for (let sx = sx0; sx < sx1; sx += 2) {
          const p = (row + sx) * 4;
          const r = data[p];
          const g = data[p + 1];
          const b = data[p + 2];
          const l = 0.299 * r + 0.587 * g + 0.114 * b;
          if (l > bestLum) {
            bestLum = l;
            br = r;
            bg = g;
            bb = b;
          }
        }
      }
      const dIdx = dy * dw + dx;
      maxR[dIdx] = br;
      maxG[dIdx] = bg;
      maxB[dIdx] = bb;
    }
  }

  // Dilate local max over 3x3 blocks to span over dense stamps/paragraphs
  const dilR = new Float32Array(len);
  const dilG = new Float32Array(len);
  const dilB = new Float32Array(len);
  const radius = Math.max(2, Math.min(6, Math.round(Math.min(dw, dh) * 0.03)));

  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      let bestL = -1;
      let rr = 245;
      let gg = 245;
      let bb = 245;
      for (let ky = Math.max(0, y - radius); ky <= Math.min(dh - 1, y + radius); ky++) {
        for (let kx = Math.max(0, x - radius); kx <= Math.min(dw - 1, x + radius); kx++) {
          const idx = ky * dw + kx;
          const l = 0.299 * maxR[idx] + 0.587 * maxG[idx] + 0.114 * maxB[idx];
          if (l > bestL) {
            bestL = l;
            rr = maxR[idx];
            gg = maxG[idx];
            bb = maxB[idx];
          }
        }
      }
      const outIdx = y * dw + x;
      dilR[outIdx] = rr;
      dilG[outIdx] = gg;
      dilB[outIdx] = bb;
    }
  }

  // Separable 5x5 average smooth
  const bgR = boxBlur2D(dilR, dw, dh, 2);
  const bgG = boxBlur2D(dilG, dw, dh, 2);
  const bgB = boxBlur2D(dilB, dw, dh, 2);

  return { bgR, bgG, bgB, dw, dh };
}

function boxBlur2D(
  src: Float32Array,
  w: number,
  h: number,
  r: number,
): Float32Array {
  const tmp = new Float32Array(w * h);
  const dst = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let cnt = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) {
        sum += src[row + k];
        cnt++;
      }
      tmp[row + x] = sum / cnt;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let cnt = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) {
        sum += tmp[k * w + x];
        cnt++;
      }
      dst[y * w + x] = sum / cnt;
    }
  }
  return dst;
}

function applyDocumentFilterInPlace(
  imageData: ImageData,
  filter: ScanFilter,
  brightness: number,
  contrast: number,
): void {
  const { data, width: w, height: h } = imageData;
  const totalPixels = w * h;

  if (filter === "magic" || filter === "grayscale" || filter === "bw") {
    const { bgR, bgG, bgB, dw, dh } = computeLocalPaperBackground(data, w, h);

    for (let y = 0; y < h; y++) {
      const fy = (y / Math.max(1, h - 1)) * (dh - 1);
      const y0 = Math.floor(fy);
      const y1 = Math.min(dh - 1, y0 + 1);
      const ty = fy - y0;

      for (let x = 0; x < w; x++) {
        const fx = (x / Math.max(1, w - 1)) * (dw - 1);
        const x0 = Math.floor(fx);
        const x1 = Math.min(dw - 1, x0 + 1);
        const tx = fx - x0;

        const i00 = y0 * dw + x0;
        const i10 = y0 * dw + x1;
        const i01 = y1 * dw + x0;
        const i11 = y1 * dw + x1;

        const w00 = (1 - tx) * (1 - ty);
        const w10 = tx * (1 - ty);
        const w01 = (1 - tx) * ty;
        const w11 = tx * ty;

        const lr = Math.max(
          70,
          bgR[i00] * w00 + bgR[i10] * w10 + bgR[i01] * w01 + bgR[i11] * w11,
        );
        const lg = Math.max(
          70,
          bgG[i00] * w00 + bgG[i10] * w10 + bgG[i01] * w01 + bgG[i11] * w11,
        );
        const lb = Math.max(
          70,
          bgB[i00] * w00 + bgB[i10] * w10 + bgB[i01] * w01 + bgB[i11] * w11,
        );

        const p = (y * w + x) * 4;
        // Shadow-flattened normalized channels
        let nr = (data[p] * 255) / lr;
        let ng = (data[p + 1] * 255) / lg;
        let nb = (data[p + 2] * 255) / lb;

        if (filter === "magic") {
          const lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
          const chroma = Math.max(nr, ng, nb) - Math.min(nr, ng, nb);

          if (lum > 224 && chroma < 26) {
            // Smoothly snap paper background to pure bright white
            nr = 255;
            ng = 255;
            nb = 255;
          } else {
            // Boost colored stamp saturation & darken ink contrast slightly
            const boost = 1.22;
            const satBoost = chroma > 18 ? 1.28 : 1.0;
            const mean = (nr + ng + nb) / 3;
            nr = mean + (nr - mean) * satBoost;
            ng = mean + (ng - mean) * satBoost;
            nb = mean + (nb - mean) * satBoost;
            nr = (nr - 145) * boost + 145;
            ng = (ng - 145) * boost + 145;
            nb = (nb - 145) * boost + 145;
          }
          data[p] = clamp(nr, 0, 255);
          data[p + 1] = clamp(ng, 0, 255);
          data[p + 2] = clamp(nb, 0, 255);
        } else if (filter === "grayscale") {
          let lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
          if (lum > 222) {
            lum = 255;
          } else {
            lum = clamp((lum - 140) * 1.25 + 140, 0, 255);
          }
          data[p] = lum;
          data[p + 1] = lum;
          data[p + 2] = lum;
        } else {
          // B&W Crisp: soft anti-aliased high-contrast threshold against flattened paper
          const lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
          const low = 148;
          const high = 196;
          let bw: number;
          if (lum <= low) bw = 0;
          else if (lum >= high) bw = 255;
          else bw = Math.round(((lum - low) / (high - low)) * 255);
          data[p] = bw;
          data[p + 1] = bw;
          data[p + 2] = bw;
        }
      }
    }
  }

  // Apply manual Brightness & Contrast sliders if non-zero
  if (brightness !== 0 || contrast !== 0) {
    const bOffset = brightness * 1.8;
    const cVal = contrast * 2.1;
    const cFactor = (259 * (cVal + 255)) / (255 * (259 - cVal));

    for (let i = 0; i < totalPixels; i++) {
      const p = i * 4;
      data[p] = clamp(cFactor * (data[p] + bOffset - 128) + 128, 0, 255);
      data[p + 1] = clamp(
        cFactor * (data[p + 1] + bOffset - 128) + 128,
        0,
        255,
      );
      data[p + 2] = clamp(
        cFactor * (data[p + 2] + bOffset - 128) + 128,
        0,
        255,
      );
    }
  }
}

function isIdentityFullFrame(corners: QuadCorners): boolean {
  const eps = 0.002;
  return (
    Math.abs(corners[0].x) < eps &&
    Math.abs(corners[0].y) < eps &&
    Math.abs(corners[1].x - 1) < eps &&
    Math.abs(corners[1].y) < eps &&
    Math.abs(corners[2].x - 1) < eps &&
    Math.abs(corners[2].y - 1) < eps &&
    Math.abs(corners[3].x) < eps &&
    Math.abs(corners[3].y - 1) < eps
  );
}

/**
 * Performs perspective dewarping (if cropped) + document scan filtering,
 * returning a crisp JPEG data URL + exact pixel dimensions.
 */
export async function processDocumentPage(params: {
  rawUrl: string;
  rotation: 0 | 90 | 180 | 270;
  corners: QuadCorners;
  filter: ScanFilter;
  brightness: number;
  contrast: number;
  maxOutputSide?: number;
  jpegQuality?: number;
}): Promise<{
  dataUrl: string;
  width: number;
  height: number;
}> {
  const {
    rawUrl,
    rotation,
    corners,
    filter,
    brightness,
    contrast,
    maxOutputSide = 2100,
    jpegQuality = 0.9,
  } = params;

  const rotatedCanvas = await renderRotatedCanvas(rawUrl, rotation);
  const srcW = rotatedCanvas.width;
  const srcH = rotatedCanvas.height;
  const srcCtx = rotatedCanvas.getContext("2d", { willReadFrequently: true });
  if (!srcCtx) throw new Error("Konteks kanvas tidak tersedia.");

  let outCanvas: HTMLCanvasElement;

  if (isIdentityFullFrame(corners)) {
    const scale = Math.min(1, maxOutputSide / Math.max(srcW, srcH));
    const dstW = Math.max(1, Math.round(srcW * scale));
    const dstH = Math.max(1, Math.round(srcH * scale));
    if (scale === 1) {
      outCanvas = rotatedCanvas;
    } else {
      outCanvas = document.createElement("canvas");
      outCanvas.width = dstW;
      outCanvas.height = dstH;
      const outCtx = outCanvas.getContext("2d", { willReadFrequently: true });
      if (!outCtx) throw new Error("Konteks output kanvas tidak tersedia.");
      outCtx.drawImage(rotatedCanvas, 0, 0, dstW, dstH);
    }
  } else {
    const pxCorners: [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
    ] = [
      { x: corners[0].x * (srcW - 1), y: corners[0].y * (srcH - 1) },
      { x: corners[1].x * (srcW - 1), y: corners[1].y * (srcH - 1) },
      { x: corners[2].x * (srcW - 1), y: corners[2].y * (srcH - 1) },
      { x: corners[3].x * (srcW - 1), y: corners[3].y * (srcH - 1) },
    ];

    const topW = Math.hypot(
      pxCorners[1].x - pxCorners[0].x,
      pxCorners[1].y - pxCorners[0].y,
    );
    const botW = Math.hypot(
      pxCorners[2].x - pxCorners[3].x,
      pxCorners[2].y - pxCorners[3].y,
    );
    const leftH = Math.hypot(
      pxCorners[3].x - pxCorners[0].x,
      pxCorners[3].y - pxCorners[0].y,
    );
    const rightH = Math.hypot(
      pxCorners[2].x - pxCorners[1].x,
      pxCorners[2].y - pxCorners[1].y,
    );

    const estW = Math.max(topW, botW, 64);
    const estH = Math.max(leftH, rightH, 64);
    const scale = Math.min(1, maxOutputSide / Math.max(estW, estH));
    const dstW = Math.max(64, Math.round(estW * scale));
    const dstH = Math.max(64, Math.round(estH * scale));

    const srcImage = srcCtx.getImageData(0, 0, srcW, srcH);
    const srcData = srcImage.data;

    outCanvas = document.createElement("canvas");
    outCanvas.width = dstW;
    outCanvas.height = dstH;
    const outCtx = outCanvas.getContext("2d", { willReadFrequently: true });
    if (!outCtx) throw new Error("Konteks output kanvas tidak tersedia.");

    const dstImage = outCtx.createImageData(dstW, dstH);
    const dstData = dstImage.data;
    const h = solveInverseHomography(dstW, dstH, pxCorners);

    for (let v = 0; v < dstH; v++) {
      const rowOffset = v * dstW;
      for (let u = 0; u < dstW; u++) {
        const denom = h[6] * u + h[7] * v + h[8];
        const sx = (h[0] * u + h[1] * v + h[2]) / denom;
        const sy = (h[3] * u + h[4] * v + h[5]) / denom;

        const dIdx = (rowOffset + u) * 4;

        if (sx < 0 || sx >= srcW - 1 || sy < 0 || sy >= srcH - 1) {
          const cx = clamp(Math.round(sx), 0, srcW - 1);
          const cy = clamp(Math.round(sy), 0, srcH - 1);
          const sIdx = (cy * srcW + cx) * 4;
          dstData[dIdx] = srcData[sIdx];
          dstData[dIdx + 1] = srcData[sIdx + 1];
          dstData[dIdx + 2] = srcData[sIdx + 2];
          dstData[dIdx + 3] = 255;
          continue;
        }

        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const tx = sx - x0;
        const ty = sy - y0;
        const invTx = 1 - tx;
        const invTy = 1 - ty;

        const w00 = invTx * invTy;
        const w10 = tx * invTy;
        const w01 = invTx * ty;
        const w11 = tx * ty;

        const p00 = (y0 * srcW + x0) * 4;
        const p10 = p00 + 4;
        const p01 = p00 + srcW * 4;
        const p11 = p01 + 4;

        dstData[dIdx] =
          srcData[p00] * w00 +
          srcData[p10] * w10 +
          srcData[p01] * w01 +
          srcData[p11] * w11;
        dstData[dIdx + 1] =
          srcData[p00 + 1] * w00 +
          srcData[p10 + 1] * w10 +
          srcData[p01 + 1] * w01 +
          srcData[p11 + 1] * w11;
        dstData[dIdx + 2] =
          srcData[p00 + 2] * w00 +
          srcData[p10 + 2] * w10 +
          srcData[p01 + 2] * w01 +
          srcData[p11 + 2] * w11;
        dstData[dIdx + 3] = 255;
      }
    }
    outCtx.putImageData(dstImage, 0, 0);
  }

  // Apply filter + brightness/contrast in-place
  if (filter !== "original" || brightness !== 0 || contrast !== 0) {
    const outCtx = outCanvas.getContext("2d", { willReadFrequently: true });
    if (outCtx) {
      const imgData = outCtx.getImageData(
        0,
        0,
        outCanvas.width,
        outCanvas.height,
      );
      applyDocumentFilterInPlace(imgData, filter, brightness, contrast);
      outCtx.putImageData(imgData, 0, 0);
    }
  }

  return {
    dataUrl: outCanvas.toDataURL("image/jpeg", jpegQuality),
    width: outCanvas.width,
    height: outCanvas.height,
  };
}

/**
 * Prepares a scanned Data URL for Vision AI OCR (PRD Section 10: longest side 1600-2048px, JPEG 85%).
 */
export async function prepareImageForAi(
  dataUrl: string,
  maxSide = 1800,
): Promise<string> {
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
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.85);
}
