import type { NormalizedPoint, QuadCorners } from "./su-types.ts";

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
  return triangleArea(q[0], q[1], q[2]) + triangleArea(q[0], q[2], q[3]);
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
    if (len1 < 0.1 || len2 < 0.1) return false;
    const cosTheta = clamp((v1x * v2x + v1y * v2y) / (len1 * len2), -1, 1);
    const deg = (Math.acos(cosTheta) * 180) / Math.PI;
    if (deg < 35 || deg > 148) return false;
  }
  return true;
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

function medianOf(arr: number[]): number {
  if (arr.length === 0) return 0;
  const copy = [...arr].sort((a, b) => a - b);
  return copy[Math.floor(copy.length / 2)];
}

/**
 * Fits 2D lines to the 4 outer edges of a foreground component via edge-extreme
 * sampling and intersects them for crisp edge-to-edge paper corners.
 */
function refineQuadFromMask(
  mask: Uint8Array,
  w: number,
  h: number,
): QuadCorners | null {
  const pts = findLargestComponentPoints(mask, w, h);
  if (pts.length < 24) return null;

  const hull = convexHull(
    pts.map((p) => ({ x: p.x / Math.max(1, w - 1), y: p.y / Math.max(1, h - 1) })),
  );
  return reduceHullToQuad(hull);
}

/**
 * Trims uniform dark or colored scanner/desk perimeter strips on flat scans or tight
 * camera captures where the paper spans >80% of the frame.
 */
