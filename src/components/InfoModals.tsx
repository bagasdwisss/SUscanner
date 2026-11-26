"use client";

import { useState } from "react";
import {
  Archive,
  Brain,
  CloudUpload,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Keyboard,
  Lock,
  Shield,
  Trash2,
} from "lucide-react";
import { AppDialog } from "./AppDialog";
import {
  buildReportCsvBlob,
  buildReportXlsxBlob,
  buildStructuredBackupZipBlob,
  triggerBlobDownload,
} from "@/lib/backup-export";
import type { CorrectionRule } from "@/lib/correction-memory";
import type { KioskAuditEntry } from "@/lib/kiosk-lock";
import { HAK_OPTIONS } from "@/lib/su-formatter";
import { formatBytes } from "@/lib/session-history";
import { triggerPdfDownload } from "@/lib/pdf-generator";
import type { OfflineUploadJob, SessionHistoryItem } from "@/lib/su-types";
import type { LearnedWilayahCodeMapping } from "@/lib/wilayah-dict";

type HistoryTab = "history" | "offline" | "stats" | "memory" | "audit";

interface HistoryDialogProps {
  open: boolean;
  onClose: () => void;
  items: SessionHistoryItem[];
  onClearHistory: () => void;
  offlineJobs?: OfflineUploadJob[];
  isSyncingOffline?: boolean;
  onRetryOfflineQueue?: () => void;
  onRemoveOfflineJob?: (id: string) => void;
  correctionRules?: CorrectionRule[];
  wilayahCodes?: LearnedWilayahCodeMapping[];
  onDeleteCorrectionRule?: (id: string) => void;
  onClearCorrectionMemory?: () => void;
  auditLogs?: KioskAuditEntry[];
  driveSheetUrl?: string | null;
  isAdminUnlocked?: boolean;
  onRequirePinUnlock?: () => void;
  onNotify?: (kind: "success" | "error", text: string) => void;
}

