"use client";

import { useCallback, useEffect, useId, useState } from "react";
import {
  ArrowRightLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Folder,
  FolderInput,
  Pencil,
  RefreshCw,
  Search,
} from "lucide-react";
import { AppDialog } from "./AppDialog";
import { formatBytes } from "@/lib/session-history";
import { getKecamatanOptions, getKelurahanOptions } from "@/lib/wilayah-dict";
import type { DriveExplorerEntry } from "@/lib/su-types";

interface DriveExplorerModalProps {
  open: boolean;
  onClose: () => void;
  rootFolderId: string;
  appsScriptUrl: string;
  onNotify: (kind: "success" | "error", text: string) => void;
  onOpenDriveConfig: () => void;
}

export function DriveExplorerModal({
  open,
  onClose,
  rootFolderId,
  appsScriptUrl,
  onNotify,
  onOpenDriveConfig,
}: DriveExplorerModalProps) {
  const kecListId = useId();
  const kelListId = useId();
  const [breadcrumbs, setBreadcrumbs] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [items, setItems] = useState<DriveExplorerEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [supported, setSupported] = useState(true);
  const [unsupportedMsg, setUnsupportedMsg] = useState<string | null>(null);
  const [folderUrl, setFolderUrl] = useState("");

  // Active inline rename or move action
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [movingItem, setMovingItem] = useState<DriveExplorerEntry | null>(null);
  const [moveKec, setMoveKec] = useState("");
  const [moveKel, setMoveKel] = useState("");
  const [isMutating, setIsMutating] = useState(false);

  const loadFolder = useCallback(
    async (folderId?: string, queryStr?: string, pushCrumbName?: string) => {
      const targetId = folderId || rootFolderId;
      setIsLoading(true);
      try {
        const res = await fetch("/api/drive/explore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "list",
            folderId: targetId,
            rootFolderId,
            query: queryStr ?? "",
            appsScriptUrl,
          }),
        });
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          supported?: boolean;
          folderId?: string;
          folderName?: string;
          folderUrl?: string;
          items?: DriveExplorerEntry[];
          message?: string;
          error?: string;
        } | null;

        if (!res.ok || !data?.ok) {
          onNotify(
            "error",
            data?.error || "Gagal memuat isi folder Google Drive.",
          );
          return;
        }

        setSupported(data.supported !== false);
        setUnsupportedMsg(data.message ?? null);
        setFolderUrl(data.folderUrl || "");
        setItems(Array.isArray(data.items) ? data.items : []);

        if (!folderId || targetId === rootFolderId) {
          setBreadcrumbs([
            {
              id: rootFolderId,
              name: data.folderName || "Folder Induk Drive",
            },
          ]);
        } else if (pushCrumbName) {
          setBreadcrumbs((prev) => [
            ...prev,
            { id: targetId, name: pushCrumbName },
          ]);
        }
      } catch {
        onNotify("error", "Gagal menghubungi endpoint Drive Explorer.");
      } finally {
        setIsLoading(false);
      }
    },
    [appsScriptUrl, onNotify, rootFolderId],
  );

  useEffect(() => {
    if (!open) return;
    Promise.resolve().then(() => {
      setSearchQuery("");
      setRenamingId(null);
      setMovingItem(null);
      void loadFolder(rootFolderId, "");
    });
  }, [open, rootFolderId, loadFolder]);

  const activeFolderId =
    breadcrumbs[breadcrumbs.length - 1]?.id || rootFolderId;

  const handleConfirmRename = async (fileId: string) => {
    const clean = renameDraft.trim();
    if (!clean) return;
    setIsMutating(true);
    try {
      const res = await fetch("/api/drive/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rename",
          fileId,
          newFilename: clean,
          appsScriptUrl,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        fileName?: string;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        onNotify("error", json?.error || "Gagal mengganti nama berkas.");
        return;
      }
      onNotify("success", `Nama berkas diubah menjadi ${json.fileName || clean}.`);
      setRenamingId(null);
      await loadFolder(activeFolderId, searchQuery);
    } finally {
      setIsMutating(false);
    }
  };

  const handleConfirmMove = async () => {
    if (!movingItem || !moveKec.trim()) return;
    setIsMutating(true);
    try {
      const res = await fetch("/api/drive/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move",
          fileId: movingItem.id,
          rootFolderId,
          targetKecamatan: moveKec.trim(),
          targetKelurahan: moveKel.trim(),
          appsScriptUrl,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        folderName?: string;
        error?: string;
      } | null;
      if (!res.ok || !json?.ok) {
        onNotify("error", json?.error || "Gagal memindahkan file di Drive.");
        return;
      }
      onNotify(
        "success",
        `File dipindahkan ke folder "${json.folderName || moveKec}".`,
      );
      setMovingItem(null);
      await loadFolder(activeFolderId, searchQuery);
    } finally {
      setIsMutating(false);
    }
  };

  const kecamatanList = getKecamatanOptions();
  const kelurahanList = getKelurahanOptions(moveKec);

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Penjelajah & Manajemen Google Drive"
      subtitle="Telusuri subfolder Kecamatan/Kelurahan, cari PDF, ganti nama, atau pindahkan arsip salah folder tanpa meninggalkan aplikasi."
      maxWidthClass="max-w-4xl"
      footer={
        <>
          {folderUrl ? (
            <a
              href={folderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-white px-3.5 py-2 text-xs text-[#5E17EB]"
            >
              Buka Folder Aktif di Drive
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="nb-btn-sm wollo-cta-dark inline-flex min-h-10 items-center px-4 py-2 text-xs"
          >
            Tutup
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        <datalist id={kecListId}>
          {kecamatanList.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
        <datalist id={kelListId}>
          {kelurahanList.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>

        {!supported && unsupportedMsg ? (
          <div className="nb-card flex flex-wrap items-center justify-between gap-2 border-[#FDE68A] bg-[#FFFBEB] p-3.5 text-xs">
            <span className="font-semibold text-[#92400E]">
              {unsupportedMsg}
            </span>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenDriveConfig();
              }}
              className="nb-btn-sm bg-white px-3 py-1.5 font-semibold text-[#111114]"
            >
              Perbarui Script Drive
            </button>
          </div>
        ) : null}

        {/* Breadcrumb + Search Bar */}
        <div className="nb-card flex flex-wrap items-center justify-between gap-2.5 bg-white p-3.5">
          <nav
            aria-label="Jalur Folder Drive"
            className="flex flex-wrap items-center gap-1 text-xs font-semibold"
          >
            {breadcrumbs.map((crumb, idx) => (
              <span key={crumb.id} className="inline-flex items-center gap-1">
                {idx > 0 ? (
                  <ChevronRight className="h-3.5 w-3.5 text-[#9CA3AF]" />
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setBreadcrumbs((prev) => prev.slice(0, idx + 1));
                    void loadFolder(crumb.id, searchQuery);
                  }}
                  className={`rounded-lg px-2 py-1 transition-colors ${
                    idx === breadcrumbs.length - 1
                      ? "bg-[#F5F3FF] font-bold text-[#5E17EB]"
                      : "text-[#4B5563] hover:bg-[#F6F7F9]"
                  }`}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void loadFolder(activeFolderId, searchQuery);
            }}
            className="flex items-center gap-1.5"
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari folder / nama PDF…"
                className="su-control min-h-9 w-48 rounded-lg pl-8 pr-2.5 text-xs sm:w-56"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="nb-btn-sm wollo-cta-primary min-h-9 px-3 text-xs"
            >
              Cari
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => void loadFolder(activeFolderId, searchQuery)}
              aria-label="Segarkan isi folder"
              className="nb-btn-sm inline-flex min-h-9 min-w-9 items-center justify-center bg-[#F6F7F9]"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
              />
            </button>
          </form>
        </div>

        {/* Inline Move File Box */}
        {movingItem ? (
          <div className="nb-card space-y-2.5 border-[#DDD6FE] bg-[#F5F3FF] p-3.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-bold text-[#4C0FD1]">
                <ArrowRightLeft className="h-4 w-4" />
                Pindahkan File: <span className="font-mono">{movingItem.name}</span>
              </span>
              <button
                type="button"
                onClick={() => setMovingItem(null)}
                className="font-semibold text-[#4B5563] hover:text-[#111114]"
              >
                Batal
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input
                type="text"
                list={kecListId}
                placeholder="Kecamatan Tujuan"
                value={moveKec}
                onChange={(e) => setMoveKec(e.target.value)}
                className="su-control min-h-9 rounded-lg px-3 py-1.5 text-xs font-bold"
              />
              <input
                type="text"
                list={kelListId}
                placeholder="Kelurahan Tujuan (opsional)"
                value={moveKel}
                onChange={(e) => setMoveKel(e.target.value)}
                className="su-control min-h-9 rounded-lg px-3 py-1.5 text-xs font-bold"
              />
              <button
                type="button"
                disabled={isMutating || !moveKec.trim()}
                onClick={() => void handleConfirmMove()}
                className="nb-btn-sm wollo-cta-primary min-h-9 px-4 text-xs disabled:opacity-50"
              >
                Pindahkan Sekarang
              </button>
            </div>
          </div>
        ) : null}

        {/* Items List */}
        {isLoading ? (
          <div className="nb-card bg-white p-8 text-center text-xs font-semibold text-[#4B5563]">
            Memuat daftar folder dan arsip Google Drive…
          </div>
        ) : items.length === 0 ? (
          <div className="nb-card bg-white p-8 text-center text-xs font-medium text-[#4B5563]">
            Tidak ada subfolder atau file yang cocok di folder ini.
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="nb-card-sm flex flex-wrap items-center justify-between gap-2 bg-white px-3.5 py-2.5 text-xs"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  {item.kind === "folder" ? (
                    <Folder className="h-4.5 w-4.5 shrink-0 text-[#5E17EB]" />
                  ) : (
                    <FileText className="h-4.5 w-4.5 shrink-0 text-[#4B5563]" />
                  )}

                  {renamingId === item.id ? (
                    <div className="flex flex-1 items-center gap-1.5">
                      <input
                        type="text"
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        className="su-control min-h-8 flex-1 rounded-lg px-2.5 py-1 font-mono text-xs font-bold"
                      />
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => void handleConfirmRename(item.id)}
                        className="nb-btn-sm wollo-cta-primary min-h-8 px-2.5 text-[11px]"
                      >
                        Simpan
                      </button>
                      <button
                        type="button"
                        onClick={() => setRenamingId(null)}
                        className="nb-btn-sm min-h-8 bg-[#F6F7F9] px-2 text-[11px]"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <p className="truncate font-mono font-bold text-[#111114]">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-[#4B5563]">
                        {item.kind === "folder"
                          ? "Subfolder"
                          : item.sizeBytes
                            ? formatBytes(item.sizeBytes)
                            : "Berkas"}
                        {item.updatedAt
                          ? ` · ${new Date(item.updatedAt).toLocaleDateString("id-ID")}`
                          : ""}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {item.kind === "folder" ? (
                    <button
                      type="button"
                      onClick={() =>
                        void loadFolder(item.id, "", item.name)
                      }
                      className="nb-btn-sm min-h-8 bg-[#F5F3FF] px-3 text-[11px] font-semibold text-[#4C0FD1]"
                    >
                      Buka Folder
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingId(item.id);
                          setRenameDraft(item.name);
                        }}
                        className="nb-btn-sm inline-flex min-h-8 items-center gap-1 bg-[#F6F7F9] px-2.5 text-[11px]"
                      >
                        <Pencil className="h-3 w-3" />
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMovingItem(item);
                          setMoveKec("");
                          setMoveKel("");
                        }}
                        className="nb-btn-sm inline-flex min-h-8 items-center gap-1 bg-[#F6F7F9] px-2.5 text-[11px]"
                      >
                        <FolderInput className="h-3 w-3" />
                        Pindah
                      </button>
                    </>
                  )}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="nb-btn-sm inline-flex min-h-8 items-center gap-1 bg-white px-2.5 text-[11px] text-[#111114]"
                  >
                    Drive
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppDialog>
  );
}
