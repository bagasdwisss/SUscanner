"use client";

import { Download, FileText, Keyboard, Trash2 } from "lucide-react";
import { AppDialog } from "./AppDialog";
import { HAK_OPTIONS } from "@/lib/su-formatter";
import { formatBytes } from "@/lib/session-history";
import { triggerPdfDownload } from "@/lib/pdf-generator";
import type { SessionHistoryItem } from "@/lib/su-types";

interface HistoryDialogProps {
  open: boolean;
  onClose: () => void;
  items: SessionHistoryItem[];
  onClearHistory: () => void;
}

export function HistoryDialog({
  open,
  onClose,
  items,
  onClearHistory,
}: HistoryDialogProps) {
  const handleRedownload = (item: SessionHistoryItem) => {
    if (!item.pdfBytes) return;
    const blob = new Blob([item.pdfBytes], { type: "application/pdf" });
    triggerPdfDownload(blob, item.filename);
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={`Riwayat Sesi (${items.length})`}
      subtitle="Daftar berkas PDF yang telah diekspor pada peramban ini untuk mencegah duplikasi pemindaian."
      maxWidthClass="max-w-2xl"
      footer={
        <>
          {items.length > 0 ? (
            <button
              type="button"
              onClick={onClearHistory}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-300 px-3.5 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/50"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Hapus Semua Riwayat
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 items-center rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] transition-opacity hover:opacity-90"
          >
            Tutup
          </button>
        </>
      }
    >
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-subtle)] p-8 text-center">
          <FileText
            className="mx-auto h-10 w-10 text-[var(--ink-secondary)]"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm font-semibold text-[var(--ink-primary)]">
            Belum ada file PDF yang diunduh pada sesi ini
          </p>
          <p className="mt-1 text-xs text-[var(--ink-secondary)]">
            Setiap PDF Surat Ukur yang berhasil dibuat akan dicatat otomatis di
            IndexedDB lokal browser Anda.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/35 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm font-semibold text-[var(--ink-primary)]">
                  {item.filename}
                </p>
                <p className="mt-0.5 text-xs text-[var(--ink-secondary)]">
                  {new Date(item.createdAt).toLocaleString("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}{" "}
                  · {item.pageCount} halaman · {formatBytes(item.sizeBytes)}
                </p>
              </div>
              {item.pdfBytes ? (
                <button
                  type="button"
                  onClick={() => handleRedownload(item)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-primary)] transition-colors hover:bg-[var(--surface-muted)]"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Unduh Ulang
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </AppDialog>
  );
}

interface GuideDialogProps {
  open: boolean;
  onClose: () => void;
}

export function GuideDialog({ open, onClose }: GuideDialogProps) {
  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Panduan Format Penamaan & Shortcut"
      subtitle="Standar penamaan arsip digital Surat Ukur (ATR/BPN) dan pintasan keyboard operator."
      maxWidthClass="max-w-3xl"
      footer={
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="inline-flex min-h-10 items-center rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] transition-opacity hover:opacity-90"
        >
          Mengerti
        </button>
      }
    >
      <div className="space-y-6 text-sm">
        <section>
          <h2 className="text-base font-bold text-[var(--ink-primary)]">
            1. Pola Nama File Target
          </h2>
          <div className="mt-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)]/50 p-3.5 font-mono text-sm font-semibold text-[var(--ink-primary)]">
            SU.[5-Digit No SU].[4-Digit Tahun].[Kode Hak].[5-Digit No Hak].pdf
          </div>
          <p className="mt-2 text-[var(--ink-secondary)]">
            Contoh hasil: <code className="font-mono font-semibold">SU.00006.2007.M.02246.pdf</code>{" "}
            dari Nomor SU <code className="font-mono">06/Helvetia Timur/2007</code> dan Nomor Hak{" "}
            <code className="font-mono">02.01.05.04.1.02246</code>.
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-[var(--ink-primary)]">
            2. Pemetaan Kode Jenis Hak (Digit ke-9 Nomor Hak 14 Digit)
          </h2>
          <div className="mt-2 overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
            <table className="w-full border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]/60">
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Digit Kode
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Jenis Hak
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Kode Huruf File
                  </th>
                </tr>
              </thead>
              <tbody>
                {HAK_OPTIONS.map((opt) => (
                  <tr
                    key={opt.code}
                    className="border-b border-[var(--border-subtle)] last:border-b-0"
                  >
                    <td className="px-3 py-2 font-mono font-semibold">
                      {opt.digit}
                    </td>
                    <td className="px-3 py-2">{opt.shortName}</td>
                    <td className="px-3 py-2 font-mono font-bold text-[var(--accent)]">
                      {opt.code}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[var(--ink-secondary)]">
            Catatan: NIB memiliki <strong>13 digit</strong> (tanpa digit kode jenis hak di tengah)
            dan otomatis dibedakan oleh sistem agar tidak tertukar dengan Nomor Hak <strong>14 digit</strong>.
          </p>
        </section>

        <section>
          <h2 className="flex items-center gap-2 text-base font-bold text-[var(--ink-primary)]">
            <Keyboard className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            3. Pintasan Keyboard Operator (Desktop)
          </h2>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { keys: "Ctrl + Enter", desc: "Buat & Unduh PDF" },
              { keys: "Alt + N / Ctrl+Shift+N", desc: "Reset / Scan Berikutnya" },
              { keys: "R", desc: "Putar halaman aktif +90°" },
              { keys: "S", desc: "Tukar posisi Halaman 1 & 2" },
              { keys: "1 / 2", desc: "Beralih antara Tab Hal 1 dan Hal 2" },
            ].map((sc) => (
              <div
                key={sc.keys}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-2"
              >
                <span className="text-xs text-[var(--ink-secondary)]">
                  {sc.desc}
                </span>
                <kbd className="rounded bg-[var(--surface-muted)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--ink-primary)]">
                  {sc.keys}
                </kbd>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppDialog>
  );
}
