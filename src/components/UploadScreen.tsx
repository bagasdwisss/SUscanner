"use client";

import { useRef, useState } from "react";
import {
  Camera,
  CheckCircle2,
  FileText,
  FolderOpen,
  Images,
  Map as MapIcon,
  Sparkles,
} from "lucide-react";
import type { PageSlot } from "@/lib/su-types";

const ACCEPT_IMAGES =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";

interface UploadScreenProps {
  onSelectSlotFiles: (slot: PageSlot, files: File[]) => void;
  onSelectBatchFiles: (files: File[]) => void;
  onOpenCamera: (slot: PageSlot) => void;
  isDecoding: boolean;
}

interface DropzoneCardProps {
  slot: PageSlot;
  numberLabel: string;
  badge: string;
  accentDotClass: string;
  title: string;
  footnote: string;
  icon: "doc" | "map";
  onFiles: (slot: PageSlot, files: File[]) => void;
  onOpenCamera: (slot: PageSlot) => void;
  disabled: boolean;
}

function DropzoneCard({
  slot,
  numberLabel,
  badge,
  accentDotClass,
  title,
  footnote,
  icon,
  onFiles,
  onOpenCamera,
  disabled,
}: DropzoneCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) {
      onFiles(slot, dropped);
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`nb-card flex flex-col justify-between p-5 transition-colors sm:p-6 ${
        isDragging
          ? "border-[#5E17EB] bg-[#F5F3FF]"
          : "bg-white hover:border-[#D1D5DB]"
      }`}
    >
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="nb-pill">
            <span
              className={`h-2 w-2 rounded-full ${accentDotClass}`}
              aria-hidden="true"
            />
            {badge}
          </span>
          <span className="font-mono text-2xl font-extrabold leading-none tracking-tight text-[#111114]/20">
            {numberLabel}
          </span>
        </div>

        <h2 className="mt-3 text-lg font-bold tracking-tight text-[#111114]">
          {title}
        </h2>

        <div
          className={`mt-4 flex flex-col items-center rounded-2xl border border-dashed px-4 py-5 text-center transition-colors ${
            isDragging
              ? "border-[#5E17EB] bg-white"
              : "border-[#D1D5DB] bg-[#F6F7F9]"
          }`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white text-[#5E17EB] shadow-xs">
            {icon === "doc" ? (
              <FileText className="h-6 w-6" aria-hidden="true" />
            ) : (
              <MapIcon className="h-6 w-6" aria-hidden="true" />
            )}
          </div>

          <p className="mt-3 text-sm font-semibold text-[#111114]">
            Tarik &amp; lepas gambar di sini
          </p>
          <p className="mt-0.5 text-xs font-medium text-[#4B5563]">
            Mendukung JPG, PNG, WEBP, HEIC
          </p>

          <div className="mt-4 flex w-full flex-wrap items-center justify-center gap-2.5 sm:w-auto">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_IMAGES}
              multiple
              disabled={disabled}
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const files = e.target.files ? Array.from(e.target.files) : [];
                if (files.length > 0) onFiles(slot, files);
                e.target.value = "";
              }}
              className="hidden"
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              className="nb-btn wollo-cta-primary inline-flex min-h-11 flex-1 items-center justify-center gap-2 px-4 py-2 text-xs font-semibold disabled:opacity-60 sm:flex-none sm:text-sm"
            >
              <FolderOpen className="h-4 w-4" aria-hidden="true" />
              Pilih File
            </button>

            <button
              type="button"
              disabled={disabled}
              onClick={() => onOpenCamera(slot)}
              className="nb-btn inline-flex min-h-11 flex-1 items-center justify-center gap-2 bg-white px-4 py-2 text-xs font-semibold text-[#374151] hover:border-[#D1D5DB] hover:bg-[#F9FAFB] disabled:opacity-60 sm:flex-none sm:text-sm"
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
              Kamera
            </button>
          </div>
        </div>
      </div>

      <p className="mt-3.5 text-xs font-medium text-[#4B5563]">{footnote}</p>
    </div>
  );
}

