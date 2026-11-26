"use client";

import { useId, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  Lock,
  RotateCcw,
} from "lucide-react";
import { AppDialog } from "./AppDialog";
import {
  buildDriveFolderUrl,
  DEFAULT_APPS_SCRIPT_URL,
  GOOGLE_APPS_SCRIPT_TEMPLATE,
  validateAppsScriptWebhookUrl,
} from "@/lib/drive-config";
import {
  DEFAULT_DRIVE_ROOT_FOLDER_ID,
  extractDriveFolderId,
} from "@/lib/su-formatter";
import type { DriveConflictPolicy, DriveStatusResponse } from "@/lib/su-types";

interface DriveConfigDialogProps {
  open: boolean;
  onClose: () => void;
  serverStatus: DriveStatusResponse | null;
  appsScriptUrl: string;
  rootFolderInput: string;
  autoUploadOnExport: boolean;
  conflictPolicy?: DriveConflictPolicy;
  syncToSheet?: boolean;
  sheetUrl?: string | null;
  onSheetUrlDiscovered?: (url: string) => void;
  isAdminUnlocked?: boolean;
  onRequirePinUnlock?: () => void;
  onSaveConfig: (next: {
    appsScriptUrl: string;
    rootFolderId: string;
    autoUploadOnExport: boolean;
    conflictPolicy: DriveConflictPolicy;
    syncToSheet: boolean;
  }) => void;
  onClearAppsScript: () => void;
}

