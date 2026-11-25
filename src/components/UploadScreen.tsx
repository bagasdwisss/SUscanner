"use client";

import { useRef, useState } from "react";
import {
  Camera,
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
  title: string;
  footnote: string;
  cardBgClass: string;
  icon: "doc" | "map";
  onFiles: (slot: PageSlot, files: File[]) => void;
  onOpenCamera: (slot: PageSlot) => void;
  disabled: boolean;
}

function DropzoneCard({
  slot,
  numberLabel,
  badge,
  title,
  footnote,
  cardBgClass,
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
        isDragging ? "bg-[#FEF08A]" : cardBgClass
      }`}
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <span className="nb-pill">{badge}</span>
          <span className="font-mono text-3xl font-black leading-none tracking-tight text-[#111111]/25">
            {numberLabel}
          </span>
        </div>

        <h2 className="mt-3 text-xl font-extrabold tracking-tight text-[#111111]">
          {title}
        </h2>

        <div className="mt-4 flex flex-col items-center rounded-xl border-2 border-dashed border-[#111111] bg-white px-4 py-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-[#111111] bg-[#F6F5F0] text-[#111111] shadow-[3px_3px_0px_#111111]">
            {icon === "doc" ? (
              <FileText className="h-7 w-7" aria-hidden="true" />
            ) : (
              <MapIcon className="h-7 w-7" aria-hidden="true" />
            )}
          </div>

          <p className="mt-3.5 text-sm font-extrabold text-[#111111]">
            Tarik &amp; lepas gambar di sini
          </p>
          <p className="mt-0.5 text-xs font-semibold text-[#3F3F46]">
            Mendukung JPG, PNG, WEBP, HEIC
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
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
              className="nb-btn inline-flex min-h-11 flex-1 items-center justify-center gap-2 bg-[#FDE047] px-4 py-2.5 text-sm text-[#111111] disabled:opacity-60 sm:flex-none"
            >
              <FolderOpen className="h-4 w-4" aria-hidden="true" />
              Pilih File
            </button>

            <button
              type="button"
              disabled={disabled}
              onClick={() => onOpenCamera(slot)}
              className="nb-btn inline-flex min-h-11 flex-1 items-center justify-center gap-2 bg-[#FBCFE8] px-4 py-2.5 text-sm text-[#111111] disabled:opacity-60 sm:flex-none"
            >
              <Camera className="h-4 w-4" aria-hidden="true" />
              Kamera
            </button>
          </div>
        </div>
      </div>

      <p className="nb-micro mt-4 text-[#111111]/80">{footnote}</p>
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

  return (
    <section
      aria-labelledby="upload-hero-title"
      className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-4 px-3 py-4 sm:gap-5 sm:px-6 sm:py-6 lg:py-8"
    >
      {/* Top Bento Hero Row */}
      <div className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-12">
        <div className="nb-card flex flex-col justify-between bg-[#FEF08A] p-4 sm:p-6 lg:col-span-8">
          <div>
            <span className="nb-pill">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Pemrosesan Gambar &amp; PDF 100% Client-Side
            </span>
            <h1
              id="upload-hero-title"
              className="mt-3.5 text-xl font-black tracking-tight text-[#111111] sm:text-2xl lg:text-3xl"
            >
              Pemindai &amp; Penamaan Otomatis Surat Ukur (SU)
            </h1>
            <p className="mt-2 max-w-2xl text-sm font-medium text-[#111111]/85 sm:text-base">
              Unggah atau potret <strong>1 atau 2 lembar</strong> warkah Surat Ukur
              (mendukung SU lama era 1960-an 1 lembar hingga SU modern 2 halaman)
              untuk pelurusan otomatis, ekstraksi entitas + Kecamatan oleh Vision
              AI, dan arsip ke subfolder Google Drive.
            </p>
          </div>
        </div>

        <div className="nb-card grid grid-cols-2 gap-2.5 bg-white p-4 sm:p-5 lg:col-span-4">
          <div className="rounded-xl border-2 border-[#111111] bg-[#BAE6FD] p-3">
            <span className="nb-micro block text-[#111111]/75">DOKUMEN</span>
            <span className="mt-1 block font-mono text-2xl font-black text-[#111111]">
              01–02
            </span>
            <span className="text-[11px] font-bold text-[#111111]">
              Lembar / PDF
            </span>
          </div>
          <div className="rounded-xl border-2 border-[#111111] bg-[#D9F99D] p-3">
            <span className="nb-micro block text-[#111111]/75">UKURAN PDF</span>
            <span className="mt-1 block font-mono text-2xl font-black text-[#111111]">
              &lt;1.5
            </span>
            <span className="text-[11px] font-bold text-[#111111]">
              MB Target
            </span>
          </div>
          <div className="col-span-2 rounded-xl border-2 border-[#111111] bg-[#FBCFE8] p-3">
            <span className="nb-micro block text-[#111111]/75">
              FORMAT OUTPUT STANDAR
            </span>
            <span className="mt-1 block truncate font-mono text-xs font-black text-[#111111] sm:text-sm">
              SU.00006.2007.M.02246.pdf
            </span>
          </div>
        </div>
      </div>

      {isDecoding ? (
        <div
          role="status"
          className="nb-card mx-auto flex w-full max-w-lg flex-col items-center gap-2.5 bg-[#FEF08A] p-4 text-sm font-extrabold text-[#111111]"
        >
          <span>Memuat &amp; mendeteksi 4 sudut tepi kertas otomatis…</span>
          <progress
            aria-label="Memuat gambar dokumen"
            className="su-progress h-2.5 w-full"
          />
        </div>
      ) : null}

      {/* Middle Bento Dual Dropzone Grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <DropzoneCard
          slot="page1"
          numberLabel="01"
          badge="Halaman 1 · Utama"
          title="Data Surat Ukur (Teks)"
          footnote="*Untuk SU 1 lembar (mis. era tahun 60-an) cukup unggah file ini saja"
          cardBgClass="bg-[#BAE6FD]"
          icon="doc"
          onFiles={onSelectSlotFiles}
          onOpenCamera={onOpenCamera}
          disabled={isDecoding}
        />
        <DropzoneCard
          slot="page2"
          numberLabel="02"
          badge="Halaman 2 · Opsional"
          title="Gambar / Peta Bidang"
          footnote="*Opsional — kosongkan bila Surat Ukur hanya 1 halaman"
          cardBgClass="bg-[#D9F99D]"
          icon="map"
          onFiles={onSelectSlotFiles}
          onOpenCamera={onOpenCamera}
          disabled={isDecoding}
        />
      </div>

      {/* Bottom Bento Multi-Select Bar */}
      <div className="nb-card flex flex-wrap items-center justify-between gap-4 bg-[#FBCFE8] p-4 sm:px-6 sm:py-5">
        <div>
          <span className="nb-pill">Input Cepat Operator</span>
          <p className="mt-1.5 text-sm font-extrabold text-[#111111]">
            Sudah punya foto Halaman 1 &amp; 2 di folder yang sama?
          </p>
          <p className="text-xs font-semibold text-[#111111]/80">
            Pilih kedua file sekaligus untuk langsung masuk ke workspace scan.
          </p>
        </div>

        <div>
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
          <button
            type="button"
            disabled={isDecoding}
            onClick={() => multiInputRef.current?.click()}
            className="nb-btn inline-flex min-h-12 items-center gap-2.5 bg-white px-5 py-3 text-sm text-[#111111] disabled:opacity-60"
          >
            <Images className="h-4 w-4" aria-hidden="true" />
            Atau Pilih 2 Gambar Sekaligus (Multi-Select)
          </button>
        </div>
      </div>
    </section>
  );
}