export function HistoryDialog({
  open,
  onClose,
  items,
  onClearHistory,
  offlineJobs = [],
  isSyncingOffline = false,
  onRetryOfflineQueue,
  onRemoveOfflineJob,
  correctionRules = [],
  wilayahCodes = [],
  onDeleteCorrectionRule,
  onClearCorrectionMemory,
  auditLogs = [],
  driveSheetUrl,
  isAdminUnlocked = true,
  onRequirePinUnlock,
  onNotify,
}: HistoryDialogProps) {
  const [activeTab, setActiveTab] = useState<HistoryTab>("history");
  const [isExportingZip, setIsExportingZip] = useState(false);

  const handleRedownload = (item: SessionHistoryItem) => {
    if (!item.pdfBytes) return;
    const blob = new Blob([item.pdfBytes], { type: "application/pdf" });
    triggerPdfDownload(blob, item.filename);
  };

  const handleDownloadCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    triggerBlobDownload(
      buildReportCsvBlob(items),
      `Rekap-SU-${stamp}.csv`,
    );
    onNotify?.("success", `Laporan CSV (${items.length} baris) diunduh.`);
  };

  const handleDownloadXlsx = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    triggerBlobDownload(
      buildReportXlsxBlob(items),
      `Rekap-SU-${stamp}.xlsx`,
    );
    onNotify?.("success", `Workbook Excel (.xlsx · ${items.length} baris) diunduh.`);
  };

  const handleDownloadZipBackup = async () => {
    setIsExportingZip(true);
    try {
      const { blob, includedPdfCount } =
        await buildStructuredBackupZipBlob(items);
      const stamp = new Date().toISOString().slice(0, 10);
      triggerBlobDownload(blob, `SU-Backup-${stamp}.zip`);
      onNotify?.(
        "success",
        `Paket ZIP terstruktur (${includedPdfCount} PDF + rekap CSV) diunduh.`,
      );
    } finally {
      setIsExportingZip(false);
    }
  };

  const kecSummary = items.reduce<Record<string, number>>((acc, it) => {
    const key = it.kecamatan || "Tanpa Kecamatan";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={`Riwayat, Laporan & Antrean Sync (${items.length})`}
      subtitle="Rekap Excel/CSV, paket backup ZIP per Kecamatan/Kelurahan, antrean upload offline, memori koreksi OCR, dan log audit."
      maxWidthClass="max-w-3xl"
      headerBgClass="bg-white"
      footer={
        <>
          {items.length > 0 && activeTab === "history" ? (
            <button
              type="button"
              onClick={() => {
                if (!isAdminUnlocked) {
                  onRequirePinUnlock?.();
                  return;
                }
                onClearHistory();
              }}
              className="nb-btn-sm inline-flex min-h-10 items-center gap-2 border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2 text-xs font-semibold text-[#9F1239] hover:bg-[#FFE4E6]"
            >
              {!isAdminUnlocked ? (
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              )}
              Hapus Semua Riwayat
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="nb-btn-sm wollo-cta-dark inline-flex min-h-10 items-center px-4 py-2 text-xs font-semibold"
          >
            Tutup
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Sub-navigation tabs inside History/Report Modal */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-[#E5E7EB] bg-white p-1.5 text-xs">
          {(
            [
              { id: "history", label: `Riwayat & Ekspor (${items.length})` },
              { id: "offline", label: `Antrean Offline (${offlineJobs.length})` },
              { id: "stats", label: "Rekap Wilayah" },
              { id: "memory", label: `Memori Koreksi (${correctionRules.length})` },
              { id: "audit", label: `Audit (${auditLogs.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`rounded-xl px-3 py-1.5 font-semibold transition-colors ${
                activeTab === t.id
                  ? "bg-[#5E17EB] text-white"
                  : "text-[#4B5563] hover:bg-[#F6F7F9]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "history" ? (
          <div className="space-y-3">
            {items.length > 0 || driveSheetUrl ? (
              <div className="nb-card flex flex-wrap items-center justify-between gap-2 bg-white p-3.5">
                <span className="text-xs font-semibold text-[#4B5563]">
                  Unduh Laporan, Backup &amp; Google Sheets:
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {driveSheetUrl ? (
                    <a
                      href={driveSheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="nb-btn-sm inline-flex min-h-9 items-center gap-1.5 border-[#A7F3D0] bg-[#ECFDF5] px-3 py-1.5 text-xs font-semibold text-[#065F46] hover:bg-[#D1FAE5]"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                      Buka Google Sheets
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  ) : null}
                  {items.length > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={handleDownloadXlsx}
                        className="nb-btn-sm inline-flex min-h-9 items-center gap-1.5 border-[#A7F3D0] bg-[#ECFDF5] px-3 py-1.5 text-xs text-[#065F46]"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                        Excel (.xlsx)
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadCsv}
                        className="nb-btn-sm inline-flex min-h-9 items-center gap-1.5 bg-[#F6F7F9] px-3 py-1.5 text-xs text-[#111114]"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        CSV
                      </button>
                      <button
                        type="button"
                        disabled={isExportingZip}
                        onClick={() => void handleDownloadZipBackup()}
                        className="nb-btn-sm wollo-cta-primary inline-flex min-h-9 items-center gap-1.5 px-3 py-1.5 text-xs disabled:opacity-50"
                      >
                        <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                        {isExportingZip ? "Mengemas…" : "Backup ZIP (Kec/Kel)"}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}

            {items.length === 0 ? (
              <div className="nb-card bg-white p-8 text-center">
                <FileText
                  className="mx-auto h-10 w-10 text-[#5E17EB]"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-bold text-[#111114]">
                  Belum ada file PDF yang diunduh pada sesi ini
                </p>
                <p className="mt-1 text-xs font-medium text-[#4B5563]">
                  Setiap PDF Surat Ukur yang berhasil dibuat akan dicatat otomatis di
                  IndexedDB lokal browser Anda.
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="nb-card-sm flex flex-wrap items-center justify-between gap-3 bg-white px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="nb-pill">{item.pageCount} HAL</span>
                        {item.kecamatan ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[#DDD6FE] bg-[#F5F3FF] px-2.5 py-0.5 text-[11px] font-semibold text-[#4C0FD1]">
                            <FolderOpen className="h-3 w-3" aria-hidden="true" />
                            {item.kelurahan
                              ? `${item.kecamatan} / ${item.kelurahan}`
                              : item.kecamatan}
                          </span>
                        ) : null}
                        <span className="font-mono text-xs font-semibold text-[#4B5563]">
                          {formatBytes(item.sizeBytes)}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate font-mono text-sm font-bold text-[#111114]">
                        {item.filename}
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-[#4B5563]">
                        {new Date(item.createdAt).toLocaleString("id-ID", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                        {item.operatorName ? ` · ${item.operatorName}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.driveFolderUrl ? (
                        <a
                          href={item.driveFolderUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-white px-3 py-1.5 text-xs font-semibold text-[#111114] hover:bg-[#F9FAFB]"
                        >
                          <FolderOpen className="h-3.5 w-3.5 text-[#5E17EB]" aria-hidden="true" />
                          Drive
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                      ) : null}
                      {item.pdfBytes ? (
                        <button
                          type="button"
                          onClick={() => handleRedownload(item)}
                          className="nb-btn-sm wollo-cta-primary inline-flex min-h-10 items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold"
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
          </div>
        ) : activeTab === "offline" ? (
          <div className="space-y-3">
            <div className="nb-card flex flex-wrap items-center justify-between gap-2 bg-white p-4">
              <div>
                <p className="text-xs font-bold text-[#111114]">
                  Antrean Unggah Offline-First
                </p>
                <p className="text-xs text-[#4B5563]">
                  PDF yang gagal terunggah karena internet terputus disimpan aman
                  di IndexedDB dan otomatis disinkronkan saat koneksi pulih.
                </p>
              </div>
              {offlineJobs.length > 0 ? (
                <button
                  type="button"
                  disabled={isSyncingOffline}
                  onClick={onRetryOfflineQueue}
                  className="nb-btn-sm wollo-cta-primary inline-flex min-h-9 items-center gap-1.5 px-3.5 py-1.5 text-xs disabled:opacity-50"
                >
                  <CloudUpload className="h-3.5 w-3.5" />
                  {isSyncingOffline
                    ? "Mengirim Ulang…"
                    : `Kirim Semua (${offlineJobs.length})`}
                </button>
              ) : null}
            </div>
            {offlineJobs.length === 0 ? (
              <p className="nb-card bg-white p-6 text-center text-xs text-[#4B5563]">
                Tidak ada berkas yang tertunda di antrean offline.
              </p>
            ) : (
              <ul className="space-y-2">
                {offlineJobs.map((job) => (
                  <li
                    key={job.id}
                    className="nb-card-sm flex flex-wrap items-center justify-between gap-2 bg-white px-4 py-3 text-xs"
                  >
                    <div>
                      <p className="font-mono font-bold text-[#111114]">
                        {job.filename}
                      </p>
                      <p className="text-[#4B5563]">
                        Target: / {job.kecamatan}
                        {job.kelurahan ? ` / ${job.kelurahan}` : ""} ·{" "}
                        {formatBytes(job.sizeBytes)}
                      </p>
                      {job.lastError ? (
                        <p className="mt-0.5 font-semibold text-[#9F1239]">
                          {job.lastError}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveOfflineJob?.(job.id)}
                      className="nb-btn-sm bg-[#FFF1F2] px-2.5 py-1 text-[11px] text-[#9F1239]"
                    >
                      Hapus
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : activeTab === "stats" ? (
          <div className="nb-card space-y-3 bg-white p-4">
            <h2 className="text-xs font-bold text-[#111114] uppercase">
              Rekap Digitalisasi Sesi per Kecamatan
            </h2>
            {Object.keys(kecSummary).length === 0 ? (
              <p className="text-xs text-[#4B5563]">Belum ada ekspor pada sesi ini.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(kecSummary)
                  .sort((a, b) => b[1] - a[1])
                  .map(([kec, count]) => (
                    <div
                      key={kec}
                      className="flex items-center justify-between rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] px-3 py-2 text-xs"
                    >
                      <span className="font-semibold text-[#111114]">{kec}</span>
                      <span className="rounded-full bg-[#5E17EB] px-2.5 py-0.5 font-mono font-bold text-white">
                        {count} PDF
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ) : activeTab === "memory" ? (
          <div className="nb-card space-y-3 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-[#5E17EB]" />
                <span className="text-xs font-bold text-[#111114]">
                  Memori Koreksi Pintar ({correctionRules.length} aturan ·{" "}
                  {wilayahCodes.length} kode 8-digit Hak)
                </span>
              </div>
              {correctionRules.length > 0 || wilayahCodes.length > 0 ? (
                <button
                  type="button"
                  onClick={onClearCorrectionMemory}
                  className="nb-btn-sm bg-[#FFF1F2] px-2.5 py-1 text-[11px] text-[#9F1239]"
                >
                  Reset Memori
                </button>
              ) : null}
            </div>
            {correctionRules.length === 0 ? (
              <p className="text-xs text-[#4B5563]">
                Setiap kali Anda memperbaiki ejaan Kecamatan/Kelurahan secara
                manual setelah ekstraksi AI/OCR, sistem mengingat polanya untuk
                scan berikutnya.
              </p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {correctionRules.slice(0, 20).map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] px-3 py-2"
                  >
                    <span>
                      <strong className="uppercase">{r.field}:</strong>{" "}
                      <span className="line-through text-[#9F1239]">
                        {r.fromRaw}
                      </span>{" "}
                      → <strong className="text-[#065F46]">{r.toValue}</strong>{" "}
                      <span className="text-[10px] text-[#4B5563]">
                        ({r.hits}×)
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteCorrectionRule?.(r.id)}
                      className="text-[11px] font-semibold text-[#9F1239] hover:underline"
                    >
                      Hapus
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="nb-card space-y-2.5 bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#111114]">
              <Shield className="h-4 w-4 text-[#5E17EB]" />
              Log Audit Aktivitas &amp; Kiosk ({auditLogs.length})
            </div>
            {auditLogs.length === 0 ? (
              <p className="text-xs text-[#4B5563]">
                Belum ada catatan audit keamanan/ekspor.
              </p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {auditLogs.slice(0, 30).map((log) => (
                  <li
                    key={log.id}
                    className="rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] px-3 py-2"
                  >
                    <div className="flex justify-between font-semibold text-[#111114]">
                      <span>{log.action}</span>
                      <span className="font-mono text-[11px] text-[#4B5563]">
                        {new Date(log.timestamp).toLocaleTimeString("id-ID")}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#4B5563]">
                      {log.operatorName} · {log.detail}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
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
      headerBgClass="bg-white"
      footer={
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="nb-btn-sm wollo-cta-primary inline-flex min-h-10 items-center px-5 py-2 text-xs font-semibold"
        >
          Mengerti
        </button>
      }
    >
      <div className="space-y-4 text-sm">
        <section className="nb-card border-[#DDD6FE] bg-[#F5F3FF]/60 p-4">
          <span className="nb-pill bg-white text-[#4C0FD1]">
            01 · Pola Nama File Target
          </span>
          <div className="mt-2.5 rounded-xl border border-[#DDD6FE] bg-white p-3.5 font-mono text-sm font-bold text-[#111114]">
            SU.[5-Digit No SU].[4-Digit Tahun].[Kode Hak].[5-Digit No Hak].pdf
          </div>
          <p className="mt-2.5 text-xs font-medium text-[#374151]">
            Contoh hasil:{" "}
            <code className="rounded border border-[#E5E7EB] bg-white px-1.5 py-0.5 font-mono font-bold text-[#111114]">
              SU.00006.2007.M.02246.pdf
            </code>{" "}
            dari Nomor SU <code className="font-mono font-bold">06/Helvetia Timur/2007</code> dan Nomor Hak{" "}
            <code className="font-mono font-bold">02.01.05.04.1.02246</code>.
            Untuk Surat Ukur lama era 1960-an (1 lembar), cukup unggah Halaman 1 saja lalu ekspor PDF 1 halaman. Nama{" "}
            <strong>Kecamatan</strong> dan{" "}
            <strong>Kelurahan / Desa</strong> otomatis membentuk struktur subfolder bertingkat{" "}
            <code className="font-mono font-bold">Drive / Kecamatan / Kelurahan</code> di Google Drive sekaligus masuk rekap Google Sheets.
          </p>
        </section>

        <section className="nb-card bg-white p-4">
          <span className="nb-pill">02 · Pemetaan Kode Jenis Hak</span>
          <div className="mt-3 overflow-x-auto rounded-xl border border-[#E5E7EB]">
            <table className="w-full border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#F6F7F9]">
                  <th scope="col" className="px-3 py-2 font-bold text-[#111114]">
                    Digit Kode
                  </th>
                  <th scope="col" className="px-3 py-2 font-bold text-[#111114]">
                    Jenis Hak
                  </th>
                  <th scope="col" className="px-3 py-2 font-bold text-[#111114]">
                    Kode Huruf File
                  </th>
                </tr>
              </thead>
              <tbody>
                {HAK_OPTIONS.map((opt) => (
                  <tr
                    key={opt.code}
                    className="border-b border-[#E5E7EB] last:border-b-0"
                  >
                    <td className="px-3 py-2 font-mono font-bold text-[#111114]">
                      {opt.digit}
                    </td>
                    <td className="px-3 py-2 font-medium text-[#374151]">
                      {opt.shortName}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[#DDD6FE] bg-[#F5F3FF] font-mono text-xs font-bold text-[#4C0FD1]">
                        {opt.code}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2.5 text-xs font-medium text-[#4B5563]">
            Catatan: NIB memiliki <strong>13 digit</strong> dan dipisahkan otomatis dari Nomor Hak <strong>14 digit</strong> (dengan validasi silang 8 digit kode wilayah).
          </p>
        </section>

        <section className="nb-card bg-white p-4">
          <span className="nb-pill">
            <Keyboard className="h-3.5 w-3.5 text-[#5E17EB]" aria-hidden="true" />
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
                className="flex items-center justify-between gap-2 rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] px-3 py-2"
              >
                <span className="text-xs font-semibold text-[#111114]">
                  {sc.desc}
                </span>
                <kbd className="rounded-lg bg-[#0E0E10] px-2 py-0.5 font-mono text-[11px] font-semibold text-white">
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
