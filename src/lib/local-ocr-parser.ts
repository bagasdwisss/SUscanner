import {
  mapHakCode,
  normalizeKecamatanName,
  parseNomorHakEvidence,
} from "./su-formatter.ts";
import type { AiExtractionResult, StandardHakCode } from "./su-types.ts";

function normalizeOcrDigits(raw: string): string {
  return raw
    .replace(/[OoQD]/g, "0")
    .replace(/[Il|!]/g, "1")
    .replace(/S/g, "5")
    .replace(/\D/g, "");
}

function extractKecamatanFromText(rawText: string): {
  kecamatan: string | null;
  evidence: string | null;
} {
  const lines = rawText.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(
      /(?:kecamatan|ketjamatan|kec\.?|ketj\.?)\s*[:.\-]?\s*(.+)$/i,
    );
    if (!match) continue;

    const segment = match[1]
      .split(/\s*(?:\||,|;|\bkelurahan\b|\bdesa\b|\bkabupaten\b|\bkotamadya\b|\bkota\b|\bpropinsi\b|\bprovinsi\b)/i)[0]
      ?.trim();
    const normalized = normalizeKecamatanName(segment);
    if (normalized) {
      return {
        kecamatan: normalized,
        evidence: line.slice(0, 100),
      };
    }
  }
  return { kecamatan: null, evidence: null };
}

function extractSuNumberAndYear(rawText: string): {
  nomorSu: string | null;
  tahunSu: string | null;
  evidence: string | null;
} {
  // Accept common OCR confusions (O->0, I/l->1) inside SU number and 4-digit year tokens
  const numTok = "([0-9OoIl]{1,5})";
  const yearTok = "((?:19|20|1[9O]|2[0O])[0-9OoIl]{2})";

  // Pattern 1: Modern format e.g. "Nomor: 06/Helvetia Timur/2007" or noisy "Nomor: O6/Helvetia Timur/2007"
  const modernMatch = rawText.match(
    new RegExp(
      `(?:nomor|no\\.?)\\s*[:.\\-]?\\s*${numTok}\\s*\\/\\s*([A-Za-z0-9\\s.'-]{2,45}?)\\s*\\/\\s*${yearTok}\\b`,
      "i",
    ),
  );
  if (modernMatch) {
    return {
      nomorSu: normalizeOcrDigits(modernMatch[1]),
      tahunSu: normalizeOcrDigits(modernMatch[3]),
      evidence: `${modernMatch[1]}/${modernMatch[2].trim()}/${modernMatch[3]}`,
    };
  }

  // Pattern 2: Modern slash without explicit Nomor keyword
  const plainModernMatch = rawText.match(
    new RegExp(
      `\\b${numTok}\\s*\\/\\s*([A-Za-z][A-Za-z\\s.'-]{2,35}?)\\s*\\/\\s*${yearTok}\\b`,
    ),
  );
  if (plainModernMatch) {
    return {
      nomorSu: normalizeOcrDigits(plainModernMatch[1]),
      tahunSu: normalizeOcrDigits(plainModernMatch[3]),
      evidence: `${plainModernMatch[1]}/${plainModernMatch[2].trim()}/${plainModernMatch[3]}`,
    };
  }

  // Pattern 3: 1960s legacy format e.g. "Nomor : 12 / 1964" or "No. 45 tahun 1962"
  const legacyMatch = rawText.match(
    new RegExp(
      `(?:nomor|no\\.?|surat\\s+ukur\\s+no\\.?)\\s*[:.\\-]?\\s*${numTok}\\s*(?:\\/|\\btahun\\b|\\bthn\\.?\\b)\\s*${yearTok}\\b`,
      "i",
    ),
  );
  if (legacyMatch) {
    return {
      nomorSu: normalizeOcrDigits(legacyMatch[1]),
      tahunSu: normalizeOcrDigits(legacyMatch[2]),
      evidence: legacyMatch[0].trim(),
    };
  }

  // Pattern 4: Fallback compact "12/1964"
  const fallbackMatch = rawText.match(
    new RegExp(`\\b${numTok}\\s*\\/\\s*${yearTok}\\b`),
  );
  if (fallbackMatch) {
    return {
      nomorSu: normalizeOcrDigits(fallbackMatch[1]),
      tahunSu: normalizeOcrDigits(fallbackMatch[2]),
      evidence: fallbackMatch[0].trim(),
    };
  }

  return { nomorSu: null, tahunSu: null, evidence: null };
}

