"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeftRight,
  Camera,
  Crop,
  FolderOpen,
  Maximize2,
  RotateCcw,
  RotateCw,
  Scan,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { PageSlot, ScanFilter, ScannedPageState } from "@/lib/su-types";

const ANIM_STAGE_CLASSES = [
  "su-stage-enter-right",
  "su-stage-enter-left",
  "su-stage-enter-swap-from-right",
  "su-stage-enter-swap-from-left",
] as const;

const ANIM_GHOST_CLASSES = [
  "su-ghost-exit-left",
  "su-ghost-exit-right",
  "su-ghost-exit-swap-left",
  "su-ghost-exit-swap-right",
] as const;

const ANIM_THUMB_CLASSES = [
  "su-thumb-swap-over",
  "su-thumb-swap-under",
  "su-thumb-nudge-right",
  "su-thumb-nudge-left",
] as const;

function restartClassAnimation(
  el: HTMLElement | SVGSVGElement | null,
  activeClass: string,
  allClasses: readonly string[],
) {
  if (!el) return;
  el.classList.remove(...allClasses);
  if (el instanceof HTMLElement) {
    void el.offsetWidth;
  } else {
    void el.getBoundingClientRect();
  }
  el.classList.add(activeClass);
}

const ACCEPT_IMAGES =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.pdf";

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
  {
    id: "stamp-clean",
    label: "Redam Cap",
    hint: "Mengurangi tinta cap/stempel basah di atas teks ketikan",
  },
];

