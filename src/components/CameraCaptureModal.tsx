"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  FolderOpen,
  Maximize2,
  RefreshCw,
  Scan,
  VideoOff,
} from "lucide-react";
import { AppDialog } from "./AppDialog";

type CameraFrameMode = "portrait" | "landscape" | "full";

interface CameraCaptureModalProps {
  open: boolean;
  slotLabel: string;
  onClose: () => void;
  onCaptureFile: (file: File) => void;
}

interface BoxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clamp(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val;
}

/**
 * Evaluates live camera target-box borders by comparing inside vs outside brightness/color
 * on a fast small canvas so the operator gets instant "Tepi Pas" feedback.
 */
function checkTargetEdgesAligned(
  video: HTMLVideoElement,
  vpRect: BoxRect,
  targetRect: BoxRect,
): boolean {
  if (video.videoWidth === 0 || video.videoHeight === 0 || vpRect.width <= 0 || vpRect.height <= 0) {
    return false;
  }

  const probeW = 160;
  const probeH = Math.max(90, Math.round((video.videoHeight / video.videoWidth) * probeW));
  const canvas = document.createElement("canvas");
  canvas.width = probeW;
  canvas.height = probeH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;

  ctx.drawImage(video, 0, 0, probeW, probeH);
  const { data } = ctx.getImageData(0, 0, probeW, probeH);

  const nx0 = clamp((targetRect.left - vpRect.left) / vpRect.width, 0, 1);
  const ny0 = clamp((targetRect.top - vpRect.top) / vpRect.height, 0, 1);
  const nx1 = clamp((targetRect.left + targetRect.width - vpRect.left) / vpRect.width, 0, 1);
  const ny1 = clamp((targetRect.top + targetRect.height - vpRect.top) / vpRect.height, 0, 1);

  const lumAt = (nx: number, ny: number): number => {
    const px = clamp(Math.round(nx * (probeW - 1)), 0, probeW - 1);
    const py = clamp(Math.round(ny * (probeH - 1)), 0, probeH - 1);
    const p = (py * probeW + px) * 4;
    return 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  };

  let alignedSides = 0;
  const checkEdge = (pts: Array<{ inPt: [number, number]; outPt: [number, number] }>) => {
    let contrastHits = 0;
    let brightInside = 0;
    for (const { inPt, outPt } of pts) {
      const lIn = lumAt(inPt[0], inPt[1]);
      const lOut = lumAt(outPt[0], outPt[1]);
      if (lIn >= 120) brightInside++;
      if (Math.abs(lIn - lOut) >= 16 && lIn > lOut + 8) contrastHits++;
    }
    return brightInside >= pts.length * 0.6 && contrastHits >= pts.length * 0.35;
  };

  const samples = [0.25, 0.4, 0.55, 0.7, 0.8];
  const off = 0.035;
  if (
    checkEdge(
      samples.map((t) => ({
        inPt: [nx0 + (nx1 - nx0) * t, clamp(ny0 + off, 0, 1)],
        outPt: [nx0 + (nx1 - nx0) * t, clamp(ny0 - off, 0, 1)],
      })),
    )
  ) {
    alignedSides++;
  }
  if (
    checkEdge(
      samples.map((t) => ({
        inPt: [nx0 + (nx1 - nx0) * t, clamp(ny1 - off, 0, 1)],
        outPt: [nx0 + (nx1 - nx0) * t, clamp(ny1 + off, 0, 1)],
      })),
    )
  ) {
    alignedSides++;
  }
  if (
    checkEdge(
      samples.map((t) => ({
        inPt: [clamp(nx0 + off, 0, 1), ny0 + (ny1 - ny0) * t],
        outPt: [clamp(nx0 - off, 0, 1), ny0 + (ny1 - ny0) * t],
      })),
    )
  ) {
    alignedSides++;
  }
  if (
    checkEdge(
      samples.map((t) => ({
        inPt: [clamp(nx1 - off, 0, 1), ny0 + (ny1 - ny0) * t],
        outPt: [clamp(nx1 + off, 0, 1), ny0 + (ny1 - ny0) * t],
      })),
    )
  ) {
    alignedSides++;
  }

  return alignedSides >= 3;
}

