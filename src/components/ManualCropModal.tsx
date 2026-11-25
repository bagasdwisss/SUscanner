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

    ctx.save();
    ctx.fillStyle = "rgba(17, 17, 17, 0.52)";
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.moveTo(corners[0].x * w, corners[0].y * h);
    ctx.lineTo(corners[3].x * w, corners[3].y * h);
    ctx.lineTo(corners[2].x * w, corners[2].y * h);
    ctx.lineTo(corners[1].x * w, corners[1].y * h);
    ctx.closePath();
    ctx.fill("evenodd");
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "#fde047";
    ctx.lineWidth = 3;
    ctx.beginPath();
    corners.forEach((pt, idx) => {
      const px = pt.x * w;
      const py = pt.y * h;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();

    corners.forEach((pt, idx) => {
      const px = pt.x * w;
      const py = pt.y * h;
      const isSelected = activeIdx === idx;
      ctx.beginPath();
      ctx.arc(px, py, isSelected ? 12 : 10, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "#fde047" : "#ffffff";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#111111";
      ctx.stroke();
    });
    ctx.restore();

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
        lCtx.fillStyle = "#111111";
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

        lCtx.strokeStyle = "#fde047";
        lCtx.lineWidth = 2;
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
      headerBgClass="bg-[#BAE6FD]"
      footer={
        <>
          <button
            type="button"
            onClick={handleAutoDetect}
            className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-[#FEF08A] px-3.5 py-2 text-xs text-[#111111]"
          >
            <Scan className="h-4 w-4" aria-hidden="true" />
            Deteksi Ulang Otomatis
          </button>
          <button
            type="button"
            onClick={handleFullFrame}
            className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-white px-3.5 py-2 text-xs text-[#111111]"
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
            className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-[#FBCFE8] px-3.5 py-2 text-xs text-[#111111]"
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
            className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-[#D9F99D] px-4 py-2 text-xs text-[#111111]"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Terapkan Crop
          </button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <div className="nb-card relative inline-flex max-w-full items-center justify-center overflow-hidden bg-[#141414] p-2">
          <canvas
            ref={stageCanvasRef}
            width={canvasDims.width}
            height={canvasDims.height}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ touchAction: "none" }}
            className="block max-h-[55dvh] max-w-full cursor-crosshair rounded-xl"
          />

          {activeIdx !== null ? (
            <div
              className={`pointer-events-none absolute ${loupeSideClass} flex flex-col items-center gap-1 rounded-2xl border-2 border-[#111111] bg-[#FEF08A] p-1.5 shadow-[3px_3px_0px_#111111]`}
            >
              <canvas
                ref={loupeCanvasRef}
                width={128}
                height={128}
                className="block h-28 w-28 rounded-full border-2 border-[#111111]"
              />
              <span className="nb-pill text-[10px]">
                Loupe · {CORNER_NAMES[activeIdx]}
              </span>
            </div>
          ) : null}
        </div>

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
              className={`nb-btn-sm px-3 py-1.5 text-xs ${
                activeIdx === idx
                  ? "bg-[#111111] text-[#FEF08A]"
                  : "bg-white text-[#111111]"
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