interface DocumentWorkspacePanelProps {
  activeTab: PageSlot;
  swapSequence?: number;
  onSelectTab: (tab: PageSlot) => void;
  page1: ScannedPageState | null;
  page2: ScannedPageState | null;
  onSwapPages: () => void;
  onRotateActive: (delta: -90 | 90) => void;
  onAutoCropActive: () => void;
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
  swapSequence = 0,
  onSelectTab,
  page1,
  page2,
  onSwapPages,
  onRotateActive,
  onAutoCropActive,
  onOpenManualCrop,
  onFilterChange,
  onAdjustmentChange,
  onResetAdjustments,
  onUploadSlot,
  onOpenCamera,
}: DocumentWorkspacePanelProps) {
  const activePage = activeTab === "page1" ? page1 : page2;
  const topCardRef = useRef<HTMLDivElement>(null);
  const floatingDockRef = useRef<HTMLDivElement>(null);
  const previewStageRef = useRef<HTMLDivElement>(null);
  const tab1Ref = useRef<HTMLButtonElement>(null);
  const tab2Ref = useRef<HTMLButtonElement>(null);
  const topSwapIconRef = useRef<SVGSVGElement>(null);
  const stripSwapIconRef = useRef<SVGSVGElement>(null);
  const thumb1BtnRef = useRef<HTMLButtonElement>(null);
  const thumb2BtnRef = useRef<HTMLButtonElement>(null);
  const thumb1MediaRef = useRef<HTMLDivElement>(null);
  const thumb2MediaRef = useRef<HTMLDivElement>(null);
  const previewBodyRef = useRef<HTMLDivElement>(null);
  const ghostLayerRef = useRef<HTMLDivElement>(null);
  const ghostImgRef = useRef<HTMLImageElement>(null);
  const ghostEmptyRef = useRef<HTMLDivElement>(null);
  const ghostEmptyLabelRef = useRef<HTMLParagraphElement>(null);
  const ghostTimerRef = useRef<number | null>(null);

  const [showFloatingDock, setShowFloatingDock] = useState(false);

  const prevSnapshotRef = useRef<{
    activeTab: PageSlot;
    p1Id: string | null;
    p2Id: string | null;
    p1Url: string | null;
    p2Url: string | null;
    swapSequence: number;
    initialized: boolean;
  }>({
    activeTab,
    p1Id: null,
    p2Id: null,
    p1Url: null,
    p2Url: null,
    swapSequence,
    initialized: false,
  });

  const replaceInputRef = useRef<HTMLInputElement>(null);
  const emptyUploadInputRef = useRef<HTMLInputElement>(null);

  const [viewTransform, setViewTransform] = useState<{
    tab: PageSlot;
    swapSeq: number;
    isFitMode: boolean;
    zoomPercent: number;
    pan: { x: number; y: number };
  }>({
    tab: activeTab,
    swapSeq: swapSequence,
    isFitMode: true,
    zoomPercent: 100,
    pan: { x: 0, y: 0 },
  });
  const isViewCurrent =
    viewTransform.tab === activeTab && viewTransform.swapSeq === swapSequence;
  const isFitMode = isViewCurrent ? viewTransform.isFitMode : true;
  const zoomPercent = isViewCurrent ? viewTransform.zoomPercent : 100;
  const pan = isViewCurrent ? viewTransform.pan : { x: 0, y: 0 };

  const dragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const curP1Id = page1?.id ?? null;
  const curP2Id = page2?.id ?? null;
  const curP1Url = page1?.processedDataUrl ?? null;
  const curP2Url = page2?.processedDataUrl ?? null;

  useEffect(() => {
    return () => {
      if (ghostTimerRef.current !== null) {
        window.clearTimeout(ghostTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const topCard = topCardRef.current;
    if (!topCard) return;

    const getHeaderClearance = () => (window.innerWidth >= 1024 ? 80 : 72);

    const observer = new IntersectionObserver(
      ([entry]) => {
        const scrolledPastTopBar =
          !entry.isIntersecting &&
          entry.boundingClientRect.bottom < getHeaderClearance();
        if (
          !scrolledPastTopBar &&
          floatingDockRef.current?.contains(document.activeElement)
        ) {
          (activeTab === "page2" ? tab2Ref.current : tab1Ref.current)?.focus();
        }
        setShowFloatingDock(scrolledPastTopBar);
      },
      {
        threshold: [0],
        rootMargin: `-${getHeaderClearance()}px 0px 0px 0px`,
      },
    );
    observer.observe(topCard);

    return () => {
      observer.disconnect();
    };
  }, [activeTab]);

  useLayoutEffect(() => {
    const prev = prevSnapshotRef.current;
    const hideGhost = () => {
      if (ghostTimerRef.current !== null) {
        window.clearTimeout(ghostTimerRef.current);
        ghostTimerRef.current = null;
      }
      const ghostLayer = ghostLayerRef.current;
      const ghostImg = ghostImgRef.current;
      const ghostEmpty = ghostEmptyRef.current;
      if (ghostLayer) {
        ghostLayer.classList.remove(...ANIM_GHOST_CLASSES, "flex");
        ghostLayer.classList.add("hidden");
      }
      if (ghostImg) {
        ghostImg.classList.add("hidden");
        ghostImg.removeAttribute("src");
      }
      if (ghostEmpty) {
        ghostEmpty.classList.add("hidden");
      }
    };

    if (!prev.initialized) {
      prevSnapshotRef.current = {
        activeTab,
        p1Id: curP1Id,
        p2Id: curP2Id,
        p1Url: curP1Url,
        p2Url: curP2Url,
        swapSequence,
        initialized: true,
      };
      return;
    }

    const isSwap =
      swapSequence !== prev.swapSequence ||
      (prev.p1Id === curP2Id &&
        prev.p2Id === curP1Id &&
        (curP1Id !== null || curP2Id !== null));
    const isTabSwitch = !isSwap && activeTab !== prev.activeTab;

    const prevViewedUrl =
      prev.activeTab === "page1" ? prev.p1Url : prev.p2Url;
    const prevViewedLabel =
      prev.activeTab === "page1"
        ? "Halaman 1 (Data SU) Kosong"
        : "Halaman 2 (Peta Bidang) Kosong";
    const tabSlideDirection =
      activeTab === "page2" ? "forward" : "backward";

    prevSnapshotRef.current = {
      activeTab,
      p1Id: curP1Id,
      p2Id: curP2Id,
      p1Url: curP1Url,
      p2Url: curP2Url,
      swapSequence,
      initialized: true,
    };

    if (!isSwap && !isTabSwitch) {
      return;
    }

    tab1Ref.current?.setAttribute("data-slide-dir", tabSlideDirection);
    tab2Ref.current?.setAttribute("data-slide-dir", tabSlideDirection);

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      hideGhost();
      return;
    }

    // Trigger outgoing ghost layer + directional spring entry for main preview
    hideGhost();
    const ghostLayer = ghostLayerRef.current;
    const ghostImg = ghostImgRef.current;
    const ghostEmpty = ghostEmptyRef.current;
    const ghostEmptyLabel = ghostEmptyLabelRef.current;
    const previewBody = previewBodyRef.current;

    const ghostExitClass = isSwap
      ? activeTab === "page1"
        ? "su-ghost-exit-swap-left"
        : "su-ghost-exit-swap-right"
      : activeTab === "page2"
        ? "su-ghost-exit-left"
        : "su-ghost-exit-right";

    const stageEnterClass = isSwap
      ? activeTab === "page1"
        ? "su-stage-enter-swap-from-right"
        : "su-stage-enter-swap-from-left"
      : activeTab === "page2"
        ? "su-stage-enter-right"
        : "su-stage-enter-left";

    if (ghostLayer && (prevViewedUrl || prev.activeTab !== activeTab || isSwap)) {
      if (prevViewedUrl && ghostImg) {
        ghostImg.src = prevViewedUrl;
        ghostImg.classList.remove("hidden");
        ghostEmpty?.classList.add("hidden");
      } else if (ghostEmpty && ghostEmptyLabel) {
        ghostEmptyLabel.textContent = prevViewedLabel;
        ghostEmpty.classList.remove("hidden");
        ghostImg?.classList.add("hidden");
      }
      ghostLayer.classList.remove("hidden");
      ghostLayer.classList.add("flex");
      restartClassAnimation(ghostLayer, ghostExitClass, ANIM_GHOST_CLASSES);
      ghostTimerRef.current = window.setTimeout(hideGhost, 260);
    }

    restartClassAnimation(previewBody, stageEnterClass, ANIM_STAGE_CLASSES);

    // Strip Urutan PDF directional cross-slide / focus pop
    if (isSwap) {
      const m1 = thumb1MediaRef.current;
      const m2 = thumb2MediaRef.current;
      const b1 = thumb1BtnRef.current;
      const b2 = thumb2BtnRef.current;
      if (m1 && m2) {
        m1.classList.remove(...ANIM_THUMB_CLASSES);
        m2.classList.remove(...ANIM_THUMB_CLASSES);
        const r1 = m1.getBoundingClientRect();
        const r2 = m2.getBoundingClientRect();
        const dx = Math.round(r2.left - r1.left);
        const dy = Math.round(r2.top - r1.top);
        const effDx = Math.abs(dx) > 4 || Math.abs(dy) > 4 ? dx : 132;

        m1.style.setProperty("--su-flip-x", `${effDx}px`);
        m1.style.setProperty("--su-flip-y", `${dy}px`);
        m2.style.setProperty("--su-flip-x", `${-effDx}px`);
        m2.style.setProperty("--su-flip-y", `${-dy}px`);

        restartClassAnimation(m1, "su-thumb-swap-over", ANIM_THUMB_CLASSES);
        restartClassAnimation(m2, "su-thumb-swap-under", ANIM_THUMB_CLASSES);
      }

      b1?.classList.remove("z-20", "su-strip-swap-flash");
      b2?.classList.remove("z-20", "su-strip-swap-flash");
      if (b1 && b2) {
        void b1.offsetWidth;
        b1.classList.add("z-20", "su-strip-swap-flash");
        b2.classList.add("su-strip-swap-flash");
      }

      restartClassAnimation(
        topSwapIconRef.current,
        "su-swap-icon-spin",
        ["su-swap-icon-spin"],
      );
      restartClassAnimation(
        stripSwapIconRef.current,
        "su-swap-icon-spin",
        ["su-swap-icon-spin", "su-strip-arrow-right", "su-strip-arrow-left"],
      );
    } else if (isTabSwitch) {
      const activeCard =
        activeTab === "page2" ? thumb2BtnRef.current : thumb1BtnRef.current;
      const inactiveCard =
        activeTab === "page2" ? thumb1BtnRef.current : thumb2BtnRef.current;
      inactiveCard?.classList.remove(...ANIM_THUMB_CLASSES);
      restartClassAnimation(
        activeCard,
        activeTab === "page2" ? "su-thumb-nudge-right" : "su-thumb-nudge-left",
        ANIM_THUMB_CLASSES,
      );
      restartClassAnimation(
        stripSwapIconRef.current,
        activeTab === "page2"
          ? "su-strip-arrow-right"
          : "su-strip-arrow-left",
        ["su-swap-icon-spin", "su-strip-arrow-right", "su-strip-arrow-left"],
      );
    }
  }, [activeTab, curP1Id, curP1Url, curP2Id, curP2Url, swapSequence]);

  const resetView = () => {
    setViewTransform({
      tab: activeTab,
      swapSeq: swapSequence,
      isFitMode: true,
      zoomPercent: 100,
      pan: { x: 0, y: 0 },
    });
  };

  const handleTabSwitch = (nextTab: PageSlot) => {
    onSelectTab(nextTab);
    setViewTransform({
      tab: nextTab,
      swapSeq: swapSequence,
      isFitMode: true,
      zoomPercent: 100,
      pan: { x: 0, y: 0 },
    });
    // If operator switched pages while scrolled below the preview stage, bring preview back into view
    const stageEl = previewStageRef.current;
    if (stageEl) {
      const rect = stageEl.getBoundingClientRect();
      if (rect.bottom < 160) {
        const targetTop = Math.max(
          0,
          window.scrollY + rect.top - (window.innerWidth >= 1024 ? 98 : 88),
        );
        const prefersReduced = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        window.scrollTo({
          top: targetTop,
          behavior: prefersReduced ? "auto" : "smooth",
        });
      }
    }
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
    setViewTransform((prev) => {
      const baseZoom =
        prev.tab === activeTab && prev.swapSeq === swapSequence
          ? prev.zoomPercent
          : 100;
      const basePan =
        prev.tab === activeTab && prev.swapSeq === swapSequence
          ? prev.pan
          : { x: 0, y: 0 };
      const next = Math.max(50, Math.min(300, baseZoom + delta));
      return {
        tab: activeTab,
        swapSeq: swapSequence,
        isFitMode: false,
        zoomPercent: next,
        pan: next <= 100 ? { x: 0, y: 0 } : basePan,
      };
    });
  };

  const setExact100 = () => {
    setViewTransform({
      tab: activeTab,
      swapSeq: swapSequence,
      isFitMode: false,
      zoomPercent: 100,
      pan: { x: 0, y: 0 },
    });
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
      {/* Card 1: Page Tabs & Swap Header */}
      <div
        ref={topCardRef}
        className="nb-card flex flex-wrap items-center justify-between gap-2 bg-white px-3.5 py-2.5 sm:px-4"
      >
        <div
          role="tablist"
          aria-label="Pilih Halaman Surat Ukur"
          {...tablistFocusgroupProps}
          className="flex max-w-full items-center gap-1.5 overflow-x-auto rounded-full bg-[#F6F7F9] p-1"
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
            className="su-tab inline-flex min-h-9 flex-none items-center gap-1.5 rounded-full border border-transparent bg-transparent px-3 py-1.5 text-xs font-semibold text-[#4B5563] transition-colors hover:text-[#111114] sm:gap-2 sm:px-3.5 sm:text-sm"
          >
            <span>Hal 1 · Data SU</span>
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                activeTab === "page1"
                  ? "bg-[#5E17EB]/10 text-[#5E17EB]"
                  : "border border-[#E5E7EB] bg-white text-[#4B5563]"
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
            className="su-tab inline-flex min-h-9 flex-none items-center gap-1.5 rounded-full border border-transparent bg-transparent px-3 py-1.5 text-xs font-semibold text-[#4B5563] transition-colors hover:text-[#111114] sm:gap-2 sm:px-3.5 sm:text-sm"
          >
            <span>Hal 2 · Peta Bidang</span>
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                activeTab === "page2"
                  ? "bg-[#5E17EB]/10 text-[#5E17EB]"
                  : "border border-[#E5E7EB] bg-white text-[#4B5563]"
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
          className="nb-btn-sm inline-flex min-h-9 items-center gap-1.5 bg-white px-3.5 py-1.5 text-xs font-semibold text-[#111114] hover:bg-[#F9FAFB] disabled:opacity-50"
        >
          <ArrowLeftRight
            ref={topSwapIconRef}
            className="h-3.5 w-3.5 text-[#5E17EB]"
            aria-hidden="true"
          />
          <span>Tukar Hal 1 &amp; 2</span>
          <kbd className="hidden rounded border border-[#E5E7EB] bg-[#F6F7F9] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#4B5563] sm:inline">
            S
          </kbd>
        </button>
      </div>

      {/* Card 2: Active Image Toolbar */}
      {activePage ? (
        <div className="nb-card space-y-3 bg-white px-3.5 py-3.5 sm:px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => onRotateActive(-90)}
                disabled={activePage.isProcessing}
                className="nb-btn-sm inline-flex min-h-9 items-center gap-1.5 bg-white px-2.5 py-1.5 text-xs text-[#111114] hover:bg-[#F6F7F9] disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                -90°
              </button>
              <button
                type="button"
                onClick={() => onRotateActive(90)}
                disabled={activePage.isProcessing}
                className="nb-btn-sm inline-flex min-h-9 items-center gap-1.5 bg-white px-2.5 py-1.5 text-xs text-[#111114] hover:bg-[#F6F7F9] disabled:opacity-50"
              >
                <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                +90°
                <kbd className="hidden rounded bg-[#F6F7F9] px-1 font-mono text-[10px] font-semibold text-[#4B5563] sm:inline">
                  R
                </kbd>
              </button>
              <button
                type="button"
                onClick={onAutoCropActive}
                disabled={activePage.isProcessing}
                title="Deteksi otomatis 4 sudut kertas dan potong rapat dari ujung ke ujung dokumen"
                className="nb-btn-sm inline-flex min-h-9 items-center gap-1.5 border-[#DDD6FE] bg-[#F5F3FF] px-3 py-1.5 text-xs font-semibold text-[#4C0FD1] hover:bg-[#EDE9FE] disabled:opacity-50"
              >
                <Scan className="h-3.5 w-3.5" aria-hidden="true" />
                Auto-Crop
              </button>
              <button
                type="button"
                onClick={onOpenManualCrop}
                disabled={activePage.isProcessing}
                className="nb-btn-sm inline-flex min-h-9 items-center gap-1.5 bg-white px-3 py-1.5 text-xs text-[#111114] hover:bg-[#F6F7F9] disabled:opacity-50"
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
                className="nb-btn-sm inline-flex min-h-9 items-center gap-1.5 bg-white px-2.5 py-1.5 text-xs text-[#111114] hover:bg-[#F6F7F9]"
              >
                <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                Ganti File
              </button>
              <button
                type="button"
                onClick={() => onOpenCamera(activeTab)}
                className="nb-btn-sm inline-flex min-h-9 items-center gap-1.5 bg-white px-2.5 py-1.5 text-xs text-[#111114] hover:bg-[#F6F7F9]"
              >
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                Kamera
              </button>
            </div>

            <div
              role="group"
              aria-label="Filter Pemindaian Dokumen"
              className="flex flex-wrap items-center gap-1 rounded-full border border-[#E5E7EB] bg-[#F6F7F9] p-1"
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
                    className={`inline-flex min-h-8 items-center rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      selected
                        ? "bg-[#0E0E10] text-white shadow-xs"
                        : "bg-transparent text-[#4B5563] hover:bg-white hover:text-[#111114]"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] px-3 py-2 text-xs">
            <div className="flex w-full items-center gap-2 sm:min-w-[180px] sm:flex-1">
              <SlidersHorizontal
                className="h-3.5 w-3.5 shrink-0 text-[#4B5563]"
                aria-hidden="true"
              />
              <label
                htmlFor={`brightness-${activeTab}`}
                className="nb-micro w-20 shrink-0 text-[#111114]"
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
              <span className="w-9 text-right font-mono font-bold text-[#111114]">
                {activePage.brightness > 0
                  ? `+${activePage.brightness}`
                  : activePage.brightness}
              </span>
            </div>

            <div className="flex w-full items-center gap-2 sm:min-w-[180px] sm:flex-1">
              <label
                htmlFor={`contrast-${activeTab}`}
                className="nb-micro w-16 shrink-0 text-[#111114]"
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
              <span className="w-9 text-right font-mono font-bold text-[#111114]">
                {activePage.contrast > 0
                  ? `+${activePage.contrast}`
                  : activePage.contrast}
              </span>
            </div>

            {activePage.brightness !== 0 || activePage.contrast !== 0 ? (
              <button
                type="button"
                onClick={onResetAdjustments}
                className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#111114] hover:bg-[#F9FAFB]"
              >
                Reset
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Bento Card 3: Main Preview Canvas Stage */}
      <div
        ref={previewStageRef}
        role="tabpanel"
        aria-labelledby={activeTab === "page1" ? "tab-page1" : "tab-page2"}
        tabIndex={0}
        className="nb-card su-drafting-stage relative flex min-h-[280px] flex-1 flex-col items-center justify-center overflow-hidden p-3 pt-12 sm:min-h-[420px] sm:p-4 sm:pt-11 xl:min-h-[480px]"
      >
        {activePage ? (
          <div className="pointer-events-none absolute left-3 right-3 top-3 z-20 flex flex-wrap items-center gap-2">
            <span className="nb-pill bg-white/95 font-mono shadow-xs">
              {activeTab === "page1" ? "HAL 1" : "HAL 2"} ·{" "}
              {activePage.processedWidth >= activePage.processedHeight
                ? "LANDSCAPE"
                : "PORTRAIT"}{" "}
              ({activePage.processedWidth}×{activePage.processedHeight}PX)
            </span>
            {activePage.hasAutoContour ? (
              <span className="inline-flex items-center rounded-full border border-[#A7F3D0] bg-[#ECFDF5] px-3 py-0.5 text-[11px] font-semibold tracking-wide text-[#065F46] uppercase shadow-xs">
                Auto-Crop Full Dokumen
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-[#E5E7EB] bg-white px-3 py-0.5 text-[11px] font-semibold tracking-wide text-[#4B5563] uppercase shadow-xs">
                Full Frame
              </span>
            )}
            {activePage.edgeMidpoints ? (
              <span className="inline-flex items-center rounded-full border border-[#FBCFE8] bg-[#FDF2F8] px-2.5 py-0.5 text-[11px] font-semibold text-[#9D174D] shadow-xs">
                Dewarp Jilid 8-Titik
              </span>
            ) : null}
            {activePage.qualityReport ? (
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold shadow-xs ${
                  activePage.qualityReport.status === "good"
                    ? "border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]"
                    : "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]"
                }`}
              >
                {activePage.qualityReport.status === "good"
                  ? `Tajam (${activePage.qualityReport.sharpnessScore}/100)`
                  : activePage.qualityReport.status === "warn_blur"
                    ? `Buram (${activePage.qualityReport.sharpnessScore}/100)`
                    : activePage.qualityReport.status === "warn_glare"
                      ? `Pantulan Cahaya (${activePage.qualityReport.glarePercent}%)`
                      : "Buram & Pantulan"}
              </span>
            ) : null}
            {activePage.ocrWords && activePage.ocrWords.length > 0 ? (
              <span className="inline-flex items-center rounded-full border border-[#DDD6FE] bg-[#F5F3FF] px-2.5 py-0.5 text-[11px] font-semibold text-[#4C0FD1] shadow-xs">
                Ctrl+F Siap ({activePage.ocrWords.length} kata)
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Shared stage viewport so outgoing ghost and incoming document cross-slide seamlessly */}
        <div className="relative flex w-full flex-1 items-center justify-center">
          <div
            ref={previewBodyRef}
            className="flex h-full w-full items-center justify-center"
          >
            {activePage ? (
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
                  const nextPan = {
                    x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
                    y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
                  };
                  setViewTransform({
                    tab: activeTab,
                    swapSeq: swapSequence,
                    isFitMode,
                    zoomPercent,
                    pan: nextPan,
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
                    className="block max-h-[340px] max-w-full select-none rounded-xl border border-[#E5E7EB] bg-white object-contain shadow-[0_12px_32px_rgba(17,17,20,0.12)] transition-transform duration-100 sm:max-h-[460px] xl:max-h-[520px]"
                  />
                ) : null}
              </div>
            ) : (
              <div className="nb-card max-w-sm bg-white p-6 text-center">
                <span className="nb-pill">Slot Kosong</span>
                <h2 className="mt-3 text-base font-bold text-[#111114]">
                  {activeTab === "page1"
                    ? "Halaman 1 (Data SU) Belum Diunggah"
                    : "Halaman 2 (Peta Bidang) Belum Diunggah"}
                </h2>
                <p className="mt-1.5 text-xs font-medium text-[#4B5563]">
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
                    className="nb-btn-sm wollo-cta-primary inline-flex min-h-10 items-center gap-1.5 px-4 py-2 text-xs"
                  >
                    <FolderOpen className="h-4 w-4" aria-hidden="true" />
                    Pilih File
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenCamera(activeTab)}
                    className="nb-btn-sm inline-flex min-h-10 items-center gap-1.5 bg-white px-4 py-2 text-xs text-[#374151] hover:bg-[#F9FAFB]"
                  >
                    <Camera className="h-4 w-4" aria-hidden="true" />
                    Kamera
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Outgoing Ghost Snapshot Overlay (purely visual transition layer) */}
          <div
            ref={ghostLayerRef}
            aria-hidden="true"
            onAnimationEnd={(e) => {
              if (e.target !== e.currentTarget) return;
              const animName =
                e.animationName ||
                (e.nativeEvent instanceof AnimationEvent
                  ? e.nativeEvent.animationName
                  : "");
              if (animName.includes("fade-out")) {
                const layer = ghostLayerRef.current;
                const img = ghostImgRef.current;
                const empty = ghostEmptyRef.current;
                if (layer) {
                  layer.classList.remove(...ANIM_GHOST_CLASSES, "flex");
                  layer.classList.add("hidden");
                }
                if (img) {
                  img.classList.add("hidden");
                  img.removeAttribute("src");
                }
                if (empty) {
                  empty.classList.add("hidden");
                }
              }
            }}
            className="pointer-events-none absolute inset-0 z-10 hidden items-center justify-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={ghostImgRef}
              alt=""
              className="hidden max-h-[340px] max-w-full select-none rounded-xl border border-[#E5E7EB] bg-white object-contain shadow-[0_12px_32px_rgba(17,17,20,0.12)] sm:max-h-[460px] xl:max-h-[520px]"
            />
            <div
              ref={ghostEmptyRef}
              className="nb-card hidden max-w-sm bg-white/95 p-6 text-center shadow-md"
            >
              <span className="nb-pill">Slot Kosong</span>
              <p
                ref={ghostEmptyLabelRef}
                className="mt-3 text-sm font-bold text-[#111114]"
              />
            </div>
          </div>
        </div>

        {activePage ? (
          <>
            {activePage.qualityReport &&
            activePage.qualityReport.warnings.length > 0 ? (
              <div
                role="alert"
                className="mt-2.5 w-full rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-left text-xs font-semibold text-[#92400E]"
              >
                {activePage.qualityReport.warnings.join(" ")}
              </div>
            ) : null}

            {activePage.isProcessing ? (
              <div
                role="status"
                className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-[#111114]/35 backdrop-blur-[2px]"
              >
                <div className="nb-card bg-white px-5 py-4 text-center shadow-lg">
                  <p className="text-xs font-bold text-[#111114] uppercase">
                    Memproses perspektif &amp; filter…
                  </p>
                  <progress
                    aria-label="Memproses pemindaian"
                    className="su-progress mt-2.5 h-2 w-44"
                  />
                </div>
              </div>
            ) : null}

            {/* Floating Clean Zoom Controls */}
            <div className="nb-card-sm mt-3 inline-flex items-center gap-1 bg-white p-1">
              <button
                type="button"
                aria-label="Perkecil pratinjau"
                onClick={() => stepZoom(-25)}
                className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg text-[#4B5563] hover:bg-[#F6F7F9] hover:text-[#111114]"
              >
                <ZoomOut className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={setExact100}
                className={`min-h-8 rounded-lg px-2.5 font-mono text-xs font-bold ${
                  !isFitMode && zoomPercent === 100
                    ? "bg-[#0E0E10] text-white"
                    : "text-[#4B5563] hover:bg-[#F6F7F9] hover:text-[#111114]"
                }`}
              >
                {isFitMode ? "FIT" : `${zoomPercent}%`}
              </button>
              <button
                type="button"
                aria-label="Perbesar pratinjau"
                onClick={() => stepZoom(25)}
                className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-lg text-[#4B5563] hover:bg-[#F6F7F9] hover:text-[#111114]"
              >
                <ZoomIn className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={resetView}
                aria-label="Sesuaikan layar"
                className={`inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold ${
                  isFitMode
                    ? "bg-[#F5F3FF] text-[#5E17EB]"
                    : "text-[#4B5563] hover:bg-[#F6F7F9] hover:text-[#111114]"
                }`}
              >
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                Fit
              </button>
            </div>
          </>
        ) : null}
      </div>

      {/* Card 4: PDF Page Order Thumbnail Strip */}
      <div className="nb-card flex flex-wrap items-center justify-between gap-3 bg-white px-3.5 py-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-2 overflow-visible sm:gap-2.5">
          <span className="nb-pill">Urutan PDF</span>

          <button
            ref={thumb1BtnRef}
            type="button"
            onClick={() => handleTabSwitch("page1")}
            className={`relative flex items-center gap-2 rounded-xl border p-1.5 pr-3 text-left transition-colors ${
              activeTab === "page1"
                ? "border-[#5E17EB] bg-[#F5F3FF] shadow-xs"
                : "border-[#E5E7EB] bg-[#F6F7F9] hover:bg-white"
            }`}
          >
            <div
              ref={thumb1MediaRef}
              className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-xs"
            >
              {page1?.processedDataUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={page1.processedDataUrl}
                  alt="Thumbnail Halaman 1"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="font-mono text-xs font-bold text-[#4B5563]">
                  —
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-[#111114]">
                01 · {getOrientationBadge(page1)}
              </p>
              <p className="text-[11px] font-medium text-[#4B5563]">
                Data SU
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={onSwapPages}
            disabled={!page1 && !page2}
            title="Tukar posisi Halaman 1 & Halaman 2 (S)"
            aria-label="Tukar posisi Halaman 1 dan Halaman 2"
            className="inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] bg-[#F6F7F9] text-[#4B5563] transition-colors hover:border-[#DDD6FE] hover:bg-[#F5F3FF] hover:text-[#5E17EB] disabled:opacity-45"
          >
            <ArrowLeftRight
              ref={stripSwapIconRef}
              className="h-3.5 w-3.5"
              aria-hidden="true"
            />
          </button>

          <button
            ref={thumb2BtnRef}
            type="button"
            onClick={() => handleTabSwitch("page2")}
            className={`relative flex items-center gap-2 rounded-xl border p-1.5 pr-3 text-left transition-colors ${
              activeTab === "page2"
                ? "border-[#5E17EB] bg-[#F5F3FF] shadow-xs"
                : "border-[#E5E7EB] bg-[#F6F7F9] hover:bg-white"
            }`}
          >
            <div
              ref={thumb2MediaRef}
              className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-xs"
            >
              {page2?.processedDataUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={page2.processedDataUrl}
                  alt="Thumbnail Halaman 2"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="font-mono text-sm font-bold text-[#4B5563]">
                  +
                </span>
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-[#111114]">
                02 · {getOrientationBadge(page2)}
              </p>
              <p className="text-[11px] font-medium text-[#4B5563]">
                {page2 ? "Peta Bidang" : "Opsional"}
              </p>
            </div>
          </button>
        </div>

        {(page1 && !page2) || (!page1 && page2) ? (
          <span className="nb-pill border-[#DDD6FE] bg-[#F5F3FF] text-[#4C0FD1]">
            Mode SU 1 Lembar · Siap Ekspor 1 Hal
          </span>
        ) : null}
      </div>

      {/* All-Device Floating Bottom Dock: appears cleanly once top pagebar scrolls above viewport */}
      <div
        ref={floatingDockRef}
        aria-hidden={!showFloatingDock}
        inert={!showFloatingDock ? true : undefined}
        data-floating-dock={showFloatingDock ? "visible" : "hidden"}
        className={`fixed bottom-4 left-1/2 z-[25] w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 sm:bottom-5 ${
          showFloatingDock
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-3 opacity-0"
        } motion-safe:transition-all motion-safe:duration-200`}
      >
        <div className="flex items-center gap-1 rounded-full border border-[#DDD6FE] bg-white/95 p-1 shadow-[0_14px_34px_-10px_rgba(17,17,20,0.22),0_2px_10px_-2px_rgba(94,23,235,0.12)] backdrop-blur-xl sm:gap-1.5 sm:p-1.5">
          <button
            type="button"
            onClick={() => handleTabSwitch("page1")}
            className={`inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-full px-2 py-1.5 text-[11px] font-semibold transition-colors min-[380px]:px-2.5 sm:min-h-10 sm:gap-1.5 sm:px-3.5 sm:text-xs ${
              activeTab === "page1"
                ? "bg-[#5E17EB] text-white shadow-xs"
                : "text-[#374151] hover:bg-[#F6F7F9]"
            }`}
          >
            <span>Hal 1 · Data SU</span>
            <span
              className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold sm:text-[10px] ${
                activeTab === "page1"
                  ? "bg-white/20 text-white"
                  : "bg-[#F6F7F9] text-[#4B5563]"
              }`}
            >
              {getOrientationBadge(page1)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabSwitch("page2")}
            className={`inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-full px-2 py-1.5 text-[11px] font-semibold transition-colors min-[380px]:px-2.5 sm:min-h-10 sm:gap-1.5 sm:px-3.5 sm:text-xs ${
              activeTab === "page2"
                ? "bg-[#5E17EB] text-white shadow-xs"
                : "text-[#374151] hover:bg-[#F6F7F9]"
            }`}
          >
            <span>Hal 2 · Peta Bidang</span>
            <span
              className={`rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold sm:text-[10px] ${
                activeTab === "page2"
                  ? "bg-white/20 text-white"
                  : "bg-[#F6F7F9] text-[#4B5563]"
              }`}
            >
              {getOrientationBadge(page2)}
            </span>
          </button>

          <button
            type="button"
            onClick={onSwapPages}
            disabled={!page1 && !page2}
            aria-label="Tukar posisi Halaman 1 dan Halaman 2"
            title="Tukar Hal 1 & 2 (S)"
            className="inline-flex min-h-9 min-w-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[#E5E7EB] bg-[#F6F7F9] px-2 text-[#5E17EB] hover:bg-[#F5F3FF] disabled:opacity-45 sm:min-h-10 sm:min-w-10 md:px-3"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden text-[11px] font-semibold text-[#111114] md:inline">
              Tukar
            </span>
            <kbd className="hidden rounded border border-[#E5E7EB] bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#4B5563] lg:inline">
              S
            </kbd>
          </button>
        </div>
      </div>
    </section>
  );
}
