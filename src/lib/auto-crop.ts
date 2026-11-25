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

function percentileOf(arr: number[], q: number): number {
  if (arr.length === 0) return 0;
  const copy = [...arr].sort((a, b) => a - b);
  const idx = clamp(Math.floor(copy.length * q), 0, copy.length - 1);
  return copy[idx];
}

function medianOf(arr: number[]): number {
  return percentileOf(arr, 0.5);
}

/**
 * Fits a 2D line ax + by + c = 0 (a^2 + b^2 = 1) using PCA / total least squares.
 */
function fitLinePCA(pts: NormalizedPoint[]): { a: number; b: number; c: number } | null {
  if (pts.length < 2) return null;
  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p.x;
    my += p.y;
  }
  mx /= pts.length;
  my /= pts.length;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of pts) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  const trace = sxx + syy;
  if (trace < 1e-10) return null;
  const diff = sxx - syy;
  // Eigenvector corresponding to smallest eigenvalue = line normal
  const theta = 0.5 * Math.atan2(2 * sxy, diff);
  // Principal axis direction is (cos(theta), sin(theta)); normal is orthogonal
  const nx = -Math.sin(theta);
  const ny = Math.cos(theta);
  const c = -(nx * mx + ny * my);
  return { a: nx, b: ny, c };
}

function fitTrimmedLine(pts: NormalizedPoint[]): { a: number; b: number; c: number } | null {
  const initial = fitLinePCA(pts);
  if (!initial || pts.length < 8) return initial;

  const withDist = pts
    .map((p) => ({
      p,
      d: Math.abs(initial.a * p.x + initial.b * p.y + initial.c),
    }))
    .sort((u, v) => u.d - v.d);
  const keepCount = Math.max(4, Math.floor(withDist.length * 0.72));
  return fitLinePCA(withDist.slice(0, keepCount).map((x) => x.p)) ?? initial;
}

function intersectLines(
  l1: { a: number; b: number; c: number },
  l2: { a: number; b: number; c: number },
): NormalizedPoint | null {
  const det = l1.a * l2.b - l2.a * l1.b;
  if (Math.abs(det) < 1e-4) return null;
  const x = (l1.b * l2.c - l2.b * l1.c) / det;
  const y = (l2.a * l1.c - l1.a * l2.c) / det;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < -0.1 || x > 1.1 || y < -0.1 || y > 1.1) return null;
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
}

/**
 * Dilates a binary mask by 1px and erodes 1px (morphological closing)
 * so ink lines touching a border don't split the document sheet.
 */
function closeMask3x3(src: Uint8Array, w: number, h: number): Uint8Array {
  const dil = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (src[row + x] === 1) {
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          const nRow = ny * w;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx >= 0 && nx < w) dil[nRow + nx] = 1;
          }
        }
      }
    }
  }

  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const idx = row + x;
      if (dil[idx] === 0) continue;
      let allSet = true;
      for (let dy = -1; dy <= 1 && allSet; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        const nRow = ny * w;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < w && dil[nRow + nx] === 0) {
            allSet = false;
            break;
          }
        }
      }
      if (allSet) out[idx] = 1;
    }
  }
  return out;
}

/**
 * Flood-fills background from image perimeter pixels where paperMask === 0.
 * Any pixel NOT reached by the exterior flood-fill (including dark ink & stamps
 * enclosed inside the sheet) becomes fg = 1, while outer dark desks stay 0.
 */
