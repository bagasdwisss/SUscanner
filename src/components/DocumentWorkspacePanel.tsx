"use client";

import { useId, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Camera,
  Crop,
  FolderOpen,
  Maximize2,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { PageSlot, ScanFilter, ScannedPageState } from "@/lib/su-types";

const ACCEPT_IMAGES =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";

const FILTER_OPTIONS: ReadonlyArray<{
  id: ScanFilter;
  label: string;
  hint: string;
}> = [
  { id: "original", label: "Original", hint: "Warna asli tanpa filter" },
  {
    id: "magic",
    label: "Magic Color",
    hint: "Kertas putih cerah, stempel tetap berwarna",
  },
  { id: "grayscale", label: "Grayscale", hint: "Abu-abu dokumen bersih" },
  {
    id: "bw",
    label: "B&W Crisp",
    hint: "Kontras hitam-putih tajam untuk peta bidang",
  },
];

interface DocumentWorkspacePanelProps {
  activeTab: PageSlot;
  onSelectTab: (tab: PageSlot) => void;
  page1: ScannedPageState | null;
  page2: ScannedPageState | null;
  allowSinglePagePdf: boolean;
  onToggleAllowSinglePage: (allowed: boolean) => void;
  onSwapPages: () => void;
  onRotateActive: (delta: -90 | 90) => void;
  onOpenManualCrop: () => void;
  onFilterChange: (filter: ScanFilter) => void;
  onAdjustmentChange: (brightness: number, contrast: number) => void;
  onResetAdjustments: () => void;
  onUploadSlot: (slot: PageSlot, file: File) => void;
}

function getOrientationBadge(page: ScannedPageState | null): string {
  if (!page) return "Kosong";
  const w = page.processedWidth || page.rawWidth;
  const h = page.processedHeight || page.rawHeight;
  return w >= h ? "L" : "P";
}

export function DocumentWorkspacePanel({
  activeTab,
  onSelectTab,
  page1,
  page2,
  allowSinglePagePdf,
  onToggleAllowSinglePage,
  onSwapPages,
  onRotateActive,
  onOpenManualCrop,
  onFilterChange,
  onAdjustmentChange,
  onResetAdjustments,
  onUploadSlot,
}: DocumentWorkspacePanelProps) {
  const activePage = activeTab === "page1" ? page1 : page2;
  const tab1Ref = useRef<HTMLButtonElement>(null);
  const tab2Ref = useRef<HTMLButtonElement>(null);
  const replaceInputId = useId();
  const emptyUploadInputId = useId();
  const emptyCameraInputId = useId();

  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [isFitMode, setIsFitMode] = useState<boolean>(true);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const resetView = () => {
    setIsFitMode(true);
    setZoomPercent(100);
    setPan({ x: 0, y: 0 });
  };

  const handleTabSwitch = (nextTab: PageSlot) => {
    onSelectTab(nextTab);
    resetView();
  };

  const handleTabKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    current: PageSlot,
  ) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const target: PageSlot = current === "page1" ? "page2" : "page1";
      handleTabSwitch(target);
      if (target === "page1") tab1Ref.current?.focus();
      else tab2Ref.current?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      handleTabSwitch("page1");
      tab1Ref.current?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      handleTabSwitch("page2");
      tab2Ref.current?.focus();
    }
  };

  const stepZoom = (delta: number) => {
    setIsFitMode(false);
    setZoomPercent((prev) => {
      const next = Math.max(50, Math.min(300, prev + delta));
      if (next <= 100) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const setExact100 = () => {
    setIsFitMode(false);
    setZoomPercent(100);
    setPan({ x: 0, y: 0 });
  };

  const tablistFocusgroupProps = {
    focusgroup: "tablist nomemory",
  } as Record<string, string>;

  const tab1FocusProps =
    activeTab === "page1" ? ({ focusgroupstart: "" } as Record<string, string>) : {};
  const tab2FocusProps =
    activeTab === "page2" ? ({ focusgroupstart: "" } as Record<string, string>) : {};

  return (
    <section
      aria-label="Panel Pratinjau dan Pemindaian Dokumen"
      className="flex flex-col rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-xs"
    >
      {/* Top Tabs & Swap Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-3 pt-2 sm:px-4">
        <div
          role="tablist"
          aria-label="Pilih Halaman Surat Ukur"
          {...tablistFocusgroupProps}
          className="flex items-center gap-1 overflow-x-auto"
        >
          <button
            ref={tab1Ref}
            id="tab-page1"
            type="button"
            role="tab"
            aria-selected={activeTab === "page1"}
            {...tab1FocusProps}
            onClick={() => handleTabSwitch("page1")}
            onKeyDown={(e) => handleTabKeyDown(e, "page1")}
            className="su-tab inline-flex min-h-11 flex-none items-center gap-2 px-3.5 py-2.5 text-sm font-semibold text-[var(--ink-secondary)] transition-colors hover:text-[var(--ink-primary)]"
          >
            <span>Hal 1 · Data SU</span>
            <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[var(--ink-primary)]">
              {getOrientationBadge(page1)}
            </span>
          </button>

          <button
            ref={tab2Ref}
            id="tab-page2"
            type="button"
            role="tab"
            aria-selected={activeTab === "page2"}
            {...tab2FocusProps}
            onClick={() => handleTabSwitch("page2")}
            onKeyDown={(e) => handleTabKeyDown(e, "page2")}
            className="su-tab inline-flex min-h-11 flex-none items-center gap-2 px-3.5 py-2.5 text-sm font-semibold text-[var(--ink-secondary)] transition-colors hover:text-[var(--ink-primary)]"
          >
            <span>Hal 2 · Peta Bidang</span>
            <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-[11px] font-bold text-[var(--ink-primary)]">
              {getOrientationBadge(page2)}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={onSwapPages}
          disabled={!page1 && !page2}
          className="mb-1.5 inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[var(--border-control)] bg-[var(--surface-card)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-primary)] transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-50"
        >
          <ArrowLeftRight className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
          <span>Tukar Hal 1 &amp; 2</span>
          <kbd className="hidden rounded bg-[var(--surface-muted)] px-1.5 py-0.5 font-mono text-[10px] sm:inline">
            S
          </kbd>
        </button>
      </div>

      {/* Active Image Toolbar */}
      {activePage ? (
        <div className="space-y-3 border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]/35 px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Geometry Actions */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onRotateActive(-90)}
                disabled={activePage.isProcessing}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-primary)] transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                -90°
              </button>
              <button
                type="button"
                onClick={() => onRotateActive(90)}
                disabled={activePage.isProcessing}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-primary)] transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-50"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                +90°
                <kbd className="hidden rounded bg-[var(--surface-muted)] px-1 font-mono text-[10px] sm:inline">
                  R
                </kbd>
              </button>
              <button
                type="button"
                onClick={onOpenManualCrop}
                disabled={activePage.isProcessing}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--border-control)] bg-[var(--surface-card)] px-3 py-1.5 text-xs font-semibold text-[var(--ink-primary)] transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-50"
              >
                <Crop className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
                Atur Sudut Crop
              </button>

              <input
                id={replaceInputId}
                type="file"
                accept={ACCEPT_IMAGES}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadSlot(activeTab, file);
                  e.target.value = "";
                }}
                className="visually-hidden"
              />
              <label
                htmlFor={replaceInputId}
                className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 py-1.5 text-xs font-semibold text-[var(--ink-secondary)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink-primary)]"
              >
                <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                Ganti File
              </label>
            </div>

            {/* Filter Presets */}
            <div
              role="group"
              aria-label="Filter Pemindaian Dokumen"
              className="flex flex-wrap items-center gap-1.5"
            >
              {FILTER_OPTIONS.map((f) => {
                const selected = activePage.filter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={selected}
                    title={f.hint}
                    onClick={() => onFilterChange(f.id)}
                    className={`inline-flex min-h-9 items-center rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                      selected
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--ink-primary)] hover:bg-[var(--surface-muted)]"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Brightness & Contrast Sliders */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <div className="flex min-w-[180px] flex-1 items-center gap-2">
              <SlidersHorizontal
                className="h-3.5 w-3.5 shrink-0 text-[var(--ink-secondary)]"
                aria-hidden="true"
              />
              <label
                htmlFor={`brightness-${activeTab}`}
                className="w-16 shrink-0 font-semibold text-[var(--ink-secondary)]"
              >
                Kecerahan
              </label>
              <input
                id={`brightness-${activeTab}`}
                type="range"
                min={-50}
                max={50}
                step={5}
                value={activePage.brightness}
                onChange={(e) =>
                  onAdjustmentChange(Number(e.target.value), activePage.contrast)
                }
                className="h-2 w-full cursor-pointer"
              />
              <span className="w-8 text-right font-mono font-semibold text-[var(--ink-primary)]">
                {activePage.brightness > 0
                  ? `+${activePage.brightness}`
                  : activePage.brightness}
              </span>
            </div>

            <div className="flex min-w-[180px] flex-1 items-center gap-2">
              <label
                htmlFor={`contrast-${activeTab}`}
                className="w-14 shrink-0 font-semibold text-[var(--ink-secondary)]"
              >
                Kontras
              </label>
              <input
                id={`contrast-${activeTab}`}
                type="range"
                min={-50}
                max={50}
                step={5}
                value={activePage.contrast}
                onChange={(e) =>
                  onAdjustmentChange(
                    activePage.brightness,
                    Number(e.target.value),
                  )
                }
                className="h-2 w-full cursor-pointer"
              />
              <span className="w-8 text-right font-mono font-semibold text-[var(--ink-primary)]">
                {activePage.contrast > 0
                  ? `+${activePage.contrast}`
                  : activePage.contrast}
              </span>
            </div>

            {activePage.brightness !== 0 || activePage.contrast !== 0 ? (
              <button
                type="button"
                onClick={onResetAdjustments}
                className="rounded-md px-2 py-1 text-xs font-semibold text-[var(--accent)] hover:underline"
              >
                Reset Cahaya
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Main Preview Canvas Stage */}
      <div
        role="tabpanel"
        aria-labelledby={activeTab === "page1" ? "tab-page1" : "tab-page2"}
        tabIndex={0}
        className="su-drafting-stage relative flex min-h-[380px] flex-1 flex-col items-center justify-center overflow-hidden p-4 sm:min-h-[500px]"
      >
        {activePage ? (
          <>
            {/* Top-left Metadata Pill */}
            <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)]/92 px-2.5 py-1 font-mono text-[11px] font-semibold text-[var(--ink-primary)] shadow-xs backdrop-blur-xs">
                {activeTab === "page1" ? "Hal 1" : "Hal 2"} ·{" "}
                {activePage.processedWidth >= activePage.processedHeight
                  ? "Landscape"
                  : "Portrait"}{" "}
                ({activePage.processedWidth}×{activePage.processedHeight}px)
              </span>
              {activePage.hasAutoContour ? (
                <span className="rounded-lg bg-emerald-600/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow-xs">
                  Auto-Crop Aktif
                </span>
              ) : null}
            </div>

            {/* Interactive Zoom & Pan Container */}
            <div
              onPointerDown={(e) => {
                if (isFitMode && zoomPercent <= 100) return;
                dragRef.current = {
                  dragging: true,
                  startX: e.clientX,
                  startY: e.clientY,
                  origX: pan.x,
                  origY: pan.y,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!dragRef.current.dragging) return;
                setPan({
                  x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
                  y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
                });
              }}
              onPointerUp={(e) => {
                dragRef.current.dragging = false;
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
              }}
              style={{
                touchAction: !isFitMode && zoomPercent > 100 ? "none" : "auto",
              }}
              className={`flex h-full w-full items-center justify-center overflow-hidden ${
                !isFitMode && zoomPercent > 100
                  ? "cursor-grab active:cursor-grabbing"
                  : ""
              }`}
            >
              {activePage.processedDataUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={activePage.processedDataUrl}
                  alt={`Pratinjau hasil pemindaian ${
                    activeTab === "page1"
                      ? "Halaman 1 Data Surat Ukur"
                      : "Halaman 2 Gambar Peta Bidang"
                  }`}
                  draggable={false}
                  style={
                    isFitMode
                      ? undefined
                      : {
                          transform: `translate(${pan.x}px, ${pan.y}px) scale(${
                            zoomPercent / 100
                          })`,
                          transformOrigin: "center center",
                        }
                  }
                  className={`block select-none rounded-md border border-slate-400/40 bg-white shadow-xl transition-transform duration-100 ${
                    isFitMode
                      ? "max-h-[450px] max-w-full object-contain sm:max-h-[540px]"
                      : "max-h-[450px] max-w-full object-contain sm:max-h-[540px]"
                  }`}
                />
              ) : null}
            </div>

            {activePage.isProcessing ? (
              <div
                role="status"
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-slate-950/40 backdrop-blur-[1px]"
              >
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-3 text-center shadow-lg">
                  <p className="text-xs font-semibold text-[var(--ink-primary)]">
                    Memproses perspektif &amp; filter…
                  </p>
                  <progress
                    aria-label="Memproses pemindaian"
                    className="su-progress mt-2 h-1.5 w-44"
                  />
                </div>
              </div>
            ) : null}

            {/* Floating Zoom Controls */}
            <div className="mt-3 inline-flex items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)]/95 p-1 shadow-md backdrop-blur-xs">
              <button
                type="button"
                aria-label="Perkecil pratinjau"
                onClick={() => stepZoom(-25)}
                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[var(--ink-primary)] hover:bg-[var(--surface-muted)]"
              >
                <ZoomOut className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={setExact100}
                className={`min-h-9 rounded-lg px-2.5 font-mono text-xs font-semibold ${
                  !isFitMode && zoomPercent === 100
                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "text-[var(--ink-primary)] hover:bg-[var(--surface-muted)]"
                }`}
              >
                {isFitMode ? "Fit" : `${zoomPercent}%`}
              </button>
              <button
                type="button"
                aria-label="Perbesar pratinjau"
                onClick={() => stepZoom(25)}
                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[var(--ink-primary)] hover:bg-[var(--surface-muted)]"
              >
                <ZoomIn className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={resetView}
                aria-label="Sesuaikan layar"
                className={`inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold ${
                  isFitMode
                    ? "bg-[var(--surface-muted)] text-[var(--accent)]"
                    : "text-[var(--ink-secondary)] hover:bg-[var(--surface-muted)]"
                }`}
              >
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                Fit
              </button>
            </div>
          </>
        ) : (
          /* Empty Slot Inline Uploader (Edge Case #5) */
          <div className="max-w-sm rounded-2xl border-2 border-dashed border-[var(--border-control)] bg-[var(--surface-card)] p-6 text-center shadow-sm">
            <h2 className="text-base font-bold text-[var(--ink-primary)]">
              {activeTab === "page1"
                ? "Halaman 1 (Data SU) Belum Diunggah"
                : "Halaman 2 (Peta Bidang) Belum Diunggah"}
            </h2>
            <p className="mt-1.5 text-xs text-[var(--ink-secondary)]">
              {activeTab === "page2"
                ? "Tambahkan foto/scan Gambar Bidang untuk digabungkan sebagai halaman kedua PDF."
                : "Tambahkan foto/scan halaman utama Surat Ukur untuk pembacaan nama file otomatis."}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <input
                id={emptyUploadInputId}
                type="file"
                accept={ACCEPT_IMAGES}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadSlot(activeTab, file);
                  e.target.value = "";
                }}
                className="visually-hidden"
              />
              <label
                htmlFor={emptyUploadInputId}
                className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-ink)]"
              >
                <FolderOpen className="h-4 w-4" aria-hidden="true" />
                Pilih File
              </label>

              <input
                id={emptyCameraInputId}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadSlot(activeTab, file);
                  e.target.value = "";
                }}
                className="visually-hidden"
              />
              <label
                htmlFor={emptyCameraInputId}
                className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-[var(--border-control)] bg-[var(--surface-card)] px-4 py-2 text-xs font-semibold text-[var(--ink-primary)]"
              >
                <Camera className="h-4 w-4" aria-hidden="true" />
                Kamera
              </label>
            </div>
          </div>
        )}
      </div>

      {/* PDF Page Order Thumbnail Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-bold tracking-wide text-[var(--ink-secondary)] uppercase">
            Urutan PDF:
          </span>

          <button
            type="button"
            onClick={() => handleTabSwitch("page1")}
            className={`flex items-center gap-2 rounded-xl border p-1.5 pr-3 text-left transition-colors ${
              activeTab === "page1"
                ? "border-[var(--accent)] bg-[var(--accent)]/8"
                : "border-[var(--border-subtle)] hover:bg-[var(--surface-muted)]"
            }`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-slate-100 dark:bg-slate-800">
              {page1?.processedDataUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={page1.processedDataUrl}
                  alt="Thumbnail Halaman 1"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-[10px] font-semibold text-[var(--ink-secondary)]">
                  —
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-[var(--ink-primary)]">
                Hal 1 ({getOrientationBadge(page1)})
              </p>
              <p className="text-[11px] text-[var(--ink-secondary)]">Data SU</p>
            </div>
          </button>

          <span
            aria-hidden="true"
            className="text-sm font-bold text-[var(--ink-secondary)]"
          >
            →
          </span>

          <button
            type="button"
            onClick={() => handleTabSwitch("page2")}
            className={`flex items-center gap-2 rounded-xl border p-1.5 pr-3 text-left transition-colors ${
              activeTab === "page2"
                ? "border-[var(--accent)] bg-[var(--accent)]/8"
                : "border-[var(--border-subtle)] hover:bg-[var(--surface-muted)]"
            }`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-slate-100 dark:bg-slate-800">
              {page2?.processedDataUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={page2.processedDataUrl}
                  alt="Thumbnail Halaman 2"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-[10px] font-semibold text-[var(--ink-secondary)]">
                  +
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-[var(--ink-primary)]">
                Hal 2 ({getOrientationBadge(page2)})
              </p>
              <p className="text-[11px] text-[var(--ink-secondary)]">
                {page2 ? "Peta Bidang" : "Belum diisi"}
              </p>
            </div>
          </button>
        </div>

        {/* Edge Case #5: Allow 1-page PDF export if Page 2 is intentionally omitted */}
        {page1 && !page2 ? (
          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-amber-400/60 bg-amber-50/70 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
            <input
              type="checkbox"
              checked={allowSinglePagePdf}
              onChange={(e) => onToggleAllowSinglePage(e.target.checked)}
              className="h-4 w-4"
            />
            <span>Tetap buat PDF 1 halaman</span>
          </label>
        ) : null}
      </div>
    </section>
  );
}