function detectTightPerimeterTrim(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  bgR: number,
  bgG: number,
  bgB: number,
): QuadCorners | null {
  const isBgPixel = (x: number, y: number): boolean => {
    const p = (y * w + x) * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const dist = Math.hypot(r - bgR, g - bgG, b - bgB);
    return dist < 32;
  };

  let top = 0;
  while (top < Math.floor(h * 0.22)) {
    let bgHits = 0;
    for (let x = Math.floor(w * 0.1); x < Math.floor(w * 0.9); x++) {
      if (isBgPixel(x, top)) bgHits++;
    }
    if (bgHits / Math.max(1, Math.floor(w * 0.8)) < 0.82) break;
    top++;
  }

  let bottom = h - 1;
  while (bottom > Math.floor(h * 0.78)) {
    let bgHits = 0;
    for (let x = Math.floor(w * 0.1); x < Math.floor(w * 0.9); x++) {
      if (isBgPixel(x, bottom)) bgHits++;
    }
    if (bgHits / Math.max(1, Math.floor(w * 0.8)) < 0.82) break;
    bottom--;
  }

  let left = 0;
  while (left < Math.floor(w * 0.22)) {
    let bgHits = 0;
    for (let y = Math.floor(h * 0.1); y < Math.floor(h * 0.9); y++) {
      if (isBgPixel(left, y)) bgHits++;
    }
    if (bgHits / Math.max(1, Math.floor(h * 0.8)) < 0.82) break;
    left++;
  }

  let right = w - 1;
  while (right > Math.floor(w * 0.78)) {
    let bgHits = 0;
    for (let y = Math.floor(h * 0.1); y < Math.floor(h * 0.9); y++) {
      if (isBgPixel(right, y)) bgHits++;
    }
    if (bgHits / Math.max(1, Math.floor(h * 0.8)) < 0.82) break;
    right--;
  }

  const trimmedEdges =
    (top > 2 ? 1 : 0) +
    (h - 1 - bottom > 2 ? 1 : 0) +
    (left > 2 ? 1 : 0) +
    (w - 1 - right > 2 ? 1 : 0);

  if (trimmedEdges === 0 || right <= left + 16 || bottom <= top + 16) {
    return null;
  }

  const x0 = clamp(left / Math.max(1, w - 1), 0, 1);
  const y0 = clamp(top / Math.max(1, h - 1), 0, 1);
  const x1 = clamp(right / Math.max(1, w - 1), 0, 1);
  const y1 = clamp(bottom / Math.max(1, h - 1), 0, 1);

  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

/**
 * Pure RGBA document auto-crop detector designed to crop edge-to-edge across
 * real desk backgrounds, scanner dark frames, and skewed photos without cutting paper text.
 */
export function detectPaperCornersFromRgba(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): { corners: QuadCorners; detected: boolean } {
  const n = w * h;
  if (w < 16 || h < 16 || data.length < n * 4) {
    return { corners: cloneCorners(FULL_FRAME_CORNERS), detected: false };
  }

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

  // Sample outer perimeter median RGB & center paper median RGB
  const bRs: number[] = [];
  const bGs: number[] = [];
  const bBs: number[] = [];
  const bLums: number[] = [];
  const margin = Math.max(1, Math.min(3, Math.floor(Math.min(w, h) * 0.015)));

  const pushBorder = (x: number, y: number) => {
    const idx = y * w + x;
    const p = idx * 4;
    bRs.push(data[p]);
    bGs.push(data[p + 1]);
    bBs.push(data[p + 2]);
    bLums.push(lum[idx]);
  };

  for (let x = 0; x < w; x += 2) {
    pushBorder(x, margin);
    pushBorder(x, h - 1 - margin);
  }
  for (let y = margin; y < h - margin; y += 2) {
    pushBorder(margin, y);
    pushBorder(w - 1 - margin, y);
  }

  const bgR = medianOf(bRs);
  const bgG = medianOf(bGs);
  const bgB = medianOf(bBs);
  const bgLum = medianOf(bLums);

  const cRs: number[] = [];
  const cGs: number[] = [];
  const cBs: number[] = [];
  const cLums: number[] = [];
  for (let y = Math.floor(h * 0.28); y < Math.floor(h * 0.72); y += 2) {
    for (let x = Math.floor(w * 0.28); x < Math.floor(w * 0.72); x += 2) {
      const idx = y * w + x;
      const p = idx * 4;
      // Ignore dark ink strokes when estimating central paper color
      if (lum[idx] > 110) {
        cRs.push(data[p]);
        cGs.push(data[p + 1]);
        cBs.push(data[p + 2]);
        cLums.push(lum[idx]);
      }
    }
  }

  const paperR = cRs.length > 0 ? medianOf(cRs) : 240;
  const paperG = cGs.length > 0 ? medianOf(cGs) : 238;
  const paperB = cBs.length > 0 ? medianOf(cBs) : 230;
  const paperLum = cLums.length > 0 ? medianOf(cLums) : 220;

  const bgVsPaperDist = Math.hypot(
    paperR - bgR,
    paperG - bgG,
    paperB - bgB,
  );

  // If perimeter already matches central paper tone closely (<18 RGB distance), check edges only minimally
  const candidates: Array<{ quad: QuadCorners; weight: number }> = [];

  // 3x3 Gaussian blur + Sobel gradient
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

  // Strategy A: Perceptual color/luminance distance segmentation vs perimeter desk color
  if (bgVsPaperDist > 20 || paperLum > bgLum + 14) {
    const fg = new Uint8Array(n);
    const minPaperSep = Math.max(22, bgVsPaperDist * 0.36);

    for (let i = 0; i < n; i++) {
      const p = i * 4;
      const distToBg = Math.hypot(
        data[p] - bgR,
        data[p + 1] - bgG,
        data[p + 2] - bgB,
      );
      const distToPaper = Math.hypot(
        data[p] - paperR,
        data[p + 1] - paperG,
        data[p + 2] - paperB,
      );
      // Include paper body + dark ink strokes surrounded by paper area
      if (
        (distToBg > minPaperSep && distToPaper <= distToBg * 1.15) ||
        lum[i] < 105
      ) {
        fg[i] = 1;
      }
    }

    // Strip any spurious perimeter-touching ink noise if borders match bg
    for (let x = 0; x < w; x++) {
      for (const y of [0, h - 1]) {
        const i = y * w + x;
        const p = i * 4;
        if (Math.hypot(data[p] - bgR, data[p + 1] - bgG, data[p + 2] - bgB) < 26) {
          fg[i] = 0;
        }
      }
    }

    const qA = refineQuadFromMask(fg, w, h);
    if (qA) candidates.push({ quad: qA, weight: 1.15 });
  }

  // Strategy B: Straight scanner-border perimeter trim (catches dark margins up to 98% fill)
  if (bgVsPaperDist > 24) {
    const tightQuad = detectTightPerimeterTrim(data, w, h, bgR, bgG, bgB);
    if (tightQuad) candidates.push({ quad: tightQuad, weight: 1.05 });
  }

  // Strategy C: Strong Sobel outer boundary contour
  const edgeThresh = Math.max(44, maxGrad * 0.16);
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
  const qC = refineQuadFromMask(edgeMask, w, h);
  if (qC) candidates.push({ quad: qC, weight: 0.9 });

  // Also ensure already bright/low-chroma full-frame flat scans don't crop internal boxes falsely
  const looksLikeCleanFullFramePaper =
    bgVsPaperDist <= 18 && bgLum > 165 && medianOf(
      Array.from({ length: Math.min(200, w) }, (_, idx) => chroma[Math.min(n - 1, idx * 4)]),
    ) < 40;

  if (looksLikeCleanFullFramePaper && candidates.length === 0) {
    return { corners: cloneCorners(FULL_FRAME_CORNERS), detected: false };
  }

  let bestQuad: QuadCorners | null = null;
  let bestScore = -1;

  for (const { quad: q, weight } of candidates) {
    const area = quadArea(q);
    if (area < 0.18 || area > 0.992) continue;
    if (!cornerAnglesValid(q)) continue;

    // Avoid falsely cropping an interior text frame when the image border is ALREADY clean bright paper
    if (looksLikeCleanFullFramePaper && area < 0.86) continue;

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
    const score = (normalizedEdge * 0.58 + area * 0.42) * weight;
    if (normalizedEdge >= 0.28 && score > bestScore) {
      bestScore = score;
      bestQuad = q;
    }
  }

  if (!bestQuad) {
    return { corners: cloneCorners(FULL_FRAME_CORNERS), detected: false };
  }

  return { corners: bestQuad, detected: true };
}
