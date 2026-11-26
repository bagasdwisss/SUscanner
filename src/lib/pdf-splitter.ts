"use client";

export interface ExtractedPdfPageFile {
  pageNumber: number;
  totalPages: number;
  file: File;
  width: number;
  height: number;
}

/**
 * Splits a multi-page scanned ADF PDF bundle entirely in the browser using `pdfjs-dist`,
 * rendering each page as a crisp high-DPI JPEG File so SU-Scanner can auto-crop, group,
 * extract Surat Ukur entities, and upload per Kecamatan / Kelurahan.
 */
export async function splitMultiPagePdfToImageFiles(
  pdfFile: File,
  options?: {
    maxPages?: number;
    targetLongSidePx?: number;
    onProgress?: (current: number, total: number) => void;
  },
): Promise<ExtractedPdfPageFile[]> {
  const maxPages = options?.maxPages ?? 120;
  const targetLongSidePx = options?.targetLongSidePx ?? 2200;

  const pdfjs = await import("pdfjs-dist");
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }

  const arrayBuffer = await pdfFile.arrayBuffer();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  });

  const pdfDoc = await loadingTask.promise;
  const totalPages = Math.min(pdfDoc.numPages, maxPages);
  const baseName = pdfFile.name.replace(/\.pdf$/i, "") || "bundle-su";
  const results: ExtractedPdfPageFile[] = [];

  for (let p = 1; p <= totalPages; p++) {
    options?.onProgress?.(p, totalPages);
    const page = await pdfDoc.getPage(p);
    const baseViewport = page.getViewport({ scale: 1 });
    const longSide = Math.max(baseViewport.width, baseViewport.height, 1);
    const renderScale = Math.max(1.2, Math.min(3.5, targetLongSidePx / longSide));
    const viewport = page.getViewport({ scale: renderScale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvas,
      canvasContext: ctx,
      viewport,
    }).promise;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.94),
    );
    if (!blob) continue;

    const paddedNum = String(p).padStart(3, "0");
    const pageFile = new File([blob], `${baseName}-hal-${paddedNum}.jpg`, {
      type: "image/jpeg",
    });

    results.push({
      pageNumber: p,
      totalPages,
      file: pageFile,
      width: canvas.width,
      height: canvas.height,
    });

    page.cleanup();
  }

  const cleanup = pdfDoc as { destroy?: () => Promise<void>; cleanup?: () => Promise<void> };
  if (typeof cleanup.destroy === "function") {
    await cleanup.destroy();
  } else if (typeof cleanup.cleanup === "function") {
    await cleanup.cleanup();
  }
  return results;
}
