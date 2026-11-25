"use client";

import { useId, useRef, useState } from "react";
import {
  Camera,
  FileText,
  FolderOpen,
  Images,
  Map as MapIcon,
  UploadCloud,
} from "lucide-react";
import type { PageSlot } from "@/lib/su-types";

const ACCEPT_IMAGES =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";

interface UploadScreenProps {
  onSelectSlotFiles: (slot: PageSlot, files: File[]) => void;
  onSelectBatchFiles: (files: File[]) => void;
  isDecoding: boolean;
}

interface DropzoneCardProps {
  slot: PageSlot;
  badge: string;
  title: string;
  footnote: string;
  icon: "doc" | "map";
  onFiles: (slot: PageSlot, files: File[]) => void;
  disabled: boolean;
}

function DropzoneCard({
  slot,
  badge,
  title,
  footnote,
  icon,
  onFiles,
  disabled,
}: DropzoneCardProps) {
  const fileInputId = useId();
  const cameraInputId = useId();
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
      className={`group relative flex flex-col items-center justify-between rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
        isDragging
          ? "border-[var(--accent)] bg-[var(--accent)]/10"
          : "border-[var(--border-control)]/55 bg-[var(--surface-card)] hover:border-[var(--accent)]/75"
      }`}
    >
      <div className="flex w-full flex-col items-center">
        <span className="inline-flex items-center rounded-full bg-[var(--surface-muted)] px-3 py-1 text-xs font-bold tracking-wider text-[var(--accent)] uppercase">
          {badge}
        </span>
        <h2 className="mt-3 text-lg font-bold text-[var(--ink-primary)]">
          {title}
        </h2>

        <div className="my-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/60 text-[var(--accent)]">
          {icon === "doc" ? (
            <FileText className="h-8 w-8" aria-hidden="true" />
          ) : (
            <MapIcon className="h-8 w-8" aria-hidden="true" />
          )}
        </div>

        <p className="text-sm font-medium text-[var(--ink-primary)]">
          Tarik &amp; lepas gambar di sini
        </p>
        <p className="mt-0.5 text-xs text-[var(--ink-secondary)]">
          atau pilih sumber unggahan (JPG, PNG, WEBP, HEIC)
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          <input
            id={fileInputId}
            type="file"
            accept={ACCEPT_IMAGES}
            multiple
            disabled={disabled}
            onChange={(e) => {
              const files = e.target.files ? Array.from(e.target.files) : [];
              if (files.length > 0) onFiles(slot, files);
              e.target.value = "";
            }}
            className="visually-hidden"
          />
          <label
            htmlFor={fileInputId}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-ink)] shadow-sm transition-opacity hover:opacity-90"
          >
            <FolderOpen className="h-4 w-4" aria-hidden="true" />
            Pilih File
          </label>

          <input
            id={cameraInputId}
            type="file"
            accept="image/*"
            capture="environment"
            disabled={disabled}
            onChange={(e) => {
              const files = e.target.files ? Array.from(e.target.files) : [];
              if (files.length > 0) onFiles(slot, files);
              e.target.value = "";
            }}
            className="visually-hidden"
          />
          <label
            htmlFor={cameraInputId}
            className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[var(--border-control)] bg-[var(--surface-card)] px-4 py-2.5 text-sm font-semibold text-[var(--ink-primary)] transition-colors hover:bg-[var(--surface-muted)]"
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            Kamera
          </label>
        </div>
      </div>

      <p className="mt-5 text-xs font-medium text-[var(--ink-secondary)]">
        {footnote}
      </p>
    </div>
  );
}

export function UploadScreen({
  onSelectSlotFiles,
  onSelectBatchFiles,
  isDecoding,
}: UploadScreenProps) {
  const multiInputRef = useRef<HTMLInputElement>(null);
  const multiInputId = useId();

  return (
    <section
      aria-labelledby="upload-hero-title"
      className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-4 py-8 sm:px-6 lg:py-12"
    >
      <div className="mx-auto max-w-2xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3.5 py-1 text-xs font-semibold text-[var(--ink-secondary)] shadow-xs">
          <UploadCloud className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
          Pemrosesan Gambar &amp; PDF 100% di Browser
        </div>
        <h1
          id="upload-hero-title"
          className="mt-4 text-2xl font-bold tracking-tight text-[var(--ink-primary)] sm:text-3xl"
        >
          Pemindai &amp; Penamaan Otomatis Surat Ukur (SU)
        </h1>
        <p className="mt-2 text-sm text-[var(--ink-secondary)] sm:text-base">
          Unggah 2 gambar dokumen (Data SU &amp; Gambar Bidang) untuk meluruskan
          perspektif, membaca nomor arsip via AI, dan mengekspor PDF standar BPN.
        </p>
      </div>

      {isDecoding ? (
        <div
          role="status"
          className="mx-auto mt-6 flex w-full max-w-md flex-col items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 text-sm font-medium"
        >
          <span>Memuat &amp; mendeteksi tepi kertas otomatis…</span>
          <progress
            aria-label="Memuat gambar dokumen"
            className="su-progress h-2 w-full"
          />
        </div>
      ) : null}

      <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-2">
        <DropzoneCard
          slot="page1"
          badge="Halaman 1 (Wajib)"
          title="Data Surat Ukur (Teks)"
          footnote="*Sumber utama pembacaan nama file AI"
          icon="doc"
          onFiles={onSelectSlotFiles}
          disabled={isDecoding}
        />
        <DropzoneCard
          slot="page2"
          badge="Halaman 2 (Wajib)"
          title="Gambar / Peta Bidang"
          footnote="*Digabung sebagai Halaman 2 pada PDF"
          icon="map"
          onFiles={onSelectSlotFiles}
          disabled={isDecoding}
        />
      </div>

      <div className="mt-6 flex flex-col items-center gap-2">
        <input
          ref={multiInputRef}
          id={multiInputId}
          type="file"
          accept={ACCEPT_IMAGES}
          multiple
          disabled={isDecoding}
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            if (files.length > 0) onSelectBatchFiles(files);
            e.target.value = "";
          }}
          className="visually-hidden"
        />
        <button
          type="button"
          disabled={isDecoding}
          onClick={() => multiInputRef.current?.click()}
          className="inline-flex min-h-12 items-center gap-2.5 rounded-xl border border-[var(--border-control)] bg-[var(--surface-card)] px-6 py-3 text-sm font-semibold text-[var(--ink-primary)] shadow-xs transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-60"
        >
          <Images className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
          Atau Pilih 2 Gambar Sekaligus (Multi-Select)
        </button>
        <p className="font-mono text-xs text-[var(--ink-secondary)]">
          Output standar: SU.[5-Digit No SU].[4-Digit Tahun].[Kode Hak].[5-Digit No Hak].pdf
        </p>
      </div>
    </section>
  );
}