export function CameraCaptureModal({
  open,
  slotLabel,
  onClose,
  onCaptureFile,
}: CameraCaptureModalProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoViewportRef = useRef<HTMLDivElement>(null);
  const targetBoxRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);

  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment",
  );
  const [frameMode, setFrameMode] = useState<CameraFrameMode>("portrait");
  const [cropToTarget, setCropToTarget] = useState(true);
  const [edgesLocked, setEdgesLocked] = useState(false);
  const [status, setStatus] = useState<"starting" | "ready" | "error">(
    "starting",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [videoDims, setVideoDims] = useState<{ w: number; h: number } | null>(
    null,
  );
  const [stageDims, setStageDims] = useState<{ w: number; h: number } | null>(
    null,
  );

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!open || !stageRef.current) return;
    const el = stageRef.current;
    const updateStage = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageDims({ w: rect.width, h: rect.height });
      }
    };
    updateStage();
    if (typeof ResizeObserver === "function") {
      const obs = new ResizeObserver(updateStage);
      obs.observe(el);
      return () => obs.disconnect();
    }
    window.addEventListener("resize", updateStage);
    return () => window.removeEventListener("resize", updateStage);
  }, [open, status]);

  useEffect(() => {
    if (!open) {
      stopStream();
      return;
    }

    let cancelled = false;

    const startCamera = async () => {
      stopStream();

      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        await Promise.resolve();
        if (!cancelled) {
          setStatus("error");
          setErrorMessage(
            "Akses kamera langsung (getUserMedia) tidak didukung atau halaman tidak berjalan di HTTPS / localhost. Gunakan tombol Pilih dari Kamera / Galeri Sistem di bawah.",
          );
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 2560 },
            height: { ideal: 1920 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // Request continuous document autofocus silently when supported by device
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.applyConstraints === "function") {
          void track
            .applyConstraints({
              advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
            })
            .catch(() => undefined);
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
          if (videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
            const vw = videoRef.current.videoWidth;
            const vh = videoRef.current.videoHeight;
            setVideoDims({ w: vw, h: vh });
            setFrameMode(vw >= vh ? "landscape" : "portrait");
          }
        }

        if (typeof navigator.mediaDevices.enumerateDevices === "function") {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((d) => d.kind === "videoinput");
          if (!cancelled) {
            setHasMultipleCameras(videoInputs.length > 1);
          }
        }

        if (!cancelled) {
          setStatus("ready");
          setErrorMessage(null);
        }
      } catch (err) {
        if (cancelled) return;
        let msg =
          "Tidak dapat mengakses kamera perangkat. Pastikan kamera terpasang dan izin kamera diberikan di browser.";
        if (err instanceof Error) {
          if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
            msg =
              "Izin kamera ditolak oleh browser. Aktifkan izin kamera pada ikon gembok di address bar, atau gunakan pilihan file perangkat di bawah.";
          } else if (
            err.name === "NotFoundError" ||
            err.name === "DevicesNotFoundError"
          ) {
            msg =
              "Tidak ada perangkat kamera yang terdeteksi di komputer/HP ini. Anda tetap dapat mengunggah foto dari perangkat.";
          } else if (
            err.name === "NotReadableError" ||
            err.name === "TrackStartError"
          ) {
            msg =
              "Kamera sedang dipakai oleh aplikasi lain. Tutup aplikasi lain atau unggah foto dari file.";
          }
        }
        setStatus("error");
        setErrorMessage(msg);
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [open, facingMode, stopStream]);

  // Compute exact displayed video box inside stage container so the target frame never falls onto black bars
  const containedVideoRect: BoxRect | null = (() => {
    if (!stageDims || !videoDims || videoDims.w === 0 || videoDims.h === 0) {
      return null;
    }
    const stageRatio = stageDims.w / stageDims.h;
    const vidRatio = videoDims.w / videoDims.h;
    if (stageRatio > vidRatio) {
      const h = stageDims.h;
      const w = h * vidRatio;
      return {
        left: (stageDims.w - w) / 2,
        top: 0,
        width: w,
        height: h,
      };
    }
    const w = stageDims.w;
    const h = w / vidRatio;
    return {
      left: 0,
      top: (stageDims.h - h) / 2,
      width: w,
      height: h,
    };
  })();

  // Compute crisp document-proportioned target frame inside contained video area
  const targetOverlayRect: BoxRect | null = (() => {
    if (!containedVideoRect) return null;
    const { width: vw, height: vh } = containedVideoRect;
    if (frameMode === "full") {
      const padX = Math.round(vw * 0.03);
      const padY = Math.round(vh * 0.03);
      return {
        left: padX,
        top: padY,
        width: Math.max(40, vw - padX * 2),
        height: Math.max(40, vh - padY * 2),
      };
    }

    // F4/Folio Surat Ukur proportion (~210x330 mm)
    const ratio = frameMode === "portrait" ? 210 / 330 : 330 / 210;
    const maxW = vw * 0.9;
    const maxH = vh * 0.9;
    let tw = maxW;
    let th = tw / ratio;
    if (th > maxH) {
      th = maxH;
      tw = th * ratio;
    }
    return {
      left: Math.round((vw - tw) / 2),
      top: Math.round((vh - th) / 2),
      width: Math.max(48, Math.round(tw)),
      height: Math.max(48, Math.round(th)),
    };
  })();

  // Live lightweight edge alignment detector while framing SU
  useEffect(() => {
    if (!open || status !== "ready" || frameMode === "full") {
      return;
    }

    const interval = setInterval(() => {
      const video = videoRef.current;
      const vpEl = videoViewportRef.current;
      const tbEl = targetBoxRef.current;
      if (!video || !vpEl || !tbEl) return;

      const vp = vpEl.getBoundingClientRect();
      const tb = tbEl.getBoundingClientRect();
      const aligned = checkTargetEdgesAligned(
        video,
        { left: vp.left, top: vp.top, width: vp.width, height: vp.height },
        { left: tb.left, top: tb.top, width: tb.width, height: tb.height },
      );
      setEdgesLocked(aligned);
    }, 360);

    return () => clearInterval(interval);
  }, [open, status, frameMode]);

  const isEdgesLocked =
    open && status === "ready" && frameMode !== "full" && edgesLocked;

  const handleTakeSnapshot = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    let sx = 0;
    let sy = 0;
    let sw = video.videoWidth;
    let sh = video.videoHeight;

    if (
      cropToTarget &&
      frameMode !== "full" &&
      videoViewportRef.current &&
      targetBoxRef.current
    ) {
      const vpRect = videoViewportRef.current.getBoundingClientRect();
      const tbRect = targetBoxRef.current.getBoundingClientRect();
      if (vpRect.width > 10 && vpRect.height > 10) {
        const nx = clamp((tbRect.left - vpRect.left) / vpRect.width, 0, 1);
        const ny = clamp((tbRect.top - vpRect.top) / vpRect.height, 0, 1);
        const nw = clamp(tbRect.width / vpRect.width, 0.1, 1 - nx);
        const nh = clamp(tbRect.height / vpRect.height, 0.1, 1 - ny);

        sx = Math.round(nx * video.videoWidth);
        sy = Math.round(ny * video.videoHeight);
        sw = Math.max(48, Math.round(nw * video.videoWidth));
        sh = Math.max(48, Math.round(nh * video.videoHeight));
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `camera-su-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        stopStream();
        setStatus("starting");
        setErrorMessage(null);
        onCaptureFile(file);
        onClose();
      },
      "image/jpeg",
      0.95,
    );
  };

  const handleClose = () => {
    stopStream();
    setStatus("starting");
    setErrorMessage(null);
    onClose();
  };

  const bracketColor = isEdgesLocked ? "border-[#D9F99D]" : "border-[#FDE047]";
  const frameBorderColor = isEdgesLocked
    ? "border-[#D9F99D]/90"
    : "border-[#FDE047]/80";

  return (
    <AppDialog
      open={open}
      onClose={handleClose}
      title={`Ambil Foto Kamera — ${slotLabel}`}
      subtitle="Sejajarkan ke-4 tepi Surat Ukur tepat di garis target. Hasil foto otomatis dipotong pas sesuai kotak target."
      maxWidthClass="max-w-3xl"
      headerBgClass="bg-[#D9F99D]"
      footer={
        <>
          <input
            ref={fallbackInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                stopStream();
                setStatus("starting");
                setErrorMessage(null);
                onCaptureFile(file);
                onClose();
              }
              e.target.value = "";
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fallbackInputRef.current?.click()}
            className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-[#BAE6FD] px-3.5 py-2 text-xs text-[#111111]"
          >
            <FolderOpen className="h-4 w-4" aria-hidden="true" />
            Kamera / Galeri Sistem
          </button>

          {hasMultipleCameras && status === "ready" ? (
            <button
              type="button"
              onClick={() => {
                setStatus("starting");
                setErrorMessage(null);
                setFacingMode((m) =>
                  m === "environment" ? "user" : "environment",
                );
              }}
              className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-white px-3.5 py-2 text-xs text-[#111111]"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Ganti Kamera
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleClose}
            className="nb-btn-sm inline-flex min-h-10 items-center bg-[#FBCFE8] px-3.5 py-2 text-xs text-[#111111]"
          >
            Batal
          </button>

          <button
            type="button"
            disabled={status !== "ready"}
            onClick={handleTakeSnapshot}
            className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-[#FEF08A] px-4 py-2 text-xs font-black text-[#111111] disabled:opacity-50"
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            Ambil Foto
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {/* Framing Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[#111111] bg-white px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="nb-micro mr-1 text-[#3F3F46]">Kotak Target:</span>
            {(
              [
                { id: "portrait", label: "Potret SU" },
                { id: "landscape", label: "Lanskap SU" },
                { id: "full", label: "Penuh" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={frameMode === opt.id}
                onClick={() => setFrameMode(opt.id)}
                className={`inline-flex min-h-8 items-center gap-1 rounded-lg border-2 border-[#111111] px-2.5 py-1 text-[11px] font-extrabold ${
                  frameMode === opt.id
                    ? "bg-[#111111] text-[#FEF08A]"
                    : "bg-[#F6F5F0] text-[#111111] hover:bg-[#FEF08A]"
                }`}
              >
                {opt.id === "full" ? (
                  <Maximize2 className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <Scan className="h-3 w-3" aria-hidden="true" />
                )}
                {opt.label}
              </button>
            ))}
          </div>

          {frameMode !== "full" ? (
            <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border-2 border-[#111111] bg-[#D9F99D] px-2.5 py-1 text-[11px] font-extrabold text-[#111111]">
              <input
                type="checkbox"
                checked={cropToTarget}
                onChange={(e) => setCropToTarget(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Potong Sesuai Kotak
            </label>
          ) : null}
        </div>

        {/* Camera Stage with Video-Locked Precision Target Box */}
        <div
          ref={stageRef}
          className="nb-card relative flex h-[54dvh] min-h-[300px] w-full flex-col items-center justify-center overflow-hidden bg-[#141414]"
        >
          {status === "error" ? (
            <div className="flex max-w-md flex-col items-center gap-3 p-6 text-center text-[#F6F5F0]">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-[#111111] bg-[#FEF08A] text-[#111111] shadow-[3px_3px_0px_#FBCFE8]">
                <VideoOff className="h-7 w-7" aria-hidden="true" />
              </div>
              <p className="text-sm font-extrabold">
                Kamera Langsung Tidak Tersedia
              </p>
              <p className="text-xs leading-relaxed text-zinc-300">
                {errorMessage}
              </p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={(e) => {
                  const vid = e.currentTarget;
                  if (vid.videoWidth > 0 && vid.videoHeight > 0) {
                    setVideoDims({ w: vid.videoWidth, h: vid.videoHeight });
                    setFrameMode(vid.videoWidth >= vid.videoHeight ? "landscape" : "portrait");
                  }
                }}
                className="h-full w-full object-contain"
              />

              {/* Exact overlay mapped strictly over rendered <video> pixels */}
              {containedVideoRect && targetOverlayRect ? (
                <div
                  ref={videoViewportRef}
                  aria-hidden="true"
                  style={{
                    left: `${containedVideoRect.left}px`,
                    top: `${containedVideoRect.top}px`,
                    width: `${containedVideoRect.width}px`,
                    height: `${containedVideoRect.height}px`,
                  }}
                  className="pointer-events-none absolute overflow-hidden"
                >
                  <div
                    ref={targetBoxRef}
                    style={{
                      left: `${targetOverlayRect.left}px`,
                      top: `${targetOverlayRect.top}px`,
                      width: `${targetOverlayRect.width}px`,
                      height: `${targetOverlayRect.height}px`,
                      boxShadow:
                        frameMode === "full"
                          ? "none"
                          : "0 0 0 9999px rgba(17, 17, 17, 0.56)",
                    }}
                    className={`absolute rounded-lg border-2 ${frameBorderColor} transition-colors duration-150`}
                  >
                    {/* Crisp 4 Corner Alignment L-Brackets */}
                    <span
                      className={`absolute -left-0.5 -top-0.5 h-6 w-6 rounded-tl-md border-l-4 border-t-4 ${bracketColor}`}
                    />
                    <span
                      className={`absolute -right-0.5 -top-0.5 h-6 w-6 rounded-tr-md border-r-4 border-t-4 ${bracketColor}`}
                    />
                    <span
                      className={`absolute -bottom-0.5 -left-0.5 h-6 w-6 rounded-bl-md border-b-4 border-l-4 ${bracketColor}`}
                    />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-br-md border-b-4 border-r-4 ${bracketColor}`}
                    />

                    {/* Midpoint Edge Alignment Ticks */}
                    <span
                      className={`absolute left-1/2 top-0 h-1.5 w-8 -translate-x-1/2 rounded-b ${
                        isEdgesLocked ? "bg-[#D9F99D]" : "bg-[#FDE047]"
                      }`}
                    />
                    <span
                      className={`absolute bottom-0 left-1/2 h-1.5 w-8 -translate-x-1/2 rounded-t ${
                        isEdgesLocked ? "bg-[#D9F99D]" : "bg-[#FDE047]"
                      }`}
                    />
                    <span
                      className={`absolute left-0 top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-r ${
                        isEdgesLocked ? "bg-[#D9F99D]" : "bg-[#FDE047]"
                      }`}
                    />
                    <span
                      className={`absolute right-0 top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-l ${
                        isEdgesLocked ? "bg-[#D9F99D]" : "bg-[#FDE047]"
                      }`}
                    />

                    {/* Subtle internal rule-of-thirds guides for straight paper edges */}
                    <div className="absolute inset-x-0 top-1/3 border-t border-dashed border-white/25" />
                    <div className="absolute inset-x-0 top-2/3 border-t border-dashed border-white/25" />
                    <div className="absolute inset-y-0 left-1/3 border-l border-dashed border-white/25" />
                    <div className="absolute inset-y-0 left-2/3 border-l border-dashed border-white/25" />
                  </div>
                </div>
              ) : null}

              {/* Status pill on camera viewfinder */}
              {status === "ready" ? (
                <div className="pointer-events-none absolute bottom-2.5 left-1/2 z-10 -translate-x-1/2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border-2 border-[#111111] px-3 py-1 text-[11px] font-extrabold text-[#111111] shadow-[2px_2px_0px_#111111] ${
                      isEdgesLocked ? "bg-[#D9F99D]" : "bg-[#FEF08A]"
                    }`}
                  >
                    {isEdgesLocked ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Tepi Kertas Pas · Siap Ambil Foto
                      </>
                    ) : (
                      <>
                        <Scan className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Paskan ke-4 tepi kertas SU ke garis kotak target
                      </>
                    )}
                  </span>
                </div>
              ) : null}

              {status === "starting" ? (
                <div
                  role="status"
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-[#141414]/85 text-[#F6F5F0]"
                >
                  <span className="text-xs font-extrabold tracking-wide uppercase">
                    Mengaktifkan kamera perangkat…
                  </span>
                  <progress
                    aria-label="Mengaktifkan kamera"
                    className="su-progress h-2 w-44"
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </AppDialog>
  );
}
