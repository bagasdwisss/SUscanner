"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Maximize2, RotateCcw, Scan } from "lucide-react";
import { AppDialog } from "./AppDialog";
import {
  cloneCorners,
  detectPaperCornersFromCanvas,
  FULL_FRAME_CORNERS,
  renderRotatedCanvas,
} from "@/lib/document-scanner";
import type { QuadCorners } from "@/lib/su-types";

interface ManualCropModalProps {
  open: boolean;
  onClose: () => void;
  pageLabel: string;
  rawUrl: string;
  rotation: 0 | 90 | 180 | 270;
  initialCorners: QuadCorners;
  onApply: (corners: QuadCorners) => void;
}

const CORNER_NAMES = [
  "Sudut Kiri Atas",
  "Sudut Kanan Atas",
  "Sudut Kanan Bawah",
  "Sudut Kiri Bawah",
] as const;

export function ManualCropModal({
  open,
  onClose,
  pageLabel,
  rawUrl,
  rotation,
  initialCorners,
  onApply,
}: ManualCropModalProps) {
  const stageCanvasRef = useRef<HTMLCanvasElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);
  const rotatedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [corners, setCorners] = useState<QuadCorners>(() =>
    cloneCorners(initialCorners),
  );
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
        const maxDisplayH = 460;
        const scale = Math.min(
          maxDisplayW / rotCanvas.width,
          maxDisplayH / rotCanvas.height,
          1,
        );
        const w = Math.max(200, Math.round(rotCanvas.width * scale));
        const h = Math.max(160, Math.round(rotCanvas.height * scale));
        setCorners(cloneCorners(initialCorners));
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
  }, [open, rawUrl, rotation, initialCorners]);

  const drawOverlay = useCallback(() => {
    const canvas = stageCanvasRef.current;
    const rotCanvas = rotatedCanvasRef.current;
    if (!canvas || !rotCanvas || !imageReady) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width: w, height: h } = canvasDims;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(rotCanvas, 0, 0, w, h);

    // Darken exterior outside selected quadrilateral
    ctx.save();
    ctx.fillStyle = "rgba(9, 14, 23, 0.48)";
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.moveTo(corners[0].x * w, corners[0].y * h);
    ctx.lineTo(corners[3].x * w, corners[3].y * h);
    ctx.lineTo(corners[2].x * w, corners[2].y * h);
    ctx.lineTo(corners[1].x * w, corners[1].y * h);
    ctx.closePath();
    ctx.fill("evenodd");
    ctx.restore();

    // Polygon outline
    ctx.save();
    ctx.strokeStyle = "#2dd4bf";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    corners.forEach((pt, idx) => {
      const px = pt.x * w;
      const py = pt.y * h;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();

    // Corner handles
    corners.forEach((pt, idx) => {
      const px = pt.x * w;
      const py = pt.y * h;
      const isSelected = activeIdx === idx;
      ctx.beginPath();
      ctx.arc(px, py, isSelected ? 12 : 10, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "#0f766e" : "#ffffff";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = isSelected ? "#ffffff" : "#0f766e";
      ctx.stroke();
    });
    ctx.restore();

    // Draw Magnifier Loupe when dragging or nudging an active corner
    const loupe = loupeCanvasRef.current;
    if (loupe && activeIdx !== null) {
      const lCtx = loupe.getContext("2d");
      if (lCtx) {
        const pt = corners[activeIdx];
        const srcX = pt.x * rotCanvas.width;
        const srcY = pt.y * rotCanvas.height;
        const zoomRadius = 46;
        const lSize = loupe.width;

        lCtx.clearRect(0, 0, lSize, lSize);
        lCtx.fillStyle = "#0f172a";
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

        // Crosshair
        lCtx.strokeStyle = "#14b8a6";
        lCtx.lineWidth = 1.5;
        lCtx.beginPath();
        lCtx.moveTo(lSize / 2, 0);
        lCtx.lineTo(lSize / 2, lSize);
        lCtx.moveTo(0, lSize / 2);
        lCtx.lineTo(lSize, lSize / 2);
        lCtx.stroke();
      }
    }
  }, [activeIdx, canvasDims, corners, imageReady]);

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

    let closestIdx = 0;
    let minDist = Infinity;
    corners.forEach((pt, idx) => {
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
    setCorners((prev) => {
      const next = cloneCorners(prev);
      next[activeIdx] = pos;
      return next;
    });
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
    setActiveIdx(null);
  };

  const handleFullFrame = () => {
    setCorners(cloneCorners(FULL_FRAME_CORNERS));
    setActiveIdx(null);
  };

  const nudgeActiveCorner = (idx: number, dx: number, dy: number) => {
    setActiveIdx(idx);
    setCorners((prev) => {
      const next = cloneCorners(prev);
      next[idx] = {
        x: Math.max(0, Math.min(1, next[idx].x + dx)),
        y: Math.max(0, Math.min(1, next[idx].y + dy)),
      };
      return next;
    });
  };

  const loupeSideClass =
    activeIdx !== null && corners[activeIdx].x < 0.5
      ? "right-3 top-3"
      : "left-3 top-3";

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      lightDismiss={false}
      title={`Sesuaikan Sudut Kertas — ${pageLabel}`}
      subtitle="Seret 4 titik sudut ke tepi kertas atau gunakan tombol panah keyboard saat sudut dipilih."
      maxWidthClass="max-w-4xl"
      footer={
        <>
          <button
            type="button"
            onClick={handleAutoDetect}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--border-control)] bg-[var(--surface-card)] px-3.5 py-2 text-sm font-semibold text-[var(--ink-primary)] transition-colors hover:bg-[var(--surface-muted)]"
          >
            <Scan className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            Deteksi Ulang Otomatis
          </button>
          <button
            type="button"
            onClick={handleFullFrame}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--border-control)] bg-[var(--surface-card)] px-3.5 py-2 text-sm font-semibold text-[var(--ink-primary)] transition-colors hover:bg-[var(--surface-muted)]"
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
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3.5 py-2 text-sm font-semibold text-[var(--ink-secondary)] transition-colors hover:bg-[var(--surface-muted)]"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Batal
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(cloneCorners(corners));
              onClose();
            }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] transition-opacity hover:opacity-90"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Terapkan Crop
          </button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <div className="relative inline-flex max-w-full items-center justify-center overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-slate-900/90 p-2">
          <canvas
            ref={stageCanvasRef}
            width={canvasDims.width}
            height={canvasDims.height}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ touchAction: "none" }}
            className="block max-h-[55dvh] max-w-full cursor-crosshair rounded-lg"
          />

          {activeIdx !== null ? (
            <div
              className={`pointer-events-none absolute ${loupeSideClass} flex flex-col items-center gap-1 rounded-xl border-2 border-[var(--accent)] bg-slate-950/90 p-1.5 shadow-xl`}
            >
              <canvas
                ref={loupeCanvasRef}
                width={128}
                height={128}
                className="block h-28 w-28 rounded-full border border-white/25"
              />
              <span className="text-[11px] font-semibold text-teal-300">
                Loupe · {CORNER_NAMES[activeIdx]}
              </span>
            </div>
          ) : null}
        </div>

        {/* Accessible keyboard corner selection & arrow-key nudge controls */}
        <div className="flex flex-wrap items-center justify-center gap-2">
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
                  nudgeActiveCorner(idx, -step, 0);
                } else if (e.key === "ArrowRight") {
                  e.preventDefault();
                  nudgeActiveCorner(idx, step, 0);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  nudgeActiveCorner(idx, 0, -step);
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  nudgeActiveCorner(idx, 0, step);
                }
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeIdx === idx
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--ink-secondary)] hover:bg-[var(--surface-muted)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </AppDialog>
  );
}
