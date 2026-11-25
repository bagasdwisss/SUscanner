"use client";

import { useId, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FolderOpen,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { AppDialog } from "./AppDialog";
import {
  buildDriveFolderUrl,
  GOOGLE_APPS_SCRIPT_TEMPLATE,
  validateAppsScriptWebhookUrl,
} from "@/lib/drive-config";
import {
  DEFAULT_DRIVE_ROOT_FOLDER_ID,
  extractDriveFolderId,
} from "@/lib/su-formatter";
import type { DriveStatusResponse } from "@/lib/su-types";

interface DriveConfigDialogProps {
  open: boolean;
  onClose: () => void;
  serverStatus: DriveStatusResponse | null;
  appsScriptUrl: string;
  rootFolderInput: string;
  autoUploadOnExport: boolean;
  onSaveConfig: (next: {
    appsScriptUrl: string;
    rootFolderId: string;
    autoUploadOnExport: boolean;
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
  onSaveConfig,
  onClearAppsScript,
}: DriveConfigDialogProps) {
  const [urlDraft, setUrlDraft] = useState(appsScriptUrl);
  const [folderDraft, setFolderDraft] = useState(
    rootFolderInput || DEFAULT_DRIVE_ROOT_FOLDER_ID,
  );
  const [autoDraft, setAutoDraft] = useState(autoUploadOnExport);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);

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
    const cleanedFolder = extractDriveFolderId(folderDraft);
    if (!cleanedFolder) {
      setErrorMsg(
        "Link atau ID Folder Google Drive tidak valid. Salin URL folder Drive atau ID-nya.",
      );
      return;
    }

    const trimmedUrl = urlDraft.trim();
    if (trimmedUrl && !validateAppsScriptWebhookUrl(trimmedUrl)) {
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
    });
    onClose();
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Pengaturan Google Drive & Subfolder Kecamatan"
      subtitle="Berkas PDF yang selesai dipindai akan otomatis dimasukkan ke subfolder sesuai nama Kecamatan."
      maxWidthClass="max-w-3xl"
      headerBgClass="bg-[#BAE6FD]"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="nb-btn-sm inline-flex min-h-10 items-center bg-white px-4 py-2 text-xs font-extrabold text-[#111111]"
          >
            Batal
          </button>
          <button
            type="submit"
            form="drive-config-form"
            className="nb-btn-sm inline-flex min-h-10 items-center bg-[#D9F99D] px-5 py-2 text-xs font-black text-[#111111]"
          >
            Simpan Pengaturan Drive
          </button>
        </>
      }
    >
      <form id="drive-config-form" onSubmit={handleSave} className="space-y-4 text-sm">
        {/* Connection Status Banner */}
        <div
          className={`nb-card-sm flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${
            isReady ? "bg-[#D9F99D]" : "bg-[#FEF08A]"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-[#111111]" aria-hidden="true" />
            <div>
              <p className="text-xs font-black text-[#111111] uppercase">
                {serverConfigured
                  ? `Koneksi Server Aktif (${serverStatus?.mode})`
                  : browserConfigured
                    ? "Koneksi Google Apps Script Aktif (Browser Ini)"
                    : "Belum Terhubung — Pilih Cara Hubungkan di Bawah"}
              </p>
              <p className="text-xs font-semibold text-[#111111]/85">
                {isReady
                  ? "Siap membuat subfolder Kecamatan dan mengunggah PDF langsung ke Drive."
                  : "Isi URL Web App Apps Script (2 menit) atau atur variabel .env.local di server."}
              </p>
            </div>
          </div>

          <a
            href={resolvedFolderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="nb-btn-sm inline-flex min-h-9 items-center gap-1.5 bg-white px-3 py-1.5 text-xs font-extrabold text-[#111111]"
          >
            <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
            Buka Folder Induk
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>

        {/* Folder Induk Config */}
        <div className="nb-card bg-white p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={folderId} className="nb-micro text-[#111111]">
              1. URL atau ID Folder Induk Google Drive
            </label>
            <button
              type="button"
              onClick={() => setFolderDraft(DEFAULT_DRIVE_ROOT_FOLDER_ID)}
              className="nb-btn-sm inline-flex min-h-8 items-center gap-1 bg-[#F6F5F0] px-2.5 py-1 text-[11px] text-[#111111]"
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
          <p className="text-xs font-medium text-[#3F3F46]">
            Folder aktif:{" "}
            <code className="rounded border border-[#111111]/30 bg-[#F6F5F0] px-1.5 py-0.5 font-mono font-bold text-[#111111]">
              {resolvedFolderId}
            </code>{" "}
            — Subfolder seperti <code className="font-mono font-bold">/Medan Helvetia/</code>{" "}
            akan dibuat otomatis di dalam folder ini.
          </p>

          <label className="mt-1 inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-xl border-2 border-[#111111] bg-[#FEF08A] px-3 py-2 text-xs font-extrabold text-[#111111]">
            <input
              type="checkbox"
              checked={autoDraft}
              onChange={(e) => setAutoDraft(e.target.checked)}
              className="h-4 w-4"
            />
            <span>
              Otomatis unggah ke Google Drive setiap kali menekan{" "}
              <strong>Buat &amp; Unduh PDF</strong>
            </span>
          </label>
        </div>

        {/* Apps Script Setup */}
        <div className="nb-card bg-[#FEF08A] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="nb-pill">2. Cara Tercepat · Google Apps Script Web App</span>
            {urlDraft ? (
              <button
                type="button"
                onClick={() => {
                  setUrlDraft("");
                  onClearAppsScript();
                }}
                className="nb-btn-sm inline-flex min-h-8 items-center gap-1 bg-[#FBCFE8] px-2.5 py-1 text-[11px] text-[#111111]"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
                Hapus URL
              </button>
            ) : null}
          </div>

          <div>
            <label htmlFor={urlId} className="nb-micro mb-1 block text-[#111111]">
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

          <div className="rounded-xl border-2 border-[#111111] bg-white p-3.5 text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-extrabold text-[#111111]">
                Langkah pasang 2 menit (tanpa Google Cloud Console / tanpa kartu kredit):
              </p>
              <button
                type="button"
                onClick={handleCopyScript}
                className="nb-btn-sm inline-flex min-h-8 items-center gap-1.5 bg-[#D9F99D] px-3 py-1 text-[11px] text-[#111111]"
              >
                {copiedScript ? (
                  <>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Kode Tersalin
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    Salin Kode Apps Script
                  </>
                )}
              </button>
            </div>
            <ol className="list-decimal space-y-1 pl-4 font-semibold text-[#3F3F46]">
              <li>
                Buka{" "}
                <a
                  href="https://script.google.com/home"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-extrabold text-[#111111] underline"
                >
                  script.google.com
                </a>{" "}
                dengan akun Google pemilik folder Drive di atas, lalu klik <strong>New project</strong>.
              </li>
              <li>
                Klik tombol <strong>Salin Kode Apps Script</strong> di atas dan tempelkan ke editor script.
              </li>
              <li>
                Klik <strong>Deploy → New deployment → Web app</strong>. Atur{" "}
                <strong>Execute as: Me</strong> dan <strong>Who has access: Anyone</strong>, lalu salin URL{" "}
                <code className="font-mono">/exec</code> ke kolom di atas.
              </li>
            </ol>
          </div>
        </div>

        {/* Server Env Alternative */}
        <div className="nb-card-sm bg-[#FBCFE8] p-3.5 text-xs">
          <p className="font-extrabold text-[#111111]">
            Opsi Admin Server / Vercel (`.env.local`):
          </p>
          <p className="mt-1 font-semibold text-[#111111]/85">
            Untuk menghubungkan semua operator tanpa mengisi ulang di browser, set{" "}
            <code className="rounded bg-white px-1 font-mono font-bold">
              GOOGLE_DRIVE_APPS_SCRIPT_URL
            </code>
            , atau kombinasi OAuth{" "}
            <code className="rounded bg-white px-1 font-mono font-bold">
              GOOGLE_DRIVE_CLIENT_ID / SECRET / REFRESH_TOKEN
            </code>
            , atau{" "}
            <code className="rounded bg-white px-1 font-mono font-bold">
              GOOGLE_SERVICE_ACCOUNT_JSON
            </code>{" "}
            (Shared Drive).
          </p>
        </div>

        {errorMsg ? (
          <p
            role="alert"
            className="nb-card-sm bg-[#FECACA] px-3.5 py-2.5 text-xs font-extrabold text-[#111111]"
          >
            {errorMsg}
          </p>
        ) : null}
      </form>
    </AppDialog>
  );
}
