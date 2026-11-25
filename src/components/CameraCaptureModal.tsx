"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, FolderOpen, RefreshCw, VideoOff } from "lucide-react";
import { AppDialog } from "./AppDialog";

interface CameraCaptureModalProps {
  open: boolean;
  slotLabel: string;
  onClose: () => void;
  onCaptureFile: (file: File) => void;
}

export function CameraCaptureModal({
  open,
  slotLabel,
  onClose,
  onCaptureFile,
}: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);

  const [facingMode, setFacingMode] = useState<"environment" | "user">(
    "environment",
  );
  const [status, setStatus] = useState<"starting" | "ready" | "error">(
    "starting",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

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
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
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

  const handleTakeSnapshot = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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
      0.93,
    );
  };

  const handleClose = () => {
    stopStream();
    setStatus("starting");
    setErrorMessage(null);
    onClose();
  };

  return (
    <AppDialog
      open={open}
      onClose={handleClose}
      title={`Ambil Foto Kamera — ${slotLabel}`}
      subtitle="Posisikan dokumen Surat Ukur rata di dalam bingkai lalu tekan Ambil Foto."
      maxWidthClass="max-w-2xl"
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
            Pilih dari Kamera / Galeri Sistem
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
            className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-[#FEF08A] px-4 py-2 text-xs text-[#111111] disabled:opacity-50"
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            Ambil Foto
          </button>
        </>
      }
    >
      <div className="nb-card relative flex min-h-[280px] flex-col items-center justify-center overflow-hidden bg-[#141414]">
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
              className="max-h-[55dvh] w-full object-contain"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-4 rounded-xl border-2 border-dashed border-[#FDE047]"
            />
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
    </AppDialog>
  );
}
