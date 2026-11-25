"use client";

import { useRef, useState } from "react";
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
  onSwapPages: () => void;
  onRotateActive: (delta: -90 | 90) => void;
  onOpenManualCrop: () => void;
  onFilterChange: (filter: ScanFilter) => void;
  onAdjustmentChange: (brightness: number, contrast: number) => void;
  onResetAdjustments: () => void;
  onUploadSlot: (slot: PageSlot, file: File) => void;
  onOpenCamera: (slot: PageSlot) => void;
}

function getOrientationBadge(page: ScannedPageState | null): string {
  if (!page) return "KOSONG";
  const w = page.processedWidth || page.rawWidth;
  const h = page.processedHeight || page.rawHeight;
  return w >= h ? "L" : "P";
}

export function DocumentWorkspacePanel({
  activeTab,
  onSelectTab,
  page1,
  page2,
  onSwapPages,
  onRotateActive,
  onOpenManualCrop,
  onFilterChange,
  onAdjustmentChange,
  onResetAdjustments,
  onUploadSlot,
  onOpenCamera,
}: DocumentWorkspacePanelProps) {
  const activePage = activeTab === "page1" ? page1 : page2;
  const tab1Ref = useRef<HTMLButtonElement>(null);
  const tab2Ref = useRef<HTMLButtonElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const emptyUploadInputRef = useRef<HTMLInputElement>(null);

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
    activeTab === "page1"
      ? ({ focusgroupstart: "" } as Record<string, string>)
      : {};
  const tab2FocusProps =
    activeTab === "page2"
      ? ({ focusgroupstart: "" } as Record<string, string>)
      : {};

  return (
    <section
      aria-label="Panel Pratinjau dan Pemindaian Dokumen"
      className="flex flex-col gap-4"
    >
      {/* Bento Card 1: Page Tabs & Swap Header */}
      <div className="nb-card flex flex-wrap items-center justify-between gap-2 bg-[#FEF08A] px-3.5 py-2.5 sm:px-4">
        <div
          role="tablist"
          aria-label="Pilih Halaman Surat Ukur"
          {...tablistFocusgroupProps}
          className="flex items-center gap-2 overflow-x-auto py-0.5"
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
            className="su-tab inline-flex min-h-10 flex-none items-center gap-2 rounded-xl border-2 border-[#111111] bg-white px-3.5 py-2 text-xs font-extrabold text-[#111111] sm:text-sm"
          >
            <span>Hal 1 · Data SU</span>
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-black ${
                activeTab === "page1"
                  ? "bg-[#FEF08A] text-[#111111]"
                  : "bg-[#111111] text-[#F6F5F0]"
              }`}
            >
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
            className="su-tab inline-flex min-h-10 flex-none items-center gap-2 rounded-xl border-2 border-[#111111] bg-white px-3.5 py-2 text-xs font-extrabold text-[#111111] sm:text-sm"
          >
            <span>Hal 2 · Peta Bidang</span>
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-black ${
                activeTab === "page2"
                  ? "bg-[#FEF08A] text-[#111111]"
                  : "bg-[#111111] text-[#F6F5F0]"
              }`}
            >
              {getOrientationBadge(page2)}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={onSwapPages}
          disabled={!page1 && !page2}
          className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-[#FBCFE8] px-3.5 py-1.5 text-xs text-[#111111] disabled:opacity-50"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Tukar Hal 1 &amp; 2</span>
          <kbd className="hidden rounded border border-[#111111] bg-[#111111] px-1.5 py-0.5 font-mono text-[10px] text-[#FEF08A] sm:inline">
            S
          </kbd>
        </button>
      </div>

      {/* Bento Card 2: Active Image Toolbar */}
      {activePage ? (
        <div className="nb-card space-y-3 bg-[#BAE6FD] px-3.5 py-3.5 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onRotateActive(-90)}
                disabled={activePage.isProcessing}
                className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-white px-2.5 py-1.5 text-xs text-[#111111] disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                -90°
              </button>
              <button
                type="button"
                onClick={() => onRotateActive(90)}
                disabled={activePage.isProcessing}
                className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-white px-2.5 py-1.5 text-xs text-[#111111] disabled:opacity-50"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                +90°
                <kbd className="hidden rounded bg-[#111111] px-1 font-mono text-[10px] text-[#FEF08A] sm:inline">
                  R
                </kbd>
              </button>
              <button
                type="button"
                onClick={onOpenManualCrop}
                disabled={activePage.isProcessing}
                className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-[#FEF08A] px-3 py-1.5 text-xs text-[#111111] disabled:opacity-50"
              >
                <Crop className="h-3.5 w-3.5" aria-hidden="true" />
                Atur Sudut Crop
              </button>

              <input
                ref={replaceInputRef}
                type="file"
                accept={ACCEPT_IMAGES}
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadSlot(activeTab, file);
                  e.target.value = "";
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => replaceInputRef.current?.click()}
                className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-white px-2.5 py-1.5 text-xs text-[#111111]"
              >
                <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                Ganti File
              </button>
              <button
                type="button"
                onClick={() => onOpenCamera(activeTab)}
                className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-[#FBCFE8] px-2.5 py-1.5 text-xs text-[#111111]"
              >
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                Kamera
              </button>
            </div>

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
                    className={`inline-flex min-h-9 items-center rounded-xl border-2 border-[#111111] px-2.5 py-1 text-xs font-extrabold transition-colors ${
                      selected
                        ? "bg-[#111111] text-[#FEF08A]"
                        : "bg-white text-[#111111] hover:bg-[#FEF08A]"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border-2 border-[#111111] bg-white px-3 py-2 text-xs">
            <div className="flex w-full items-center gap-2 sm:min-w-[180px] sm:flex-1">
              <SlidersHorizontal
                className="h-3.5 w-3.5 shrink-0 text-[#111111]"
                aria-hidden="true"
              />
              <label
                htmlFor={`brightness-${activeTab}`}
                className="nb-micro w-20 shrink-0 text-[#111111]"
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
              <span className="w-9 text-right font-mono font-extrabold text-[#111111]">
                {activePage.brightness > 0
                  ? `+${activePage.brightness}`
                  : activePage.brightness}
              </span>
            </div>

            <div className="flex w-full items-center gap-2 sm:min-w-[180px] sm:flex-1">
              <label
                htmlFor={`contrast-${activeTab}`}
                className="nb-micro w-16 shrink-0 text-[#111111]"
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
              <span className="w-9 text-right font-mono font-extrabold text-[#111111]">
                {activePage.contrast > 0
                  ? `+${activePage.contrast}`
                  : activePage.contrast}
              </span>
            </div>

            {activePage.brightness !== 0 || activePage.contrast !== 0 ? (
              <button
                type="button"
                onClick={onResetAdjustments}
                className="rounded-lg border border-[#111111] bg-[#FEF08A] px-2 py-0.5 text-[11px] font-extrabold text-[#111111]"
              >
                Reset
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Bento Card 3: Main Preview Canvas Stage */}
      <div
        role="tabpanel"
        aria-labelledby={activeTab === "page1" ? "tab-page1" : "tab-page2"}
        tabIndex={0}
        className="nb-card su-drafting-stage relative flex min-h-[280px] flex-1 flex-col items-center justify-center overflow-hidden p-3 pt-12 sm:min-h-[420px] sm:p-4 sm:pt-11 xl:min-h-[480px]"
      >
        {activePage ? (
          <>
            <div className="pointer-events-none absolute left-3 right-3 top-3 z-10 flex flex-wrap items-center gap-2">
              <span className="nb-pill font-mono">
                {activeTab === "page1" ? "HAL 1" : "HAL 2"} ·{" "}
                {activePage.processedWidth >= activePage.processedHeight
                  ? "LANDSCAPE"
                  : "PORTRAIT"}{" "}
                ({activePage.processedWidth}×{activePage.processedHeight}PX)
              </span>
              {activePage.hasAutoContour ? (
                <span className="inline-flex items-center rounded-full border-2 border-[#111111] bg-[#D9F99D] px-3 py-0.5 text-[11px] font-extrabold tracking-wider text-[#111111] uppercase">
                  Auto-Crop Aktif
                </span>
              ) : null}
            </div>

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
                  className="block max-h-[340px] max-w-full select-none rounded-lg border-2 border-[#111111] bg-white object-contain shadow-[6px_6px_0px_#111111] transition-transform duration-100 sm:max-h-[460px] xl:max-h-[520px]"
                />
              ) : null}
            </div>

            {activePage.isProcessing ? (
              <div
                role="status"
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-[#111111]/45"
              >
                <div className="nb-card bg-[#FEF08A] px-5 py-3.5 text-center">
                  <p className="text-xs font-extrabold text-[#111111] uppercase">
                    Memproses perspektif &amp; filter…
                  </p>
                  <progress
                    aria-label="Memproses pemindaian"
                    className="su-progress mt-2 h-2 w-44"
                  />
                </div>
              </div>
            ) : null}

            {/* Floating Neo-Brutalist Zoom Controls */}
            <div className="nb-card-sm mt-3 inline-flex items-center gap-1 bg-white p-1">
              <button
                type="button"
                aria-label="Perkecil pratinjau"
                onClick={() => stepZoom(-25)}
                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[#111111] hover:bg-[#FEF08A]"
              >
                <ZoomOut className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={setExact100}
                className={`min-h-9 rounded-lg px-2.5 font-mono text-xs font-extrabold ${
                  !isFitMode && zoomPercent === 100
                    ? "bg-[#111111] text-[#FEF08A]"
                    : "text-[#111111] hover:bg-[#BAE6FD]"
                }`}
              >
                {isFitMode ? "FIT" : `${zoomPercent}%`}
              </button>
              <button
                type="button"
                aria-label="Perbesar pratinjau"
                onClick={() => stepZoom(25)}
                className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[#111111] hover:bg-[#FEF08A]"
              >
                <ZoomIn className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={resetView}
                aria-label="Sesuaikan layar"
                className={`inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-extrabold ${
                  isFitMode
                    ? "bg-[#D9F99D] text-[#111111]"
                    : "text-[#111111] hover:bg-[#D9F99D]"
                }`}
              >
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                Fit
              </button>
            </div>
          </>
        ) : (
          <div className="nb-card max-w-sm bg-white p-6 text-center">
            <span className="nb-pill">Slot Kosong</span>
            <h2 className="mt-3 text-base font-extrabold text-[#111111]">
              {activeTab === "page1"
                ? "Halaman 1 (Data SU) Belum Diunggah"
                : "Halaman 2 (Peta Bidang) Belum Diunggah"}
            </h2>
            <p className="mt-1.5 text-xs font-medium text-[#3F3F46]">
              {activeTab === "page2"
                ? "Opsional: tambahkan Gambar Bidang bila Surat Ukur memiliki 2 halaman, atau langsung ekspor PDF 1 halaman."
                : "Tambahkan foto/scan halaman utama Surat Ukur untuk pembacaan nama file dan Kecamatan otomatis."}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
              <input
                ref={emptyUploadInputRef}
                type="file"
                accept={ACCEPT_IMAGES}
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadSlot(activeTab, file);
                  e.target.value = "";
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => emptyUploadInputRef.current?.click()}
                className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-[#FDE047] px-4 py-2 text-xs text-[#111111]"
              >
                <FolderOpen className="h-4 w-4" aria-hidden="true" />
                Pilih File
              </button>

              <button
                type="button"
                onClick={() => onOpenCamera(activeTab)}
                className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-[#FBCFE8] px-4 py-2 text-xs text-[#111111]"
              >
                <Camera className="h-4 w-4" aria-hidden="true" />
                Kamera
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bento Card 4: PDF Page Order Thumbnail Strip */}
      <div className="nb-card flex flex-wrap items-center justify-between gap-3 bg-[#D9F99D] px-3.5 py-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="nb-pill">Urutan PDF</span>

          <button
            type="button"
            onClick={() => handleTabSwitch("page1")}
            className={`flex items-center gap-2 rounded-xl border-2 border-[#111111] p-1.5 pr-3 text-left transition-colors ${
              activeTab === "page1"
                ? "bg-[#FEF08A] shadow-[3px_3px_0px_#111111]"
                : "bg-white hover:bg-[#FEF08A]/50"
            }`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-[#111111] bg-[#F6F5F0]">
              {page1?.processedDataUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={page1.processedDataUrl}
                  alt="Thumbnail Halaman 1"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="font-mono text-xs font-black text-[#111111]">
                  —
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-extrabold text-[#111111]">
                01 · {getOrientationBadge(page1)}
              </p>
              <p className="text-[11px] font-semibold text-[#3F3F46]">
                Data SU
              </p>
            </div>
          </button>

          <span aria-hidden="true" className="text-base font-black text-[#111111]">
            →
          </span>

          <button
            type="button"
            onClick={() => handleTabSwitch("page2")}
            className={`flex items-center gap-2 rounded-xl border-2 border-[#111111] p-1.5 pr-3 text-left transition-colors ${
              activeTab === "page2"
                ? "bg-[#FEF08A] shadow-[3px_3px_0px_#111111]"
                : "bg-white hover:bg-[#FEF08A]/50"
            }`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-[#111111] bg-[#F6F5F0]">
              {page2?.processedDataUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={page2.processedDataUrl}
                  alt="Thumbnail Halaman 2"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="font-mono text-sm font-black text-[#111111]">
                  +
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-extrabold text-[#111111]">
                02 · {getOrientationBadge(page2)}
              </p>
              <p className="text-[11px] font-semibold text-[#3F3F46]">
                {page2 ? "Peta Bidang" : "Opsional"}
              </p>
            </div>
          </button>
        </div>

        {(page1 && !page2) || (!page1 && page2) ? (
          <span className="nb-pill bg-[#111111] text-[#FEF08A]">
            Mode SU 1 Lembar · Siap Ekspor 1 Hal
          </span>
        ) : null}
      </div>
    </section>
  );
}