function extractHakAndNib(rawText: string): {
  kodeAngka: string | null;
  kodeHuruf: StandardHakCode | null;
  nomorHak: string | null;
  nib: string | null;
  evidence: string | null;
} {
  let detectedNib: string | null = null;
  const nibMatch = rawText.match(
    /\bN\.?I\.?B\.?\s*[:.\-]?\s*((?:[0-9OoIl][\s.\-·]*){13})\b/i,
  );
  if (nibMatch) {
    const digits = normalizeOcrDigits(nibMatch[1]);
    if (digits.length === 13) {
      detectedNib = nibMatch[1].trim();
    }
  }

  const fourteenDigitCandidates = rawText.matchAll(
    /(?:[0-9OoIl][\s.\-·]{0,2}){13}[0-9OoIl]/g,
  );
  for (const cand of fourteenDigitCandidates) {
    const rawSeg = cand[0].trim();
    const digits = normalizeOcrDigits(rawSeg);
    if (digits.length === 14) {
      const parsed = parseNomorHakEvidence(digits);
      if (parsed.kind === "nomor_hak_14" && parsed.nomorHak5) {
        return {
          kodeAngka: digits[8] ?? null,
          kodeHuruf: parsed.kodeHak,
          nomorHak: parsed.nomorHak5,
          nib: detectedNib,
          evidence: rawSeg,
        };
      }
    } else if (digits.length === 13 && !detectedNib) {
      detectedNib = rawSeg;
    }
  }

  const legacyHakMatch = rawText.match(
    /(?:Hak\s+Milik\s*[:.\-]?\s*)?\b(HM|HGU|HGB|HP|HPL|WAKAF)\b[\s.\-:/]*(?:No\.?\s*)?([0-9OoIl]{1,5})\b/i,
  );
  if (legacyHakMatch) {
    const code = mapHakCode(legacyHakMatch[1]);
    return {
      kodeAngka: null,
      kodeHuruf: code,
      nomorHak: normalizeOcrDigits(legacyHakMatch[2]),
      nib: detectedNib,
      evidence: legacyHakMatch[0].trim(),
    };
  }

  return {
    kodeAngka: null,
    kodeHuruf: null,
    nomorHak: null,
    nib: detectedNib,
    evidence: detectedNib,
  };
}

/**
 * Deterministic rule-based ATR/BPN Surat Ukur text parser used by the built-in
 * offline OCR engine (`tesseract.js`) when Vision AI is unavailable or bypassed.
 */
export function parseSuratUkurOcrText(
  rawText: string,
  ocrMeanConfidence = 75,
): AiExtractionResult {
  const normalizedConfidence = Math.max(
    0.45,
    Math.min(0.88, ocrMeanConfidence / 100),
  );
  const { nomorSu, tahunSu, evidence: suEvidence } =
    extractSuNumberAndYear(rawText);
  const hak = extractHakAndNib(rawText);
  const kec = extractKecamatanFromText(rawText);

  const hasSuHeader = /\b(SURAT\s+UK|GAMBAR\s+SITUASI)\b/i.test(rawText);
  const hasOnlyMapWords =
    /\bPETA\s+BIDANG\b/i.test(rawText) &&
    !hasSuHeader &&
    !nomorSu &&
    !hak.nomorHak;

  const isDataSu =
    !hasOnlyMapWords && Boolean(hasSuHeader || nomorSu || hak.nomorHak);

  return {
    is_halaman_data_su: isDataSu,
    nomor_su_raw: nomorSu || null,
    tahun_su: tahunSu || null,
    kode_jenis_hak_angka: hak.kodeAngka,
    kode_jenis_hak_huruf: hak.kodeHuruf,
    nomor_hak_raw: hak.nomorHak || null,
    kecamatan_raw: kec.kecamatan,
    nib_terdeteksi: hak.nib,
    raw_evidence: {
      teks_nomor_su: suEvidence,
      teks_nomor_hak: hak.evidence,
      teks_lokasi: kec.evidence,
    },
    confidence: {
      nomor_su: nomorSu ? normalizedConfidence : 0,
      tahun_su: tahunSu ? normalizedConfidence : 0,
      jenis_hak: hak.kodeHuruf ? Math.min(0.85, normalizedConfidence) : 0,
      nomor_hak: hak.nomorHak ? Math.min(0.84, normalizedConfidence) : 0,
      kecamatan: kec.kecamatan ? Math.min(0.82, normalizedConfidence) : 0,
    },
    catatan_peringatan:
      "Diekstrak oleh OCR Lokal bawaan sistem (tesseract.js). Harap periksa kembali angka & nama Kecamatan.",
  };
}