function Pop3dCardShowcase({
  parallax,
}: {
  parallax: { x: number; y: number };
}) {
  return (
    <div
      aria-hidden="true"
      className="wollo-enter-3 relative mx-auto mt-4 w-full max-w-[920px] overflow-hidden rounded-t-[28px] pt-6 sm:pt-9"
    >
      <div className="relative mx-auto h-[178px] w-[94%] sm:h-[224px] sm:w-[90%]">
        {/* Layer 1 (Back — Yellow #FBD93B) */}
        <div
          style={{
            transform: `translate3d(${parallax.x * 0.4}px, ${parallax.y * 0.4}px, 0) rotate(-1deg)`,
          }}
          className="absolute inset-x-4 top-0 h-[168px] rounded-[26px] border border-[#EAB308]/40 bg-[#FBD93B] shadow-[0_-8px_24px_rgba(25,10,65,0.08)] transition-transform duration-150 sm:inset-x-8 sm:h-[212px] sm:rounded-[30px]"
        >
          <div className="flex items-center justify-end px-6 pt-3 sm:px-8 sm:pt-3.5">
            <span className="rounded-full bg-[#111114]/10 px-3 py-0.5 font-mono text-[11px] font-bold text-[#111114]">
              SU.00006.2007.M.02246.pdf
            </span>
          </div>
        </div>

        {/* Layer 2 (Middle — Pink Magenta #F562AE) */}
        <div
          style={{
            transform: `translate3d(${parallax.x * 0.7}px, ${parallax.y * 0.7}px, 0) rotate(-3.2deg)`,
          }}
          className="absolute inset-x-2 top-5 h-[170px] rounded-[26px] bg-[#F562AE] shadow-[0_-8px_24px_rgba(25,10,65,0.12)] transition-transform duration-150 sm:inset-x-4 sm:top-7 sm:h-[214px] sm:rounded-[30px]"
        >
          <div className="flex items-center justify-between px-6 pt-3 text-[11px] font-bold text-white/95 sm:px-8 sm:pt-3.5">
            <span>Auto-Folder Bertingkat</span>
            <span className="font-mono">/ Kecamatan / Kelurahan</span>
          </div>
        </div>

        {/* Layer 3 (Front — Deep Purple Sheen #4A0EC4 -> #420BB3) */}
        <div
          style={{
            background: "linear-gradient(135deg, #5614D6 0%, #420BB3 100%)",
            transform: `translate3d(${parallax.x}px, ${parallax.y}px, 0) rotate(-4.5deg)`,
          }}
          className="absolute inset-x-0 top-10 flex h-[178px] items-center justify-between overflow-hidden rounded-[26px] px-5 pb-4 pt-3 text-white shadow-[0_-10px_28px_rgba(25,10,65,0.2)] transition-transform duration-150 sm:top-13 sm:h-[222px] sm:rounded-[32px] sm:px-10"
        >
          {/* Left Internal: Concentric Radar Rings + 3D Glossy Sphere */}
          <div className="relative flex items-center gap-4 sm:gap-6">
            <div className="relative flex h-28 w-28 shrink-0 items-center justify-center sm:h-36 sm:w-36">
              <div className="absolute inset-0 rounded-full border border-white/25" />
              <div className="absolute inset-3.5 rounded-full border border-white/30" />
              <div className="absolute inset-7 rounded-full border border-white/35" />
              <div
                style={{
                  background:
                    "radial-gradient(circle at 30% 30%, #FFF7ED 0%, #C4B5FD 45%, #4338CA 100%)",
                }}
                className="relative h-14 w-14 rounded-full shadow-[0_12px_28px_rgba(51,6,143,0.45)] sm:h-16 sm:w-16"
              >
                <span className="absolute right-2.5 top-2.5 h-3 w-3 rounded-full bg-white/80 blur-[1px]" />
              </div>
            </div>

            <div className="hidden text-left sm:block">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white/95 backdrop-blur-xs">
                <CheckCircle2 className="h-3 w-3 text-[#FBD93B]" />
                Vision AI + OCR Cadangan
              </span>
              <p className="mt-2 text-base font-bold tracking-tight text-white">
                4 Sudut Kertas Lurus Otomatis
              </p>
              <p className="mt-0.5 text-xs text-white/80">
                Mendukung SU lama era 1960-an hingga 2 lembar modern.
              </p>
            </div>
          </div>

          {/* Right Internal: 3D Extruded Pop Seal & Motion Lines */}
          <div className="relative flex shrink-0 items-center gap-3">
            <div className="hidden flex-col items-end gap-1.5 opacity-60 md:flex">
              <span className="h-0.5 w-10 rounded-full bg-white/70" />
              <span className="h-0.5 w-6 rounded-full bg-[#C4B5FD]" />
              <span className="h-0.5 w-8 rounded-full bg-white/50" />
            </div>

            <div className="wollo-float-3d relative h-24 w-24 sm:h-28 sm:w-28">
              <svg
                viewBox="0 0 120 120"
                className="h-full w-full drop-shadow-[0_12px_18px_rgba(17,17,20,0.28)]"
                fill="none"
              >
                <defs>
                  <linearGradient
                    id="pop3d-extrude"
                    x1="60"
                    y1="14"
                    x2="60"
                    y2="108"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor="#FFE14D" />
                    <stop offset="50%" stopColor="#FF7A1A" />
                    <stop offset="100%" stopColor="#F2441D" />
                  </linearGradient>
                </defs>
                {/* 3D Extruded Base */}
                <rect
                  x="22"
                  y="22"
                  width="80"
                  height="84"
                  rx="20"
                  fill="url(#pop3d-extrude)"
                />
                {/* Front Vibrant Pink Face */}
                <rect
                  x="16"
                  y="14"
                  width="80"
                  height="84"
                  rx="20"
                  fill="#F562AE"
                />
                {/* Deep Purple Cutout Inner Emblem */}
                <rect
                  x="32"
                  y="32"
                  width="48"
                  height="48"
                  rx="13"
                  fill="#33068F"
                />
                <path
                  d="M45 56.5L52.5 64L68 48.5"
                  stroke="#FFFFFF"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function UploadScreen({
  onSelectSlotFiles,
  onSelectBatchFiles,
  onOpenCamera,
  isDecoding,
}: UploadScreenProps) {
  const multiInputRef = useRef<HTMLInputElement>(null);
  const [parallax, setParallax] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  const handleHeroMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 14;
    const ny = ((e.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 10;
    setParallax({ x: nx, y: ny });
  };

  return (
    <section
      aria-labelledby="upload-hero-title"
      onMouseMove={handleHeroMouseMove}
      onMouseLeave={() => setParallax({ x: 0, y: 0 })}
      className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col justify-between gap-6 px-5 pt-6 sm:px-8 sm:pt-10 lg:px-12"
    >
      {/* Hidden Multi-File Input shared by Hero Primary CTA and Batch Helper */}
      <input
        ref={multiInputRef}
        type="file"
        accept={ACCEPT_IMAGES}
        multiple
        disabled={isDecoding}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          if (files.length > 0) onSelectBatchFiles(files);
          e.target.value = "";
        }}
        className="hidden"
      />

      {/* Zone 1: Clean Minimalist Centered Hero */}
      <div className="mx-auto flex max-w-[740px] flex-col items-center text-center">
        <span className="nb-pill wollo-enter-1">
          <Sparkles className="h-3.5 w-3.5 text-[#5E17EB]" aria-hidden="true" />
          Auto-Crop Perspektif · Vision AI &amp; OCR Lokal · Drive Subfolder
        </span>

        <h1
          id="upload-hero-title"
          className="wollo-enter-1 mt-4 text-[2.25rem] font-medium leading-[1.12] tracking-[-0.03em] text-[#111114] sm:text-[3rem] lg:text-[3.5rem]"
        >
          Pindai &amp; Arsipkan Surat Ukur Lebih Presisi
        </h1>

        <p className="wollo-enter-1 mt-3.5 max-w-xl text-sm font-normal leading-relaxed text-[#4B5563] sm:text-base">
          Luruskan tepi warkah <strong>1 atau 2 lembar</strong> otomatis, baca
          Nomor SU, Hak &amp; Kelurahan via AI, lalu ekspor PDF jernih ke Google
          Drive.
        </p>

        {/* Non-redundant Dual Hero CTAs: Upload Files (Primary) vs Open Camera (Secondary) */}
        <div className="wollo-enter-2 mt-6 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <button
            type="button"
            disabled={isDecoding}
            onClick={() => multiInputRef.current?.click()}
            className="nb-btn wollo-cta-primary inline-flex min-h-12 w-full items-center justify-center gap-2 px-6 py-3 text-sm font-semibold disabled:opacity-60 sm:w-auto"
          >
            <Images className="h-4 w-4" aria-hidden="true" />
            Pilih Berkas Surat Ukur
          </button>

          <button
            type="button"
            disabled={isDecoding}
            onClick={() => onOpenCamera("page1")}
            className="nb-btn inline-flex min-h-12 w-full items-center justify-center gap-2 bg-white px-6 py-3 text-sm font-semibold text-[#374151] hover:border-[#D1D5DB] hover:bg-[#F9FAFB] disabled:opacity-60 sm:w-auto"
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            Foto dengan Kamera
          </button>
        </div>

        {/* Clean Minimalist Format & Capacity Strip */}
        <div className="wollo-enter-2 mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-[#4B5563]">
          <span>
            <strong className="font-mono text-[#111114]">01–02</strong> Lembar /
            PDF
          </span>
          <span aria-hidden="true" className="text-[#D1D5DB]">
            ·
          </span>
          <span>
            Resolusi <strong className="text-[#111114]">Rendah–Tinggi</strong>{" "}
            tetap jernih
          </span>
          <span aria-hidden="true" className="text-[#D1D5DB]">
            ·
          </span>
          <span className="truncate font-mono font-semibold text-[#111114]">
            SU.00006.2007.M.02246.pdf
          </span>
        </div>
      </div>

      {isDecoding ? (
        <div
          role="status"
          className="nb-card mx-auto flex w-full max-w-lg flex-col items-center gap-2.5 border-[#DDD6FE] bg-[#F5F3FF] p-4 text-sm font-semibold text-[#111114]"
        >
          <span>Memuat &amp; mendeteksi 4 sudut tepi kertas otomatis…</span>
          <progress
            aria-label="Memuat gambar dokumen"
            className="su-progress h-2.5 w-full"
          />
        </div>
      ) : null}

      {/* Dual Minimalist Dropzones for Hal 1 (Data SU) & Hal 2 (Peta Bidang Opsional) */}
      <div className="mx-auto grid w-full max-w-[1040px] grid-cols-1 gap-5 md:grid-cols-2">
        <DropzoneCard
          slot="page1"
          numberLabel="01"
          badge="Halaman 1 · Utama"
          accentDotClass="bg-[#5E17EB]"
          title="Data Surat Ukur (Teks)"
          footnote="*Untuk SU 1 lembar (mis. era tahun 60-an) cukup unggah file ini saja."
          icon="doc"
          onFiles={onSelectSlotFiles}
          onOpenCamera={onOpenCamera}
          disabled={isDecoding}
        />
        <DropzoneCard
          slot="page2"
          numberLabel="02"
          badge="Halaman 2 · Opsional"
          accentDotClass="bg-[#F562AE]"
          title="Gambar / Peta Bidang"
          footnote="*Opsional — kosongkan bila Surat Ukur hanya 1 halaman."
          icon="map"
          onFiles={onSelectSlotFiles}
          onOpenCamera={onOpenCamera}
          disabled={isDecoding}
        />
      </div>

      {/* Zone 2: Wollo Pop-3D Stacked Cards Showcase */}
      <Pop3dCardShowcase parallax={parallax} />
    </section>
  );
}
