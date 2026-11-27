"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Maximize2, RotateCcw, Scan, Spline } from "lucide-react";
import { AppDialog } from "./AppDialog";
import {
  cloneCorners,
  computeDefaultEdgeMidpoints,
  detectPaperCornersFromCanvas,
  FULL_FRAME_CORNERS,
  renderRotatedCanvas,
} from "@/lib/document-scanner";
import type { EdgeMidpoints, QuadCorners } from "@/lib/su-types";

interface ManualCropModalProps {
  open: boolean;
  onClose: () => void;
  pageLabel: string;
  rawUrl: string;
  rotation: 0 | 90 | 180 | 270;
  initialCorners: QuadCorners;
  initialMidpoints?: EdgeMidpoints;
  onApply: (corners: QuadCorners, edgeMidpoints?: EdgeMidpoints) => void;
}

const CORNER_NAMES = [
  "Kiri Atas",
  "Kanan Atas",
  "Kanan Bawah",
  "Kiri Bawah",
] as const;

const MIDPOINT_NAMES = [
  "Tengah Atas",
  "Tengah Kanan",
  "Tengah Bawah",
  "Tengah Kiri",
] as const;

function cloneMidpoints(m: EdgeMidpoints): EdgeMidpoints {
  return [
    { ...m[0] },
    { ...m[1] },
    { ...m[2] },
    { ...m[3] },
  ];
}

