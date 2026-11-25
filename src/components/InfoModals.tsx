"use client";

import {
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Keyboard,
  Trash2,
} from "lucide-react";
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
      subtitle="Daftar berkas PDF yang telah diekspor di browser ini untuk mencegah duplikasi pemindaian."
      maxWidthClass="max-w-2xl"
      headerBgClass="bg-[#FBCFE8]"
      footer={
        <>
          {items.length > 0 ? (
            <button
              type="button"
              onClick={onClearHistory}
              className="nb-btn-sm inline-flex min-h-10 items-center gap-2 bg-[#FECACA] px-3.5 py-2 text-xs font-extrabold text-[#111111]"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Hapus Semua Riwayat
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="nb-btn-sm inline-flex min-h-10 items-center bg-[#111111] px-4 py-2 text-xs font-extrabold text-[#F6F5F0]"
          >
            Tutup
          </button>
        </>
      }
    >
      {items.length === 0 ? (
        <div className="nb-card bg-white p-8 text-center">
          <FileText
            className="mx-auto h-10 w-10 text-[#111111]"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm font-extrabold text-[#111111]">
            Belum ada file PDF yang diunduh pada sesi ini
          </p>
          <p className="mt-1 text-xs font-medium text-[#3F3F46]">
            Setiap PDF Surat Ukur yang berhasil dibuat akan dicatat otomatis di
            IndexedDB lokal browser Anda.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item, idx) => (
            <li
              key={item.id}
              className={`nb-card-sm flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${
                idx % 2 === 0 ? "bg-white" : "bg-[#BAE6FD]/45"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="nb-pill">{item.pageCount} HAL</span>
                  {item.kecamatan ? (
                    <span className="inline-flex items-center gap-1 rounded-full border-2 border-[#111111] bg-[#FEF08A] px-2.5 py-0.5 text-[11px] font-extrabold text-[#111111]">
                      <FolderOpen className="h-3 w-3" aria-hidden="true" />
                      {item.kecamatan}
                    </span>
                  ) : null}
                  <span className="font-mono text-xs font-bold text-[#3F3F46]">
                    {formatBytes(item.sizeBytes)}
                  </span>
                </div>
                <p className="mt-1.5 truncate font-mono text-sm font-extrabold text-[#111111]">
                  {item.filename}
                </p>
                <p className="mt-0.5 text-xs font-medium text-[#3F3F46]">
                  {new Date(item.createdAt).toLocaleString("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {item.driveFolderUrl ? (
                  <a
                    href={item.driveFolderUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-[#BAE6FD] px-3 py-1.5 text-xs font-extrabold text-[#111111]"
                  >
                    <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    Drive
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                ) : null}
                {item.pdfBytes ? (
                  <button
                    type="button"
                    onClick={() => handleRedownload(item)}
                    className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-[#D9F99D] px-3.5 py-1.5 text-xs font-extrabold text-[#111111]"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Unduh Ulang
                  </button>
                ) : null}
              </div>
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
      headerBgClass="bg-[#BAE6FD]"
      footer={
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="nb-btn-sm inline-flex min-h-10 items-center bg-[#D9F99D] px-5 py-2 text-xs font-extrabold text-[#111111]"
        >
          Mengerti
        </button>
      }
    >
      <div className="space-y-5 text-sm">
        <section className="nb-card bg-[#FEF08A] p-4">
          <span className="nb-pill">01 · Pola Nama File Target</span>
          <div className="mt-2.5 rounded-xl border-2 border-[#111111] bg-white p-3.5 font-mono text-sm font-extrabold text-[#111111]">
            SU.[5-Digit No SU].[4-Digit Tahun].[Kode Hak].[5-Digit No Hak].pdf
          </div>
          <p className="mt-2.5 text-xs font-semibold text-[#111111]">
            Contoh hasil:{" "}
            <code className="rounded border border-[#111111] bg-white px-1.5 py-0.5 font-mono font-bold">
              SU.00006.2007.M.02246.pdf
            </code>{" "}
            dari Nomor SU <code className="font-mono font-bold">06/Helvetia Timur/2007</code> dan Nomor Hak{" "}
            <code className="font-mono font-bold">02.01.05.04.1.02246</code>.
            Untuk Surat Ukur lama era 1960-an (1 lembar), cukup unggah Halaman 1 saja lalu ekspor PDF 1 halaman. Nama{" "}
            <strong>Kecamatan</strong> (termasuk ejaan lama{" "}
            <code className="font-mono font-bold">Ketjamatan</code>) dipakai untuk membuat subfolder Google Drive otomatis.
          </p>
        </section>

        <section className="nb-card bg-white p-4">
          <span className="nb-pill">02 · Pemetaan Kode Jenis Hak</span>
          <div className="mt-3 overflow-x-auto rounded-xl border-2 border-[#111111]">
            <table className="w-full border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b-2 border-[#111111] bg-[#D9F99D]">
                  <th scope="col" className="px-3 py-2 font-extrabold">
                    Digit Kode
                  </th>
                  <th scope="col" className="px-3 py-2 font-extrabold">
                    Jenis Hak
                  </th>
                  <th scope="col" className="px-3 py-2 font-extrabold">
                    Kode Huruf File
                  </th>
                </tr>
              </thead>
              <tbody>
                {HAK_OPTIONS.map((opt) => (
                  <tr
                    key={opt.code}
                    className="border-b border-[#111111]/25 last:border-b-0"
                  >
                    <td className="px-3 py-2 font-mono font-extrabold">
                      {opt.digit}
                    </td>
                    <td className="px-3 py-2 font-semibold">{opt.shortName}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[#111111] bg-[#FEF08A] font-mono text-xs font-extrabold">
                        {opt.code}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2.5 text-xs font-semibold text-[#3F3F46]">
            Catatan: NIB memiliki <strong>13 digit</strong> (tanpa digit kode jenis hak di tengah)
            dan otomatis dibedakan dari Nomor Hak <strong>14 digit</strong>.
          </p>
        </section>

        <section className="nb-card bg-[#FBCFE8] p-4">
          <span className="nb-pill">
            <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
            03 · Pintasan Keyboard Desktop
          </span>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { keys: "Ctrl + Enter", desc: "Buat & Unduh PDF" },
              { keys: "Alt + N / Ctrl+Shift+N", desc: "Reset / Scan Berikutnya" },
              { keys: "R", desc: "Putar halaman aktif +90°" },
              { keys: "S", desc: "Tukar posisi Halaman 1 & 2" },
              { keys: "1 / 2", desc: "Beralih Tab Hal 1 dan Hal 2" },
            ].map((sc) => (
              <div
                key={sc.keys}
                className="flex items-center justify-between gap-2 rounded-xl border-2 border-[#111111] bg-white px-3 py-2"
              >
                <span className="text-xs font-bold text-[#111111]">
                  {sc.desc}
                </span>
                <kbd className="rounded-lg border border-[#111111] bg-[#111111] px-2 py-0.5 font-mono text-[11px] font-bold text-[#FEF08A]">
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
