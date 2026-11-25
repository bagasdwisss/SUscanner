import { applyExtractionToForm, type PostProcessedExtraction } from "./su-formatter";
import { parseSuratUkurOcrText } from "./local-ocr-parser";

export interface LocalOcrOutcome {
  processed: PostProcessedExtraction;
  rawText: string;
  meanConfidence: number;
}

/**
 * Runs built-in client-side OCR via `tesseract.js` Web Worker inside the browser
 * as a zero-API-key backup to Gemini Vision AI.
 */
export async function runLocalTesseractOcr(
  imageDataUrl: string,
  onProgress?: (percent: number) => void,
): Promise<LocalOcrOutcome> {
  const { createWorker } = await import("tesseract.js");
  onProgress?.(5);

  const worker = await createWorker("ind", 1, {
    logger: (msg) => {
      if (msg.status === "recognizing text" && typeof msg.progress === "number") {
        onProgress?.(Math.min(99, Math.max(15, Math.round(15 + msg.progress * 84))));
      } else if (msg.status === "loading language traineddata") {
        onProgress?.(10);
      }
    },
  });

  try {
    const result = await worker.recognize(imageDataUrl);
    onProgress?.(100);
    const rawText = result.data.text || "";
    const meanConfidence =
      typeof result.data.confidence === "number" ? result.data.confidence : 72;
    const extraction = parseSuratUkurOcrText(rawText, meanConfidence);
    const processed = applyExtractionToForm(extraction);
    return { processed, rawText, meanConfidence };
  } finally {
    await worker.terminate();
  }
}