export function ManualCropModal({
  open,
  onClose,
  pageLabel,
  rawUrl,
  rotation,
  initialCorners,
  initialMidpoints,
  onApply,
}: ManualCropModalProps) {
  const stageCanvasRef = useRef<HTMLCanvasElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);
  const rotatedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [corners, setCorners] = useState<QuadCorners>(() =>
    cloneCorners(initialCorners),
  );
  const [curvedMode, setCurvedMode] = useState<boolean>(Boolean(initialMidpoints));
  const [midpoints, setMidpoints] = useState<EdgeMidpoints>(() =>
    initialMidpoints
      ? cloneMidpoints(initialMidpoints)
      : computeDefaultEdgeMidpoints(initialCorners),
  );
  /** Index 0..3 = corners, 4..7 = edge midpoints */
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [canvasDims, setCanvasDims] = useState({ width: 640, height: 480 });
  const [imageReady, setImageReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    renderRotatedCanvas(rawUrl, rotation)
      .then((rotCanvas) => {
        if (cancelled) return;
        rotatedCanvasRef.current = rotCanvas;
        const maxDisplayW = 720;
        const maxDisplayH = 440;
        const scale = Math.min(
          maxDisplayW / rotCanvas.width,
          maxDisplayH / rotCanvas.height,
          1,
        );
        const w = Math.max(200, Math.round(rotCanvas.width * scale));
        const h = Math.max(160, Math.round(rotCanvas.height * scale));
        const initC = cloneCorners(initialCorners);
        setCorners(initC);
        setCurvedMode(Boolean(initialMidpoints));
        setMidpoints(
          initialMidpoints
            ? cloneMidpoints(initialMidpoints)
            : computeDefaultEdgeMidpoints(initC),
        );
        setActiveIdx(null);
        setCanvasDims({ width: w, height: h });
        setImageReady(true);
      })
      .catch(() => {
        if (!cancelled) setImageReady(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, rawUrl, rotation, initialCorners, initialMidpoints]);

  const drawOverlay = useCallback(() => {
    const canvas = stageCanvasRef.current;
    const rotCanvas = rotatedCanvasRef.current;
    if (!canvas || !rotCanvas || !imageReady) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width: w, height: h } = canvasDims;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(rotCanvas, 0, 0, w, h);

    // Quadratic Bezier control point for curve passing through midpoint at t=0.5
    const quadCtrl = (
      a: { x: number; y: number },
      m: { x: number; y: number },
      b: { x: number; y: number },
    ) => ({
      x: 2 * m.x - 0.5 * (a.x + b.x),
      y: 2 * m.y - 0.5 * (a.y + b.y),
    });

    const p0 = { x: corners[0].x * w, y: corners[0].y * h };
    const p1 = { x: corners[1].x * w, y: corners[1].y * h };
    const p2 = { x: corners[2].x * w, y: corners[2].y * h };
    const p3 = { x: corners[3].x * w, y: corners[3].y * h };

    const tracePolygonPath = (reverse = false) => {
      if (!curvedMode) {
        if (!reverse) {
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
        } else {
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p1.x, p1.y);
        }
        return;
      }
      const mTop = { x: midpoints[0].x * w, y: midpoints[0].y * h };
      const mRight = { x: midpoints[1].x * w, y: midpoints[1].y * h };
      const mBottom = { x: midpoints[2].x * w, y: midpoints[2].y * h };
      const mLeft = { x: midpoints[3].x * w, y: midpoints[3].y * h };
      const cTop = quadCtrl(p0, mTop, p1);
      const cRight = quadCtrl(p1, mRight, p2);
      const cBottom = quadCtrl(p2, mBottom, p3);
      const cLeft = quadCtrl(p3, mLeft, p0);

      if (!reverse) {
        ctx.moveTo(p0.x, p0.y);
        ctx.quadraticCurveTo(cTop.x, cTop.y, p1.x, p1.y);
        ctx.quadraticCurveTo(cRight.x, cRight.y, p2.x, p2.y);
        ctx.quadraticCurveTo(cBottom.x, cBottom.y, p3.x, p3.y);
        ctx.quadraticCurveTo(cLeft.x, cLeft.y, p0.x, p0.y);
      } else {
        ctx.moveTo(p0.x, p0.y);
        ctx.quadraticCurveTo(cLeft.x, cLeft.y, p3.x, p3.y);
        ctx.quadraticCurveTo(cBottom.x, cBottom.y, p2.x, p2.y);
        ctx.quadraticCurveTo(cRight.x, cRight.y, p1.x, p1.y);
        ctx.quadraticCurveTo(cTop.x, cTop.y, p0.x, p0.y);
      }
    };

    ctx.save();
    ctx.fillStyle = "rgba(17, 17, 20, 0.55)";
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    tracePolygonPath(true);
    ctx.closePath();
    ctx.fill("evenodd");
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = curvedMode ? "#f562ae" : "#a855f7";
    ctx.lineWidth = 3;
    ctx.beginPath();
    tracePolygonPath(false);
    ctx.closePath();
    ctx.stroke();

    // Draw 4 corner handles
    corners.forEach((pt, idx) => {
      const px = pt.x * w;
      const py = pt.y * h;
      const isSelected = activeIdx === idx;
      ctx.beginPath();
      ctx.arc(px, py, isSelected ? 12 : 9.5, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "#5e17eb" : "#ffffff";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = isSelected ? "#fbd93b" : "#111114";
      ctx.stroke();
    });

    // Draw 4 curved edge midpoint handles when Book-Spine curve mode is active
    if (curvedMode) {
      midpoints.forEach((pt, idx) => {
        const handleIdx = idx + 4;
        const px = pt.x * w;
        const py = pt.y * h;
        const isSelected = activeIdx === handleIdx;
        const r = isSelected ? 10 : 8;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = isSelected ? "#fbd93b" : "#f562ae";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.fillRect(-r / Math.SQRT2, -r / Math.SQRT2, r * Math.SQRT2, r * Math.SQRT2);
        ctx.strokeRect(-r / Math.SQRT2, -r / Math.SQRT2, r * Math.SQRT2, r * Math.SQRT2);
        ctx.restore();
      });
    }
    ctx.restore();

    const loupe = loupeCanvasRef.current;
    if (loupe && activeIdx !== null) {
      const lCtx = loupe.getContext("2d");
      if (lCtx) {
        const pt =
          activeIdx < 4 ? corners[activeIdx] : midpoints[activeIdx - 4];
        const srcX = pt.x * rotCanvas.width;
        const srcY = pt.y * rotCanvas.height;
        const zoomRadius = 46;
        const lSize = loupe.width;

        lCtx.clearRect(0, 0, lSize, lSize);
        lCtx.fillStyle = "#111114";
        lCtx.fillRect(0, 0, lSize, lSize);

        lCtx.drawImage(
          rotCanvas,
          srcX - zoomRadius,
          srcY - zoomRadius,
          zoomRadius * 2,
          zoomRadius * 2,
          0,
          0,
          lSize,
          lSize,
        );

        lCtx.strokeStyle = "#5e17eb";
        lCtx.lineWidth = 2;
        lCtx.beginPath();
        lCtx.moveTo(lSize / 2, 0);
        lCtx.lineTo(lSize / 2, lSize);
        lCtx.moveTo(0, lSize / 2);
        lCtx.lineTo(lSize, lSize / 2);
        lCtx.stroke();
      }
    }
  }, [activeIdx, canvasDims, corners, curvedMode, imageReady, midpoints]);

  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  const toNormalized = (clientX: number, clientY: number) => {
    const canvas = stageCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pos = toNormalized(e.clientX, e.clientY);
    if (!pos) return;

    const allHandles = curvedMode ? [...corners, ...midpoints] : [...corners];
    let closestIdx = 0;
    let minDist = Infinity;
    allHandles.forEach((pt, idx) => {
      const dx = (pt.x - pos.x) * canvasDims.width;
      const dy = (pt.y - pos.y) * canvasDims.height;
      const dist = Math.hypot(dx, dy);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = idx;
      }
    });

    if (minDist <= 42) {
      setActiveIdx(closestIdx);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeIdx === null || !e.currentTarget.hasPointerCapture(e.pointerId)) {
      return;
    }
    const pos = toNormalized(e.clientX, e.clientY);
    if (!pos) return;

    if (activeIdx < 4) {
      setCorners((prev) => {
        const next = cloneCorners(prev);
        next[activeIdx] = pos;
        if (!curvedMode) {
          setMidpoints(computeDefaultEdgeMidpoints(next));
        }
        return next;
      });
    } else {
      const mIdx = activeIdx - 4;
      setMidpoints((prev) => {
        const next = cloneMidpoints(prev);
        next[mIdx] = pos;
        return next;
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleAutoDetect = () => {
    if (!rotatedCanvasRef.current) return;
    const result = detectPaperCornersFromCanvas(rotatedCanvasRef.current);
    setCorners(result.corners);
    setCurvedMode(Boolean(result.edgeMidpoints));
    setMidpoints(
      result.edgeMidpoints ?? computeDefaultEdgeMidpoints(result.corners),
    );
    setActiveIdx(null);
  };

  const handleFullFrame = () => {
    const full = cloneCorners(FULL_FRAME_CORNERS);
    setCorners(full);
    setMidpoints(computeDefaultEdgeMidpoints(full));
    setActiveIdx(null);
  };

  const nudgeActiveHandle = (idx: number, dx: number, dy: number) => {
    setActiveIdx(idx);
    if (idx < 4) {
      setCorners((prev) => {
        const next = cloneCorners(prev);
        next[idx] = {
          x: Math.max(0, Math.min(1, next[idx].x + dx)),
          y: Math.max(0, Math.min(1, next[idx].y + dy)),
        };
        if (!curvedMode) setMidpoints(computeDefaultEdgeMidpoints(next));
        return next;
      });
    } else {
      const mIdx = idx - 4;
      setMidpoints((prev) => {
        const next = cloneMidpoints(prev);
        next[mIdx] = {
          x: Math.max(0, Math.min(1, next[mIdx].x + dx)),
          y: Math.max(0, Math.min(1, next[mIdx].y + dy)),
        };
        return next;
      });
    }
  };

  const activePoint =
    activeIdx === null
      ? null
      : activeIdx < 4
        ? corners[activeIdx]
        : midpoints[activeIdx - 4];
  const activeHandleLabel =
    activeIdx === null
      ? ""
      : activeIdx < 4
        ? CORNER_NAMES[activeIdx]
        : MIDPOINT_NAMES[activeIdx - 4];
  const loupeSideClass =
    activePoint && activePoint.x < 0.5 ? "right-3 top-3" : "left-3 top-3";

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      lightDismiss={false}
      title={`Sesuaikan Sudut & Lengkung — ${pageLabel}`}
      subtitle="Pilih Mode 4 Sudut Datar atau Lengkung Jilid Buku (8 Titik) untuk meluruskan warkah tebal."
      maxWidthClass="max-w-4xl"
      headerBgClass="bg-white"
      footer={
        <>
          <button
            type="button"
            onClick={handleAutoDetect}
            className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 border-[#DDD6FE] bg-[#F5F3FF] px-3.5 py-2 text-xs text-[#4C0FD1] hover:bg-[#EDE9FE]"
          >
            <Scan className="h-4 w-4" aria-hidden="true" />
            Deteksi Ulang Otomatis
          </button>
          <button
            type="button"
            onClick={handleFullFrame}
            className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-white px-3.5 py-2 text-xs text-[#111114] hover:bg-[#F9FAFB]"
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
            Pilih Penuh
          </button>
          <button
            type="button"
            onClick={() => {
              setCorners(cloneCorners(initialCorners));
              onClose();
            }}
            className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-[#F6F7F9] px-3.5 py-2 text-xs text-[#374151] hover:bg-[#E5E7EB]"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Batal
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(
                cloneCorners(corners),
                curvedMode ? cloneMidpoints(midpoints) : undefined,
              );
              onClose();
            }}
            className="nb-btn-sm wollo-cta-primary inline-flex min-h-10 items-center gap-1.5 px-4 py-2 text-xs"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Terapkan Crop
          </button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3.5">
        {/* Mode Switcher: 4-Corner Planar vs 8-Point Book Spine Dewarp */}
        <div className="flex flex-wrap items-center justify-between gap-2 self-stretch rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-pressed={!curvedMode}
              onClick={() => {
                setCurvedMode(false);
                if (activeIdx !== null && activeIdx >= 4) setActiveIdx(null);
              }}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-3 py-1 font-semibold transition-colors ${
                !curvedMode
                  ? "border-[#0E0E10] bg-[#0E0E10] text-white"
                  : "border-[#E5E7EB] bg-[#F6F7F9] text-[#374151]"
              }`}
            >
              <Scan className="h-3.5 w-3.5" aria-hidden="true" />
              4 Sudut Datar
            </button>
            <button
              type="button"
              aria-pressed={curvedMode}
              onClick={() => {
                if (!curvedMode) {
                  setMidpoints(computeDefaultEdgeMidpoints(corners));
                  setCurvedMode(true);
                }
              }}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-3 py-1 font-semibold transition-colors ${
                curvedMode
                  ? "border-[#5E17EB] bg-[#5E17EB] text-white"
                  : "border-[#E5E7EB] bg-[#F6F7F9] text-[#374151]"
              }`}
            >
              <Spline className="h-3.5 w-3.5" aria-hidden="true" />
              Lengkung Jilid Buku (8 Titik)
            </button>
          </div>
          <span className="text-[11px] font-medium text-[#4B5563]">
            {curvedMode
              ? "Seret titik wajik pink di tengah sisi untuk meratakan kertas jilid melengkung."
              : "Seret 4 titik sudut ke ujung kertas."}
          </span>
        </div>

        <div className="wollo-dark-surface relative inline-flex max-w-full items-center justify-center overflow-hidden rounded-2xl border border-[#27272A] p-2 shadow-lg">
          <canvas
            ref={stageCanvasRef}
            width={canvasDims.width}
            height={canvasDims.height}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ touchAction: "none" }}
            className="block max-h-[52dvh] max-w-full cursor-crosshair rounded-xl"
          />

          {activeIdx !== null ? (
            <div
              className={`pointer-events-none absolute ${loupeSideClass} flex flex-col items-center gap-1 rounded-2xl border border-[#E5E7EB] bg-white p-1.5 shadow-lg`}
            >
              <canvas
                ref={loupeCanvasRef}
                width={128}
                height={128}
                className="block h-20 w-20 rounded-full border-2 border-[#5E17EB] sm:h-28 sm:w-28"
              />
              <span className="nb-pill text-[10px]">
                Loupe · {activeHandleLabel}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex w-full flex-wrap items-center justify-center gap-1.5">
          {CORNER_NAMES.map((label, idx) => (
            <button
              key={label}
              type="button"
              aria-pressed={activeIdx === idx}
              onClick={() => setActiveIdx(idx)}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 0.025 : 0.005;
                if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  nudgeActiveHandle(idx, -step, 0);
                } else if (e.key === "ArrowRight") {
                  e.preventDefault();
                  nudgeActiveHandle(idx, step, 0);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  nudgeActiveHandle(idx, 0, -step);
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  nudgeActiveHandle(idx, 0, step);
                }
              }}
              className={`nb-btn-sm px-3 py-1.5 text-xs ${
                activeIdx === idx
                  ? "wollo-cta-dark"
                  : "bg-white text-[#111114] hover:bg-[#F9FAFB]"
              }`}
            >
              {label}
            </button>
          ))}
          {curvedMode
            ? MIDPOINT_NAMES.map((label, mIdx) => {
                const idx = mIdx + 4;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={activeIdx === idx}
                    onClick={() => setActiveIdx(idx)}
                    onKeyDown={(e) => {
                      const step = e.shiftKey ? 0.025 : 0.005;
                      if (e.key === "ArrowLeft") {
                        e.preventDefault();
                        nudgeActiveHandle(idx, -step, 0);
                      } else if (e.key === "ArrowRight") {
                        e.preventDefault();
                        nudgeActiveHandle(idx, step, 0);
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        nudgeActiveHandle(idx, 0, -step);
                      } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        nudgeActiveHandle(idx, 0, step);
                      }
                    }}
                    className={`nb-btn-sm px-2.5 py-1.5 text-xs ${
                      activeIdx === idx
                        ? "border-[#5E17EB] bg-[#5E17EB] text-white"
                        : "border-[#FBCFE8] bg-[#FDF2F8] text-[#9D174D]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })
            : null}
        </div>
      </div>
    </AppDialog>
  );
}