export function DriveConfigDialog({
  open,
  onClose,
  serverStatus,
  appsScriptUrl,
  rootFolderInput,
  autoUploadOnExport,
  conflictPolicy = "revision",
  syncToSheet = true,
  sheetUrl = null,
  onSheetUrlDiscovered,
  isAdminUnlocked = true,
  onRequirePinUnlock,
  onSaveConfig,
  onClearAppsScript,
}: DriveConfigDialogProps) {
  const [urlDraft, setUrlDraft] = useState(
    appsScriptUrl || DEFAULT_APPS_SCRIPT_URL,
  );
  const [folderDraft, setFolderDraft] = useState(
    rootFolderInput || DEFAULT_DRIVE_ROOT_FOLDER_ID,
  );
  const [autoDraft, setAutoDraft] = useState(autoUploadOnExport);
  const [policyDraft, setPolicyDraft] = useState<DriveConflictPolicy>(conflictPolicy);
  const [sheetDraft, setSheetDraft] = useState(syncToSheet);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isCheckingSheet, setIsCheckingSheet] = useState(false);
  const [localSheetUrl, setLocalSheetUrl] = useState<string | null>(sheetUrl);
  const [verifyFeedback, setVerifyFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const urlId = useId();
  const folderId = useId();

  const resolvedFolderId =
    extractDriveFolderId(folderDraft) ||
    serverStatus?.defaultRootFolderId ||
    DEFAULT_DRIVE_ROOT_FOLDER_ID;
  const resolvedFolderUrl = buildDriveFolderUrl(resolvedFolderId);

  const serverConfigured = Boolean(serverStatus?.configured);
  const browserConfigured = Boolean(validateAppsScriptWebhookUrl(urlDraft));
  const isReady = serverConfigured || browserConfigured;

  const handleTestConnection = async () => {
    setIsTesting(true);
    setVerifyFeedback(null);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/drive/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rootFolderId: resolvedFolderId,
          appsScriptUrl: urlDraft.trim() || DEFAULT_APPS_SCRIPT_URL,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        sheetUrl?: string;
        error?: string;
      } | null;
      if (res.ok && json?.ok) {
        if (json.sheetUrl) {
          setLocalSheetUrl(json.sheetUrl);
          onSheetUrlDiscovered?.(json.sheetUrl);
        }
        setVerifyFeedback({
          ok: true,
          message:
            json.message ||
            "Koneksi Google Drive & Web App Apps Script aktif!",
        });
      } else {
        setVerifyFeedback({
          ok: false,
          message:
            json?.error ||
            `Gagal memverifikasi Drive (HTTP ${res.status}). Periksa URL /exec dan izin Deploy = Anyone.`,
        });
      }
    } catch {
      setVerifyFeedback({
        ok: false,
        message: "Gagal menghubungi server verifikasi Drive.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleEnsureSheet = async () => {
    setIsCheckingSheet(true);
    setVerifyFeedback(null);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/drive/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "init_sheet",
          rootFolderId: resolvedFolderId,
          appsScriptUrl: urlDraft.trim() || DEFAULT_APPS_SCRIPT_URL,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        sheetUrl?: string;
        existed?: boolean;
        error?: string;
      } | null;
      if (res.ok && json?.ok && json.sheetUrl) {
        setLocalSheetUrl(json.sheetUrl);
        onSheetUrlDiscovered?.(json.sheetUrl);
        setVerifyFeedback({
          ok: true,
          message: json.existed
            ? 'Google Sheets "Rekap_Scan_SU" ditemukan di folder Drive dan siap dibuka.'
            : 'Google Sheets "Rekap_Scan_SU" berhasil dibuat di Folder Induk Drive!',
        });
      } else {
        setVerifyFeedback({
          ok: false,
          message:
            json?.error ||
            'Spreadsheet "Rekap_Scan_SU" dibuat otomatis saat upload PDF pertama ke Drive.',
        });
      }
    } catch {
      setVerifyFeedback({
        ok: false,
        message: "Gagal menghubungi server untuk menyiapkan Google Sheets.",
      });
    } finally {
      setIsCheckingSheet(false);
    }
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_TEMPLATE);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    } catch {
      setErrorMsg("Gagal menyalin kode script ke papan klip.");
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminUnlocked) {
      onRequirePinUnlock?.();
      return;
    }
    const cleanedFolder = extractDriveFolderId(folderDraft);
    if (!cleanedFolder) {
      setErrorMsg(
        "Link atau ID Folder Google Drive tidak valid. Salin URL folder Drive atau ID-nya.",
      );
      return;
    }

    const trimmedUrl = urlDraft.trim() || DEFAULT_APPS_SCRIPT_URL;
    if (!validateAppsScriptWebhookUrl(trimmedUrl)) {
      setErrorMsg(
        "URL Google Apps Script harus diawali https://script.google.com/macros/s/...",
      );
      return;
    }

    setErrorMsg(null);
    onSaveConfig({
      appsScriptUrl: trimmedUrl,
      rootFolderId: cleanedFolder,
      autoUploadOnExport: autoDraft,
      conflictPolicy: policyDraft,
      syncToSheet: sheetDraft,
    });
    onClose();
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Pengaturan Google Drive & Subfolder Kecamatan / Kelurahan"
      subtitle="Berkas PDF yang selesai dipindai akan otomatis dimasukkan ke subfolder Kecamatan lalu subfolder Kelurahan/Desa di dalamnya."
      maxWidthClass="max-w-3xl"
      headerBgClass="bg-white"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="nb-btn-sm inline-flex min-h-10 items-center bg-white px-4 py-2 text-xs font-semibold text-[#374151] hover:bg-[#F9FAFB]"
          >
            Batal
          </button>
          <button
            type="submit"
            form="drive-config-form"
            className="nb-btn-sm wollo-cta-primary inline-flex min-h-10 items-center gap-1.5 px-5 py-2 text-xs font-semibold"
          >
            {!isAdminUnlocked ? <Lock className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            Simpan Pengaturan Drive
          </button>
        </>
      }
    >
      <form id="drive-config-form" onSubmit={handleSave} className="space-y-4 text-sm">
        {!isAdminUnlocked ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3.5 py-2.5 text-xs">
            <span className="inline-flex items-center gap-1.5 font-bold text-[#92400E]">
              <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Mode Kiosk Aktif: Pengaturan Drive dikunci PIN Admin.
            </span>
            {onRequirePinUnlock ? (
              <button
                type="button"
                onClick={onRequirePinUnlock}
                className="nb-btn-sm bg-white px-3 py-1 text-[11px] font-bold text-[#111114]"
              >
                Buka Kunci Admin
              </button>
            ) : null}
          </div>
        ) : null}
        {/* Connection Status Banner */}
        <div
          className={`nb-card-sm flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${
            isReady
              ? "border-[#A7F3D0] bg-[#ECFDF5]"
              : "border-[#FDE68A] bg-[#FFFBEB]"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2
              className={`h-5 w-5 shrink-0 ${
                isReady ? "text-[#065F46]" : "text-[#92400E]"
              }`}
              aria-hidden="true"
            />
            <div>
              <p className="text-xs font-bold text-[#111114] uppercase">
                {serverConfigured
                  ? `Koneksi Server Aktif (${serverStatus?.mode})`
                  : browserConfigured
                    ? "Koneksi Google Apps Script Aktif (Browser Ini)"
                    : "Belum Terhubung — Pilih Cara Hubungkan di Bawah"}
              </p>
              <p className="text-xs font-medium text-[#4B5563]">
                {isReady
                  ? "Siap membuat subfolder Kecamatan dan subfolder Kelurahan/Desa otomatis di Drive."
                  : "Isi URL Web App Apps Script (2 menit) atau atur variabel .env.local di server."}
              </p>
            </div>
          </div>

          <a
            href={resolvedFolderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="nb-btn-sm inline-flex min-h-9 items-center gap-1.5 bg-white px-3 py-1.5 text-xs font-semibold text-[#111114] hover:bg-[#F9FAFB]"
          >
            <FolderOpen className="h-3.5 w-3.5 text-[#5E17EB]" aria-hidden="true" />
            Buka Folder Induk
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>

        {/* Folder Induk Config */}
        <div className="nb-card space-y-2.5 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={folderId} className="nb-micro text-[#111114]">
              1. URL atau ID Folder Induk Google Drive
            </label>
            <button
              type="button"
              onClick={() => setFolderDraft(DEFAULT_DRIVE_ROOT_FOLDER_ID)}
              className="nb-btn-sm inline-flex min-h-8 items-center gap-1 bg-[#F6F7F9] px-2.5 py-1 text-[11px] text-[#111114] hover:bg-white"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Gunakan Folder Bawaan
            </button>
          </div>
          <input
            id={folderId}
            type="text"
            value={folderDraft}
            onChange={(e) => setFolderDraft(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/1D5f..."
            className="su-control w-full rounded-xl px-3.5 py-2 font-mono text-xs font-bold"
          />
          <p className="text-xs font-medium text-[#4B5563]">
            Folder aktif:{" "}
            <code className="rounded border border-[#E5E7EB] bg-[#F6F7F9] px-1.5 py-0.5 font-mono font-bold text-[#111114]">
              {resolvedFolderId}
            </code>{" "}
            — Subfolder bertingkat seperti{" "}
            <code className="font-mono font-bold text-[#111114]">
              /Medan Helvetia/Helvetia Timur/
            </code>{" "}
            akan dibuat otomatis di dalam folder ini.
          </p>

          <label className="mt-1 inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] px-3 py-2 text-xs font-semibold text-[#111114]">
            <input
              type="checkbox"
              checked={autoDraft}
              onChange={(e) => setAutoDraft(e.target.checked)}
              className="h-4 w-4"
            />
            <span>
              Otomatis unggah ke Google Drive setiap kali menekan{" "}
              <strong>Simpan &amp; Download PDF</strong>
            </span>
          </label>

          <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] px-3 py-2 text-xs font-semibold text-[#111114]">
            <input
              type="checkbox"
              checked={sheetDraft}
              onChange={(e) => setSheetDraft(e.target.checked)}
              className="h-4 w-4"
            />
            <span>
              Catat baris rekap otomatis ke Google Sheets (<code>Rekap_Scan_SU</code>)
            </span>
          </label>

          <div className="flex flex-col gap-1 pt-1">
            <span className="nb-micro text-[10px] text-[#4B5563]">
              Aturan Konflik Nama File Bawaan di Drive
            </span>
            <select
              aria-label="Aturan konflik nama file di Drive"
              value={policyDraft}
              onChange={(e) => setPolicyDraft(e.target.value as DriveConflictPolicy)}
              className="su-control w-full rounded-xl px-3 py-2 text-xs font-semibold"
            >
              <option value="revision">Simpan sebagai _rev2 / _rev3 (Aman dari timpa)</option>
              <option value="overwrite">Timpa file lama dengan isi PDF baru</option>
              <option value="skip">Lewati upload jika nama file sudah ada</option>
            </select>
          </div>
        </div>

        {/* Apps Script Setup */}
        <div className="nb-card space-y-3 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="nb-pill border-[#DDD6FE] bg-[#F5F3FF] text-[#4C0FD1]">
              2. URL Web App Google Apps Script (Tertanam Permanen)
            </span>
            <button
              type="button"
              onClick={() => {
                if (!isAdminUnlocked) {
                  onRequirePinUnlock?.();
                  return;
                }
                setUrlDraft(DEFAULT_APPS_SCRIPT_URL);
                onClearAppsScript();
              }}
              className="nb-btn-sm inline-flex min-h-8 items-center gap-1 bg-[#F6F7F9] px-2.5 py-1 text-[11px] text-[#111114] hover:bg-white"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Gunakan URL Bawaan
            </button>
          </div>

          <div>
            <label htmlFor={urlId} className="nb-micro mb-1 block text-[#111114]">
              Web App URL Google Apps Script (berakhiran /exec)
            </label>
            <input
              id={urlId}
              type="url"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="su-control w-full rounded-xl px-3.5 py-2 font-mono text-xs font-bold"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isTesting}
              onClick={() => void handleTestConnection()}
              className="nb-btn-sm wollo-cta-dark inline-flex min-h-9 items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold disabled:opacity-55"
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              {isTesting
                ? "Menguji Koneksi Drive…"
                : "Tes Koneksi & Cek Akses Folder"}
            </button>

            <button
              type="button"
              disabled={isCheckingSheet}
              onClick={() => void handleEnsureSheet()}
              className="nb-btn-sm inline-flex min-h-9 items-center gap-1.5 border-[#A7F3D0] bg-[#ECFDF5] px-3.5 py-1.5 text-xs font-semibold text-[#065F46] hover:bg-[#D1FAE5] disabled:opacity-55"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
              {isCheckingSheet ? "Memeriksa Sheets…" : "Siapkan / Cek Google Sheets"}
            </button>

            {localSheetUrl || sheetUrl ? (
              <a
                href={localSheetUrl || sheetUrl || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="nb-btn-sm inline-flex min-h-9 items-center gap-1.5 bg-white px-3 py-1.5 text-xs font-semibold text-[#065F46] hover:bg-[#F9FAFB]"
              >
                Buka Rekap_Scan_SU
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </div>

          {verifyFeedback ? (
            <p
              role="status"
              className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                verifyFeedback.ok
                  ? "border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]"
                  : "border-[#FECDD3] bg-[#FFF1F2] text-[#9F1239]"
              }`}
            >
              {verifyFeedback.message}
            </p>
          ) : null}

          <div className="space-y-2 rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] p-3.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-[#111114]">
                Pastikan pengaturan Deploy Apps Script Anda seperti berikut:
              </p>
              <button
                type="button"
                onClick={handleCopyScript}
                className="nb-btn-sm inline-flex min-h-8 items-center gap-1.5 bg-white px-3 py-1 text-[11px] text-[#111114] hover:bg-[#F9FAFB]"
              >
                {copiedScript ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-[#065F46]" aria-hidden="true" />
                    Kode Tersalin
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-[#5E17EB]" aria-hidden="true" />
                    Salin Kode Apps Script
                  </>
                )}
              </button>
            </div>
            <ol className="list-decimal space-y-1 pl-4 font-medium text-[#4B5563]">
              <li>
                Script otomatis mencari subfolder Kecamatan lalu subfolder Kelurahan/Desa di dalamnya (jika sudah ada, PDF dimasukkan ke folder yang ada tanpa membuat folder duplikat).
              </li>
              <li>
                Di{" "}
                <a
                  href="https://script.google.com/home"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-[#5E17EB] underline"
                >
                  script.google.com
                </a>
                , tempel kode terbaru di atas, lalu klik{" "}
                <strong>Deploy → Manage deployments → Edit → pilih New version</strong> agar subfolder Kelurahan aktif.
              </li>
              <li>
                Pastikan{" "}
                <strong>Execute as / Jalankan sebagai: Me (akun Anda)</strong>{" "}
                dan{" "}
                <strong>
                  Who has access / Yang memiliki akses: Anyone (Siapa saja)
                </strong>{" "}
                — jangan pilih <em>Only myself</em> atau{" "}
                <em>Anyone with Google account</em> agar server bisa mengaksesnya.
              </li>
              <li>
                File rekap Google Sheets bernama{" "}
                <code className="font-mono font-bold text-[#111114]">Rekap_Scan_SU</code>{" "}
                disimpan langsung di Folder Induk Drive Anda (dibuat otomatis saat upload pertama atau melalui tombol Siapkan Google Sheets). Bila ingin mengotorisasi izin{" "}
                <code>SpreadsheetApp</code> &amp; langsung membuat sheet secara manual dari editor Apps Script, pilih fungsi{" "}
                <code>authorizeAndCreateSheet</code> (atau <code>ensureRekapSheet</code>) lalu klik <strong>Run</strong>.
              </li>
            </ol>
          </div>
        </div>

        {/* Server Env Alternative */}
        <div className="nb-card-sm bg-white p-3.5 text-xs">
          <p className="font-bold text-[#111114]">
            Opsi Admin Server / Vercel (`.env.local`):
          </p>
          <p className="mt-1 font-medium text-[#4B5563]">
            Untuk menghubungkan semua operator tanpa mengisi ulang di browser, set{" "}
            <code className="rounded border border-[#E5E7EB] bg-[#F6F7F9] px-1 font-mono font-bold text-[#111114]">
              GOOGLE_DRIVE_APPS_SCRIPT_URL
            </code>
            , atau kombinasi OAuth{" "}
            <code className="rounded border border-[#E5E7EB] bg-[#F6F7F9] px-1 font-mono font-bold text-[#111114]">
              GOOGLE_DRIVE_CLIENT_ID / SECRET / REFRESH_TOKEN
            </code>
            , atau{" "}
            <code className="rounded border border-[#E5E7EB] bg-[#F6F7F9] px-1 font-mono font-bold text-[#111114]">
              GOOGLE_SERVICE_ACCOUNT_JSON
            </code>{" "}
            (Shared Drive).
          </p>
        </div>

        {errorMsg ? (
          <p
            role="alert"
            className="nb-card-sm border-[#FECDD3] bg-[#FFF1F2] px-3.5 py-2.5 text-xs font-semibold text-[#9F1239]"
          >
            {errorMsg}
          </p>
        ) : null}
      </form>
    </AppDialog>
  );
}