function fillEnclosedDocumentHoles(
  paperMask: Uint8Array,
  w: number,
  h: number,
): Uint8Array {
  const n = w * h;
  const exterior = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;

  const trySeed = (idx: number) => {
    if (paperMask[idx] === 0 && exterior[idx] === 0) {
      exterior[idx] = 1;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < w; x++) {
    trySeed(x);
    trySeed((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    trySeed(y * w);
    trySeed(y * w + (w - 1));
  }

  while (head < tail) {
    const idx = queue[head++];
    const y = Math.floor(idx / w);
    const x = idx - y * w;

    if (x > 0) trySeed(idx - 1);
    if (x < w - 1) trySeed(idx + 1);
    if (y > 0) trySeed(idx - w);
    if (y < h - 1) trySeed(idx + w);
  }

  const fg = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (exterior[i] === 0) fg[i] = 1;
  }
  return fg;
}

function findLargestComponentInfo(
  mask: Uint8Array,
  w: number,
  h: number,
): {
  boundaryPts: NormalizedPoint[];
  allPts: NormalizedPoint[];
} | null {
  const n = w * h;
  const visited = new Uint8Array(n);
  const queue = new Int32Array(n);
  let bestPixels: number[] = [];

  for (let start = 0; start < n; start++) {
    if (mask[start] === 0 || visited[start] === 1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    const comp: number[] = [];
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;

    while (head < tail) {
      const idx = queue[head++];
      comp.push(idx);
      const y = Math.floor(idx / w);
      const x = idx - y * w;
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
    if (spanW >= 0.25 && spanH >= 0.25 && comp.length > bestPixels.length) {
      bestPixels = comp;
    }
  }

  if (bestPixels.length < 36) return null;

  const normW = Math.max(1, w - 1);
  const normH = Math.max(1, h - 1);
  const allPts: NormalizedPoint[] = [];
  const boundaryPts: NormalizedPoint[] = [];

  for (const idx of bestPixels) {
    const y = Math.floor(idx / w);
    const x = idx - y * w;
    const pt = { x: x / normW, y: y / normH };
    allPts.push(pt);

    const onBoundary =
      x === 0 ||
      x === w - 1 ||
      y === 0 ||
      y === h - 1 ||
      mask[idx - 1] === 0 ||
      mask[idx + 1] === 0 ||
      mask[idx - w] === 0 ||
      mask[idx + w] === 0;
    if (onBoundary) boundaryPts.push(pt);
  }

  return { boundaryPts, allPts };
}

function refineQuadWithBoundaryLines(
  hullQuad: QuadCorners,
  boundaryPts: NormalizedPoint[],
): QuadCorners {
  const lines: Array<{ a: number; b: number; c: number } | null> = [];

  for (let e = 0; e < 4; e++) {
    const p1 = hullQuad[e];
    const p2 = hullQuad[(e + 1) % 4];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.08) {
      lines.push(null);
      continue;
    }

    // Preserve flush frame-edge lines directly when component reaches the viewport border
    const borderTol = 0.014;
    if (p1.y <= borderTol && p2.y <= borderTol) {
      lines.push({ a: 0, b: 1, c: 0 });
      continue;
    }
    if (p1.y >= 1 - borderTol && p2.y >= 1 - borderTol) {
      lines.push({ a: 0, b: 1, c: -1 });
      continue;
    }
    if (p1.x <= borderTol && p2.x <= borderTol) {
      lines.push({ a: 1, b: 0, c: 0 });
      continue;
    }
    if (p1.x >= 1 - borderTol && p2.x >= 1 - borderTol) {
      lines.push({ a: 1, b: 0, c: -1 });
      continue;
    }

    const ux = dx / len;
    const uy = dy / len;
    const nearPts: NormalizedPoint[] = [];
    for (const bp of boundaryPts) {
      const rx = bp.x - p1.x;
      const ry = bp.y - p1.y;
      const proj = (rx * ux + ry * uy) / len;
      if (proj < 0.06 || proj > 0.94) continue;
      const perpDist = Math.abs(rx * -uy + ry * ux);
      if (perpDist <= 0.045) {
        nearPts.push(bp);
      }
    }

    lines.push(nearPts.length >= 6 ? fitTrimmedLine(nearPts) : null);
  }

  if (lines.some((l) => l === null)) {
    return hullQuad;
  }

  const tl = intersectLines(lines[3]!, lines[0]!);
  const tr = intersectLines(lines[0]!, lines[1]!);
  const br = intersectLines(lines[1]!, lines[2]!);
  const bl = intersectLines(lines[2]!, lines[3]!);
  if (!tl || !tr || !br || !bl) return hullQuad;

  const fitted = orderCornersClockwise([tl, tr, br, bl]);
  return cornerAnglesValid(fitted) ? fitted : hullQuad;
}

/**
 * Inward margin trimmer for dark/colored desk margins or scanner dark borders
 * when the document fills 75–98% of the frame.
 */
function detectTightPerimeterTrim(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  paperR: number,
  paperG: number,
  paperB: number,
  paperLum: number,
  bgVsPaperDist: number,
): QuadCorners | null {
  const colorTol = Math.max(24, Math.min(48, bgVsPaperDist * 0.42));

  const isBgLike = (x: number, y: number): boolean => {
    const p = (y * w + x) * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    const dPaper = Math.hypot(r - paperR, g - paperG, b - paperB);
    return l < paperLum * 0.62 || dPaper > colorTol;
  };

  const isPaperStrip = (coords: Array<[number, number]>): boolean => {
    let paperCount = 0;
    for (const [cx, cy] of coords) {
      if (!isBgLike(cx, cy)) paperCount++;
    }
    return paperCount / Math.max(1, coords.length) >= 0.72;
  };

  let top = 0;
  const xSamplesTopBottom: number[] = [];
  for (let x = Math.floor(w * 0.2); x < Math.floor(w * 0.8); x += 2) {
    xSamplesTopBottom.push(x);
  }
  while (top < Math.floor(h * 0.34)) {
    if (isPaperStrip(xSamplesTopBottom.map((x) => [x, top]))) break;
    top++;
  }

  let bottom = h - 1;
  while (bottom > Math.floor(h * 0.66)) {
    if (isPaperStrip(xSamplesTopBottom.map((x) => [x, bottom]))) break;
    bottom--;
  }

  const ySamplesLeftRight: number[] = [];
  for (let y = Math.floor(h * 0.2); y < Math.floor(h * 0.8); y += 2) {
    ySamplesLeftRight.push(y);
  }
  let left = 0;
  while (left < Math.floor(w * 0.34)) {
    if (isPaperStrip(ySamplesLeftRight.map((y) => [left, y]))) break;
    left++;
  }

  let right = w - 1;
  while (right > Math.floor(w * 0.66)) {
    if (isPaperStrip(ySamplesLeftRight.map((y) => [right, y]))) break;
    right--;
  }

  const trimmedEdges =
    (top >= 2 ? 1 : 0) +
    (h - 1 - bottom >= 2 ? 1 : 0) +
    (left >= 2 ? 1 : 0) +
    (w - 1 - right >= 2 ? 1 : 0);

  if (trimmedEdges === 0 || right <= left + 20 || bottom <= top + 20) {
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
 * Directional gradient projection detector for subtle off-white / light-wood desks
 * where color difference alone is low but paper edges create clean continuous steps.
 */
function detectDirectionalProjectionQuad(
  data: Uint8ClampedArray,
  lum: Float32Array,
  absGx: Float32Array,
  absGy: Float32Array,
  w: number,
  h: number,
  paperR: number,
  paperG: number,
  paperB: number,
): QuadCorners | null {
  const bestSideIdx = (
    limitStart: number,
    limitEnd: number,
    stepDir: 1 | -1,
    isHorizontalEdge: boolean,
  ): number => {
    let bestPos = limitStart;
    let bestEdgeScore = 0;

    for (let pos = limitStart; stepDir > 0 ? pos < limitEnd : pos > limitEnd; pos += stepDir) {
      let gradSum = 0;
      let count = 0;
      let insidePaperMatch = 0;
      let outsideDiff = 0;

      if (isHorizontalEdge) {
        const yIn = clamp(pos + stepDir * 4, 0, h - 1);
        const yOut = clamp(pos - stepDir * 4, 0, h - 1);
        for (let x = Math.floor(w * 0.22); x < Math.floor(w * 0.78); x += 2) {
          const i = pos * w + x;
          gradSum += absGy[i];
          const pIn = (yIn * w + x) * 4;
          const pOut = (yOut * w + x) * 4;
          const dIn = Math.hypot(
            data[pIn] - paperR,
            data[pIn + 1] - paperG,
            data[pIn + 2] - paperB,
          );
          const dOut = Math.hypot(
            data[pOut] - paperR,
            data[pOut + 1] - paperG,
            data[pOut + 2] - paperB,
          );
          if (dIn < 28) insidePaperMatch++;
          if (dOut > dIn + 12 || lum[yIn * w + x] > lum[yOut * w + x] + 10) {
            outsideDiff++;
          }
          count++;
        }
      } else {
        const xIn = clamp(pos + stepDir * 4, 0, w - 1);
        const xOut = clamp(pos - stepDir * 4, 0, w - 1);
        for (let y = Math.floor(h * 0.22); y < Math.floor(h * 0.78); y += 2) {
          const i = y * w + pos;
          gradSum += absGx[i];
          const pIn = (y * w + xIn) * 4;
          const pOut = (y * w + xOut) * 4;
          const dIn = Math.hypot(
            data[pIn] - paperR,
            data[pIn + 1] - paperG,
            data[pIn + 2] - paperB,
          );
          const dOut = Math.hypot(
            data[pOut] - paperR,
            data[pOut + 1] - paperG,
            data[pOut + 2] - paperB,
          );
          if (dIn < 28) insidePaperMatch++;
          if (dOut > dIn + 12 || lum[y * w + xIn] > lum[y * w + xOut] + 10) {
            outsideDiff++;
          }
          count++;
        }
      }

      if (count === 0) continue;
      const meanGrad = gradSum / count;
      const sepFrac = outsideDiff / count;
      const inFrac = insidePaperMatch / count;
      if (sepFrac < 0.45 || inFrac < 0.5) continue;
      const score = meanGrad * (0.4 + sepFrac * 0.6);
      if (score > bestEdgeScore) {
        bestEdgeScore = score;
        bestPos = pos;
      }
    }

    return bestEdgeScore >= 18 ? bestPos : limitStart;
  };

  const top = bestSideIdx(2, Math.floor(h * 0.34), 1, true);
  const bottom = bestSideIdx(h - 3, Math.floor(h * 0.66), -1, true);
  const left = bestSideIdx(2, Math.floor(w * 0.34), 1, false);
  const right = bestSideIdx(w - 3, Math.floor(w * 0.66), -1, false);

  const trimmed =
    (top > 3 ? 1 : 0) +
    (h - 3 - bottom > 3 ? 1 : 0) +
    (left > 3 ? 1 : 0) +
    (w - 3 - right > 3 ? 1 : 0);

  if (trimmed === 0 || right <= left + 20 || bottom <= top + 20) {
    return null;
  }

  return [
    { x: left / Math.max(1, w - 1), y: top / Math.max(1, h - 1) },
    { x: right / Math.max(1, w - 1), y: top / Math.max(1, h - 1) },
    { x: right / Math.max(1, w - 1), y: bottom / Math.max(1, h - 1) },
    { x: left / Math.max(1, w - 1), y: bottom / Math.max(1, h - 1) },
  ];
}

/**
 * Pure RGBA document auto-crop detector designed to crop edge-to-edge across
 * dark office desks, wood/granite tables, light desks, scanner margins, and skewed photos.
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

  // Sample outer perimeter pixels across all 4 edges
  const margin = Math.max(1, Math.min(3, Math.floor(Math.min(w, h) * 0.015)));
  const borderPixels: Array<{ idx: number; r: number; g: number; b: number; l: number }> = [];
  const pushBorder = (x: number, y: number) => {
    const idx = y * w + x;
    const p = idx * 4;
    borderPixels.push({
      idx,
      r: data[p],
      g: data[p + 1],
      b: data[p + 2],
      l: lum[idx],
    });
  };
  for (let x = 0; x < w; x += 2) {
    pushBorder(x, margin);
    pushBorder(x, h - 1 - margin);
  }
  for (let y = margin; y < h - margin; y += 2) {
    pushBorder(margin, y);
    pushBorder(w - 1 - margin, y);
  }

  const bLums = borderPixels.map((px) => px.l);
  const medBgR = medianOf(borderPixels.map((px) => px.r));
  const medBgG = medianOf(borderPixels.map((px) => px.g));
  const medBgB = medianOf(borderPixels.map((px) => px.b));
  const medBgLum = medianOf(bLums);

  // Also grab darker 35th-percentile perimeter color in case one edge touches bare paper
  borderPixels.sort((a, b) => a.l - b.l);
  const darkSlice = borderPixels.slice(
    0,
    Math.max(4, Math.floor(borderPixels.length * 0.45)),
  );
  const darkBgR = medianOf(darkSlice.map((px) => px.r));
  const darkBgG = medianOf(darkSlice.map((px) => px.g));
  const darkBgB = medianOf(darkSlice.map((px) => px.b));

  // Sample central document body at P55..P90 luminance (ignoring black ink, stamps & dark borders)
  const centerSamples: Array<{ r: number; g: number; b: number; l: number }> = [];
  for (let y = Math.floor(h * 0.22); y < Math.floor(h * 0.78); y += 2) {
    for (let x = Math.floor(w * 0.22); x < Math.floor(w * 0.78); x += 2) {
      const idx = y * w + x;
      const p = idx * 4;
      centerSamples.push({
        r: data[p],
        g: data[p + 1],
        b: data[p + 2],
        l: lum[idx],
      });
    }
  }
  centerSamples.sort((a, b) => a.l - b.l);
  const paperBand = centerSamples.slice(
    Math.floor(centerSamples.length * 0.55),
    Math.max(1, Math.floor(centerSamples.length * 0.9)),
  );
  const paperR = paperBand.length > 0 ? medianOf(paperBand.map((s) => s.r)) : 240;
  const paperG = paperBand.length > 0 ? medianOf(paperBand.map((s) => s.g)) : 238;
  const paperB = paperBand.length > 0 ? medianOf(paperBand.map((s) => s.b)) : 230;
  const paperLum = paperBand.length > 0 ? medianOf(paperBand.map((s) => s.l)) : 225;

  const bgVsPaperDist = Math.hypot(
    paperR - medBgR,
    paperG - medBgG,
    paperB - medBgB,
  );
  const darkBgVsPaperDist = Math.hypot(
    paperR - darkBgR,
    paperG - darkBgG,
    paperB - darkBgB,
  );
  const maxBgPaperDist = Math.max(bgVsPaperDist, darkBgVsPaperDist);

  // Compute 3x3 Gaussian blur + Sobel gradients
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

  const absGx = new Float32Array(n);
  const absGy = new Float32Array(n);
  const grad = new Float32Array(n);
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
      const agx = Math.abs(gx);
      const agy = Math.abs(gy);
      absGx[i] = agx;
      absGy[i] = agy;
      grad[i] = agx + agy;
    }
  }

  const gradSamples: number[] = [];
  for (let i = 0; i < n; i += 7) gradSamples.push(grad[i]);
  const medianGrad = medianOf(gradSamples);
  const edgeThresh = clamp(medianGrad * 3.0, 26, 72);

  const candidates: Array<{ quad: QuadCorners; weight: number }> = [];

  // Strategy A: Paper-color segmentation + perimeter flood-fill hole filling + boundary line fitting
  if (maxBgPaperDist > 14 || paperLum > medBgLum + 10) {
    const paperMask = new Uint8Array(n);
    const minBrightFloor = Math.max(75, paperLum * 0.58);
    const paperRadiusTol = Math.max(38, maxBgPaperDist * 0.65);

    for (let i = 0; i < n; i++) {
      if (lum[i] < minBrightFloor) continue;
      const p = i * 4;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const dPaper = Math.hypot(r - paperR, g - paperG, b - paperB);
      if (dPaper > paperRadiusTol) continue;

      const dMedBg = Math.hypot(r - medBgR, g - medBgG, b - medBgB);
      const dDarkBg = Math.hypot(r - darkBgR, g - darkBgG, b - darkBgB);
      const minBgD = Math.min(dMedBg, dDarkBg);

      if (dPaper <= minBgD * 1.15 + 4 || lum[i] > medBgLum + 12) {
        paperMask[i] = 1;
      }
    }

    const closed = closeMask3x3(paperMask, w, h);
    const fg = fillEnclosedDocumentHoles(closed, w, h);
    const comp = findLargestComponentInfo(fg, w, h);
    if (comp) {
      const hull = convexHull(comp.boundaryPts);
      const qHull = reduceHullToQuad(hull);
      if (qHull) {
        const qFitted = refineQuadWithBoundaryLines(qHull, comp.boundaryPts);
        candidates.push({ quad: qFitted, weight: 1.2 });
        if (qFitted !== qHull) {
          candidates.push({ quad: qHull, weight: 1.05 });
        }
      }
    }
  }

  // Strategy B: Inward tight perimeter trim (catches dark margins / scanner rims on 75-98% fills)
  if (maxBgPaperDist > 16 || paperLum > medBgLum + 12) {
    const tightQuad = detectTightPerimeterTrim(
      data,
      w,
      h,
      paperR,
      paperG,
      paperB,
      paperLum,
      maxBgPaperDist,
    );
    if (tightQuad) candidates.push({ quad: tightQuad, weight: 1.08 });
  }

  // Strategy C: Oriented directional gradient projection (white/beige desks with subtle shadow borders)
  const projQuad = detectDirectionalProjectionQuad(
    data,
    lum,
    absGx,
    absGy,
    w,
    h,
    paperR,
    paperG,
    paperB,
  );
  if (projQuad) candidates.push({ quad: projQuad, weight: 0.96 });

  const looksLikeCleanFullFramePaper =
    maxBgPaperDist <= 14 &&
    medBgLum > 170 &&
    medianOf(
      Array.from({ length: Math.min(200, w) }, (_, idx) =>
        chroma[Math.min(n - 1, idx * 4)],
      ),
    ) < 35;

  let bestQuad: QuadCorners | null = null;
  let bestScore = -1;

  for (const { quad: q, weight } of candidates) {
    const area = quadArea(q);
    if (area < 0.16 || area > 0.992) continue;
    if (!cornerAnglesValid(q)) continue;
    if (looksLikeCleanFullFramePaper && area < 0.85) continue;

    // Evaluate dual boundary cues on non-flush edges: outside-vs-inside region contrast + local Sobel energy
    let activeEdges = 0;
    let totalSobelSupport = 0;
    let totalRegionContrast = 0;
    let interiorPaperSimilarityHits = 0;
    let exteriorNonPaperHits = 0;
    let exteriorSamples = 0;

    for (let e = 0; e < 4; e++) {
      const a = q[e];
      const b = q[(e + 1) % 4];
      const isFlushBorder =
        (a.x <= 0.015 && b.x <= 0.015) ||
        (a.x >= 0.985 && b.x >= 0.985) ||
        (a.y <= 0.015 && b.y <= 0.015) ||
        (a.y >= 0.985 && b.y >= 0.985);
      if (isFlushBorder) continue;

      activeEdges++;
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const elen = Math.hypot(ex, ey) || 1;
      // Clockwise quad: outward normal is (+ey/elen, -ex/elen) -> verify with image center
      let nx = ey / elen;
      let ny = -ex / elen;
      const midX = (a.x + b.x) * 0.5;
      const midY = (a.y + b.y) * 0.5;
      if ((midX - 0.5) * nx + (midY - 0.5) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }

      let edgeSobel = 0;
      let edgeStep = 0;
      const steps = 28;
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const bx = a.x + ex * t;
        const by = a.y + ey * t;
        const px = Math.round(bx * (w - 1));
        const py = Math.round(by * (h - 1));

        let localGrad = 0;
        for (let dy = -2; dy <= 2; dy++) {
          const yy = clamp(py + dy, 0, h - 1);
          for (let dx = -2; dx <= 2; dx++) {
            const xx = clamp(px + dx, 0, w - 1);
            const gVal = grad[yy * w + xx];
            if (gVal > localGrad) localGrad = gVal;
          }
        }
        edgeSobel += Math.min(1, localGrad / edgeThresh);

        const ox = clamp(Math.round(bx * (w - 1) + nx * 4), 0, w - 1);
        const oy = clamp(Math.round(by * (h - 1) + ny * 4), 0, h - 1);
        const ix = clamp(Math.round(bx * (w - 1) - nx * 4), 0, w - 1);
        const iy = clamp(Math.round(by * (h - 1) - ny * 4), 0, h - 1);

        const op = (oy * w + ox) * 4;
        const ip = (iy * w + ix) * 4;
        const stepDist = Math.hypot(
          data[ip] - data[op],
          data[ip + 1] - data[op + 1],
          data[ip + 2] - data[op + 2],
        );
        edgeStep += stepDist;

        const dOutPaper = Math.hypot(
          data[op] - paperR,
          data[op + 1] - paperG,
          data[op + 2] - paperB,
        );
        const dInPaper = Math.hypot(
          data[ip] - paperR,
          data[ip + 1] - paperG,
          data[ip + 2] - paperB,
        );
        if (dInPaper < 42) interiorPaperSimilarityHits++;
        if (dOutPaper > dInPaper + 10) exteriorNonPaperHits++;
        exteriorSamples++;
      }

      totalSobelSupport += edgeSobel / (steps - 1);
      totalRegionContrast += edgeStep / (steps - 1);
    }

    if (activeEdges === 0) continue;

    const meanSobelSupport = totalSobelSupport / activeEdges;
    const meanEdgeStep = totalRegionContrast / activeEdges;
    const exteriorSepFrac =
      exteriorSamples > 0 ? exteriorNonPaperHits / exteriorSamples : 0;
    const interiorMatchFrac =
      exteriorSamples > 0 ? interiorPaperSimilarityHits / exteriorSamples : 0;

    // Require genuine physical separation between excluded background & paper
    const passesBoundaryEvidence =
      (meanEdgeStep >= 15 && exteriorSepFrac >= 0.35 && interiorMatchFrac >= 0.4) ||
      (meanSobelSupport >= 0.42 && exteriorSepFrac >= 0.3);

    if (!passesBoundaryEvidence) continue;

    const normalizedContrast = clamp(meanEdgeStep / 55, 0, 1);
    const score =
      (meanSobelSupport * 0.35 +
        normalizedContrast * 0.35 +
        exteriorSepFrac * 0.15 +
        area * 0.15) *
      weight;

    if (score > bestScore) {
      bestScore = score;
      bestQuad = q;
    }
  }

  if (!bestQuad) {
    return { corners: cloneCorners(FULL_FRAME_CORNERS), detected: false };
  }

  return { corners: bestQuad, detected: true };
}
