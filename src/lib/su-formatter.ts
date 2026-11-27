import type {
  AiExtractionResult,
  ConfidenceLevel,
  FieldConfidenceMeta,
  StandardHakCode,
  SuFieldConfidences,
  SuNamingFields,
} from "./su-types.ts";
import {
  findKecamatanByKelurahanAndCode,
  matchWilayahKecamatan,
  matchWilayahKelurahan,
  validateHakRegionCrossCheck,
} from "./wilayah-dict.ts";

export interface HakOption {
  code: StandardHakCode;
  digit: string;
  label: string;
  shortName: string;
}

export const HAK_OPTIONS: readonly HakOption[] = [
  {
    code: "M",
    digit: "1",
    label: "M - Hak Milik (Kode 1)",
    shortName: "Hak Milik",
  },
  {
    code: "U",
    digit: "2",
    label: "U - Hak Guna Usaha (Kode 2)",
    shortName: "Hak Guna Usaha",
  },
  {
    code: "B",
    digit: "3",
    label: "B - Hak Guna Bangunan (Kode 3)",
    shortName: "Hak Guna Bangunan",
  },
  {
    code: "P",
    digit: "4",
    label: "P - Hak Pakai (Kode 4)",
    shortName: "Hak Pakai",
  },
  {
    code: "L",
    digit: "5",
    label: "L - Hak Pengelolaan (Kode 5)",
    shortName: "Hak Pengelolaan",
  },
  {
    code: "W",
    digit: "8",
    label: "W - Tanah Wakaf (Kode 8)",
    shortName: "Tanah Wakaf",
  },
] as const;

const DIGIT_TO_HAK: Record<string, StandardHakCode> = {
  "1": "M",
  "2": "U",
  "3": "B",
  "4": "P",
  "5": "L",
  "8": "W",
};

const TEXT_TO_HAK: Record<string, StandardHakCode> = {
  M: "M",
  HM: "M",
  "H M": "M",
  "HAK MILIK": "M",
  MILIK: "M",
  U: "U",
  HGU: "U",
  "H G U": "U",
  "HAK GUNA USAHA": "U",
  B: "B",
  HGB: "B",
  "H G B": "B",
  "HAK GUNA BANGUNAN": "B",
  P: "P",
  HP: "P",
  "H P": "P",
  "HAK PAKAI": "P",
  L: "L",
  HPL: "L",
  "H P L": "L",
  "HAK PENGELOLAAN": "L",
  W: "W",
  WAKAF: "W",
  "TANAH WAKAF": "W",
};

export const DEFAULT_DRIVE_ROOT_FOLDER_ID =
  "1D5fIBh9sa8cD1QBTL1J3NoRw6NWDudub";

export const MIN_VALID_SU_YEAR = 1960;

export function sanitizeDigits(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(/\D/g, "");
}

const KECAMATAN_PREFIX_RE = /^(?:kecamatan|ketjamatan|kec\.?|ketj\.?)\s*[:.\-]?\s*/i;
const KELURAHAN_PREFIX_RE =
  /^(?:kelurahan|kel\.?|desa|ds\.?|kampung|kp\.?|gampong|nagari)\s*[:.\-]?\s*/i;

function normalizeRegionFolderName(
  raw: string | null | undefined,
  prefixPattern: RegExp,
): string {
  if (!raw) return "";
  const cleaned = raw
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
    .replace(prefixPattern, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  return cleaned
    .split(" ")
    .map((word) => {
      if (/^[IVXLCDM]{1,5}$/i.test(word) && word === word.toUpperCase()) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Normalizes a Kecamatan name for clean, deduplicated Google Drive subfolder naming.
 */
export function normalizeKecamatanName(raw: string | null | undefined): string {
  return normalizeRegionFolderName(raw, KECAMATAN_PREFIX_RE);
}

/**
 * Normalizes a Kelurahan/Desa name for nested subfolder naming inside Kecamatan.
 */
export function normalizeKelurahanName(raw: string | null | undefined): string {
  return normalizeRegionFolderName(raw, KELURAHAN_PREFIX_RE);
}

/**
 * Matches an existing Drive folder list against target Kecamatan using
 * normalized names so duplicates like "Kec. Medan Baru" vs "Medan Baru"
 * are reused cleanly.
 */
export function findMatchingKecamatanFolder<T extends { name: string }>(
  folders: readonly T[],
  targetKecamatan: string,
): T | undefined {
  const targetNormalized = normalizeKecamatanName(targetKecamatan).toLowerCase();
  if (!targetNormalized) return undefined;
  return folders.find(
    (f) => normalizeKecamatanName(f.name).toLowerCase() === targetNormalized,
  );
}

/**
 * Matches an existing Drive subfolder list against target Kelurahan/Desa
 * inside the Kecamatan folder.
 */
export function findMatchingKelurahanFolder<T extends { name: string }>(
  folders: readonly T[],
  targetKelurahan: string,
): T | undefined {
  const targetNormalized = normalizeKelurahanName(targetKelurahan).toLowerCase();
  if (!targetNormalized) return undefined;
  return folders.find(
    (f) => normalizeKelurahanName(f.name).toLowerCase() === targetNormalized,
  );
}

/**
 * Extracts a Google Drive folder ID from either a full sharing URL or a bare ID.
 */
export function extractDriveFolderId(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{10,120})/);
  if (urlMatch) return urlMatch[1];

  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,120})/);
  if (idParamMatch) return idParamMatch[1];

  if (/^[a-zA-Z0-9_-]{10,120}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * Formats an extracted or user-entered number as a 5-digit zero-padded string.
 * Preserves >5 digits only if explicitly over 5 digits; otherwise pads on left.
 */
export function padFiveDigits(raw: string | null | undefined): string {
  const digits = sanitizeDigits(raw);
  if (!digits) return "";
  return digits.length >= 5 ? digits.slice(-5) : digits.padStart(5, "0");
}

/**
 * Maps BPN numeric code (1/2/3/4/5/8) or abbreviation (HM, HGB, HP, etc.)
 * into standard 1-letter filename code.
 */
export function mapHakCode(
  input: string | null | undefined,
): StandardHakCode | null {
  if (!input) return null;
  const normalized = input.trim().toUpperCase().replace(/[.\-_]/g, " ").replace(/\s+/g, " ");
  if (DIGIT_TO_HAK[normalized]) {
    return DIGIT_TO_HAK[normalized];
  }
  if (TEXT_TO_HAK[normalized]) {
    return TEXT_TO_HAK[normalized];
  }
  // Check prefix matches like "HM 2246" or "HGB. 105"
  for (const [key, code] of Object.entries(TEXT_TO_HAK)) {
    if (key.length > 1 && normalized.startsWith(`${key} `)) {
      return code;
    }
  }
  return null;
}

/**
 * Parses 14-digit BPN Nomor Hak (e.g. "02.01.05.04.1.02246-" or "02 01·05·04·1 02246")
 * and distinguishes it from 13-digit NIB ("02.01.05.04.03043").
 */
export function parseNomorHakEvidence(raw: string | null | undefined): {
  kind: "nomor_hak_14" | "nib_13" | "short_hak" | "unknown";
  kodeHak: StandardHakCode | null;
  nomorHak5: string | null;
} {
  if (!raw) {
    return { kind: "unknown", kodeHak: null, nomorHak5: null };
  }

  // Match embedded 14-digit BPN Nomor Hak even if surrounded by box walls, labels, or trailing dash
  const match14 = raw.match(
    /\b(\d{2})[\s.\-·_,:;|\/\[\]]*(\d{2})[\s.\-·_,:;|\/\[\]]*(\d{2})[\s.\-·_,:;|\/\[\]]*(\d{2})[\s.\-·_,:;|\/\[\]]*([123458])[\s.\-·_,:;|\/\[\]]*(\d{5})\b/,
  );
  if (match14) {
    return {
      kind: "nomor_hak_14",
      kodeHak: mapHakCode(match14[5]),
      nomorHak5: match14[6],
    };
  }

  const digits = sanitizeDigits(raw);
  if (digits.length === 14) {
    const hakDigit = digits[8];
    const nomor5 = digits.slice(9, 14);
    return {
      kind: "nomor_hak_14",
      kodeHak: mapHakCode(hakDigit),
      nomorHak5: nomor5,
    };
  }

  if (digits.length === 13) {
    return { kind: "nib_13", kodeHak: null, nomorHak5: null };
  }

  const explicitNoHakMatch = raw
    .trim()
    .match(
      /\b(?:no\.?|nom[eo]r)\s*hak\b[\s.\-:]*([A-Za-z]{1,4}[\s.\-/]*)?(?:(?:no\.?|nom[eo]r)\.?\s*)?(\d{1,5})\b(?!\s*\/\s*(?:19|20)\d{2}\b)/i,
    );
  if (explicitNoHakMatch) {
    return {
      kind: "short_hak",
      kodeHak: explicitNoHakMatch[1]
        ? mapHakCode(explicitNoHakMatch[1].replace(/[.\-/]/g, " "))
        : null,
      nomorHak5: padFiveDigits(explicitNoHakMatch[2]),
    };
  }

  // Legacy short format e.g. "HM. 2246", "H.M. 145", "H.G.B. 105", "Hak Milik No. 145", "M.02246"
  const shortMatch = raw
    .trim()
    .toUpperCase()
    .match(
      /\b(HAK\s+MILIK|HAK\s+GUNA\s+USAHA|HAK\s+GUNA\s+BANGUNAN|HAK\s+PAKAI|HAK\s+PENGELOLAAN|TANAH\s+WAKAF|H\.?\s*G\.?\s*B\.?|H\.?\s*G\.?\s*U\.?|H\.?\s*P\.?\s*L\.?|H\.?\s*M\.?|H\.?\s*P\.?|WAKAF|M|U|B|P|L|W)[\s.\-:/]*(?:(?:NO|NOMOR)\.?)?[\s.\-:/]*(\d{1,5})\b/,
    );
  if (shortMatch) {
    return {
      kind: "short_hak",
      kodeHak: mapHakCode(shortMatch[1]),
      nomorHak5: padFiveDigits(shortMatch[2]),
    };
  }

  return { kind: "unknown", kodeHak: null, nomorHak5: null };
}

export function isValidTahunSu(
  rawYear: string,
  currentYear = new Date().getFullYear(),
): boolean {
  const digits = sanitizeDigits(rawYear);
  if (digits.length !== 4) return false;
  const num = Number(digits);
  return num >= MIN_VALID_SU_YEAR && num <= currentYear;
}

export function getConfidenceLevel(
  score: number | null,
  hasValidValue: boolean,
): ConfidenceLevel {
  if (!hasValidValue) return "low";
  if (score === null) return "medium";
  if (score >= 0.85) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

export function sanitizeCustomFilename(raw: string): string {
  const cleaned = raw
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "SU.dokumen.pdf";
  const withoutExt = cleaned.replace(/\.pdf$/i, "").replace(/\.+$/, "");
  if (!withoutExt) return "SU.dokumen.pdf";
  return `${withoutExt}.pdf`;
}

export function sanitizeHakSegment(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

export function getEffectiveKodeHak(fields: SuNamingFields): string {
  if (fields.isCustomHak) {
    return sanitizeHakSegment(fields.customHak);
  }
  return sanitizeHakSegment(fields.kodeHak);
}

export function buildStandardFilename(fields: SuNamingFields): string {
  const noSu = padFiveDigits(fields.nomorSu) || "_____";
  const tahun = sanitizeDigits(fields.tahunSu).slice(0, 4).padEnd(4, "_");
  const hak = getEffectiveKodeHak(fields) || "_";
  const noHak = padFiveDigits(fields.nomorHak) || "_____";
  return `SU.${noSu}.${tahun}.${hak}.${noHak}.pdf`;
}

export interface StandardValidationResult {
  valid: boolean;
  errors: Partial<Record<"nomorSu" | "tahunSu" | "kodeHak" | "nomorHak", string>>;
}

export function validateStandardFields(
  fields: SuNamingFields,
  currentYear = new Date().getFullYear(),
): StandardValidationResult {
  const errors: StandardValidationResult["errors"] = {};
  const noSu = sanitizeDigits(fields.nomorSu);
  if (!noSu || noSu.length > 5) {
    errors.nomorSu = "Isi 1–5 digit angka Nomor SU (contoh: 00006).";
  }

  const tahun = sanitizeDigits(fields.tahunSu);
  if (tahun.length !== 4) {
    errors.tahunSu = "Tahun SU harus tepat 4 digit (contoh: 2007).";
  } else {
    const yearNum = Number(tahun);
    if (yearNum < MIN_VALID_SU_YEAR || yearNum > currentYear) {
      errors.tahunSu = `Tahun SU harus antara ${MIN_VALID_SU_YEAR} dan ${currentYear}.`;
    }
  }

  const hak = getEffectiveKodeHak(fields);
  if (!hak) {
    errors.kodeHak = "Pilih atau isi Kode Jenis Hak (contoh: M).";
  }

  const noHak = sanitizeDigits(fields.nomorHak);
  if (!noHak || noHak.length > 5) {
    errors.nomorHak = "Isi 1–5 digit angka Nomor Hak (contoh: 02246).";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export interface PostProcessedExtraction {
  fields: SuNamingFields;
  confidences: SuFieldConfidences;
  isWrongPageSlot: boolean;
  warnings: string[];
  rawEvidence: {
    teksNomorSu: string | null;
    teksNomorHak: string | null;
    teksLokasi: string | null;
    nibTerdeteksi: string | null;
  };
}

/**
 * Deterministic post-processing pipeline per PRD Section 10.6 + Kecamatan extraction.
 */
export function applyExtractionToForm(
  extraction: AiExtractionResult,
  currentYear = new Date().getFullYear(),
): PostProcessedExtraction {
  const warnings: string[] = [];
  if (extraction.catatan_peringatan) {
    warnings.push(extraction.catatan_peringatan);
  }

  // 1. Nomor SU & Tahun SU with deterministic cross-check against raw_evidence.teks_nomor_su
  const suEvidenceSlash = extraction.raw_evidence.teks_nomor_su?.match(
    /\b(\d{1,5})\s*\/\s*([^\/\n]{2,50}?)\s*\/\s*((?:19|20)\d{2})\b/,
  );
  const suEvidenceSimple = extraction.raw_evidence.teks_nomor_su?.match(
    /\b(\d{1,5})\s*(?:\/|\btahun\b|\bthn\.?)\s*((?:19|20)\d{2})\b/i,
  );
  const suEvidenceLegacy2 = extraction.raw_evidence.teks_nomor_su?.match(
    /\b(\d{1,5})\s*\/\s*([6-9]\d)\b/,
  );
  const suMiddleIsKelurahan =
    suEvidenceSlash && /[a-zA-Z]{2,}/.test(suEvidenceSlash[2])
      ? suEvidenceSlash[2].trim()
      : null;

  const rawSuDigits = sanitizeDigits(extraction.nomor_su_raw);
  const nomorSuClean =
    (rawSuDigits.length >= 1 && rawSuDigits.length <= 5 ? rawSuDigits : "") ||
    (suEvidenceSlash ? sanitizeDigits(suEvidenceSlash[1]) : "") ||
    (suEvidenceSimple ? sanitizeDigits(suEvidenceSimple[1]) : "") ||
    (suEvidenceLegacy2 ? sanitizeDigits(suEvidenceLegacy2[1]) : "");
  const nomorSuFormatted = nomorSuClean ? padFiveDigits(nomorSuClean) : "";

  // 2. Tahun SU: sanitize 4 digits + logical year check (1960..currentYear)
  const tahunClean = (
    sanitizeDigits(extraction.tahun_su).slice(0, 4) ||
    (suEvidenceSlash ? suEvidenceSlash[3] : "") ||
    (suEvidenceSimple ? suEvidenceSimple[2] : "") ||
    (suEvidenceLegacy2 ? `19${suEvidenceLegacy2[2]}` : "")
  ).slice(0, 4);
  const tahunInRange =
    tahunClean.length === 4 &&
    Number(tahunClean) >= MIN_VALID_SU_YEAR &&
    Number(tahunClean) <= currentYear;
  if (tahunClean.length === 4 && !tahunInRange) {
    warnings.push(
      `Tahun SU terbaca "${tahunClean}" di luar rentang wajar (${MIN_VALID_SU_YEAR}–${currentYear}). Harap periksa.`,
    );
  }

  // 3. Kode Hak & Nomor Hak with 14-digit vs 13-digit NIB disambiguation and SU-copy guard
  const parsedEvidence = parseNomorHakEvidence(
    extraction.raw_evidence.teks_nomor_hak,
  );

  let resolvedHak: StandardHakCode | null =
    extraction.kode_jenis_hak_huruf ??
    mapHakCode(extraction.kode_jenis_hak_angka) ??
    parsedEvidence.kodeHak;

  // Fallback: check legacy short format in nomor_hak_raw
  if (!resolvedHak && extraction.nomor_hak_raw) {
    const fallbackShort = parseNomorHakEvidence(extraction.nomor_hak_raw);
    resolvedHak = fallbackShort.kodeHak;
  }

  let nomorHakDigits = sanitizeDigits(extraction.nomor_hak_raw);
  // If AI accidentally placed a 14-digit string in nomor_hak_raw, extract last 5 digits + code
  if (nomorHakDigits.length === 14) {
    const parsed14 = parseNomorHakEvidence(nomorHakDigits);
    if (!resolvedHak && parsed14.kodeHak) {
      resolvedHak = parsed14.kodeHak;
    }
    nomorHakDigits = parsed14.nomorHak5 ?? nomorHakDigits.slice(9, 14);
  } else if (nomorHakDigits.length === 13) {
    // Safety guard: 13 digits is an NIB, never use as Nomor Hak
    nomorHakDigits = "";
    warnings.push(
      "Angka 13 digit terdeteksi sebagai NIB (bukan Nomor Hak 14 digit). Isi Nomor Hak secara manual.",
    );
  } else if (!nomorHakDigits && parsedEvidence.nomorHak5) {
    nomorHakDigits = parsedEvidence.nomorHak5;
  }

  let nomorHakFormatted = nomorHakDigits
    ? padFiveDigits(nomorHakDigits)
    : "";
  let duplicateSuHakRejected = false;

  // Guard against AI/OCR mistakenly copying Nomor SU (e.g. 00001/2009) into Nomor Hak
  if (nomorSuFormatted && nomorHakFormatted && nomorSuFormatted === nomorHakFormatted) {
    const hakEvText = extraction.raw_evidence.teks_nomor_hak || "";
    const suEvText = extraction.raw_evidence.teks_nomor_su || "";
    const hakEvLooksLikeSuSlash =
      /\b\d{1,5}\s*\/\s*(?:19|20)\d{2}\b/.test(hakEvText) &&
      parsedEvidence.kind !== "nomor_hak_14";

    if (parsedEvidence.nomorHak5 && parsedEvidence.nomorHak5 !== nomorSuFormatted) {
      nomorHakFormatted = parsedEvidence.nomorHak5;
    } else if (
      hakEvLooksLikeSuSlash ||
      (!hakEvText.trim() && suEvText.trim()) ||
      (hakEvText.trim() && hakEvText.trim() === suEvText.trim())
    ) {
      nomorHakFormatted = "";
      duplicateSuHakRejected = true;
      warnings.push(
        `Nomor Hak terbaca sama dengan Nomor SU ("${nomorSuFormatted}") tanpa bukti Hak terpisah — dibersihkan agar tidak tertukar. Silakan isi Nomor Hak 5 digit.`,
      );
    } else {
      warnings.push(
        `Nomor SU (${nomorSuFormatted}) dan Nomor Hak (${nomorHakFormatted}) kebetulan bernilai sama — pastikan keduanya memang identik di warkah.`,
      );
    }
  }

  // 4. Kecamatan & Kelurahan/Desa with deterministic fallback from teks_lokasi / teks_nomor_su
  const lokasi = extraction.raw_evidence.teks_lokasi || "";
  const kecFromLokasi = lokasi.match(
    /(?:kecamatan|ketjamatan|kec\.?|ketj\.?)\s*[:.\-]?\s*([^\n,;\/|]+)/i,
  )?.[1];
  const kelFromLokasi = lokasi.match(
    /(?:kelurahan|kel\.?|desa|ds\.?|kampung|kp\.?)\s*[:.\-]?\s*([^\n,;\/|]+)/i,
  )?.[1];

  const kecamatanRawNormalized =
    normalizeKecamatanName(extraction.kecamatan_raw) ||
    normalizeKecamatanName(kecFromLokasi);
  const kecMatch = kecamatanRawNormalized
    ? matchWilayahKecamatan(kecamatanRawNormalized)
    : null;
  const kecamatanNormalized =
    kecMatch?.matched && kecMatch.similarity >= 0.8
      ? kecMatch.matched
      : kecamatanRawNormalized;
  if (
    kecMatch?.matched &&
    kecMatch.corrected &&
    kecMatch.similarity >= 0.8 &&
    kecMatch.similarity < 0.99
  ) {
    warnings.push(
      `Koreksi kamus wilayah: Kecamatan "${kecamatanRawNormalized}" disamakan ke "${kecMatch.matched}".`,
    );
  }

  const kelurahanCandidate =
    normalizeKelurahanName(extraction.kelurahan_raw) ||
    normalizeKelurahanName(kelFromLokasi) ||
    normalizeKelurahanName(suMiddleIsKelurahan);
  // Reject digit-garbled OCR kelurahan tokens (e.g. "5 Tamu") unless dictionary-confirmed
  const kelGlobalFirst = kelurahanCandidate
    ? matchWilayahKelurahan(kelurahanCandidate)
    : null;
  const kelFromDictFirst = kelurahanCandidate
    ? matchWilayahKelurahan(kelurahanCandidate, kecamatanNormalized)
    : null;
  const bestKelDictFirst =
    kelFromDictFirst?.matched && kelFromDictFirst.similarity >= 0.82
      ? kelFromDictFirst
      : kelGlobalFirst;
  const kelurahanRawNormalized =
    kelurahanCandidate &&
    (/\d/.test(kelurahanCandidate) &&
      (!bestKelDictFirst?.matched || bestKelDictFirst.similarity < 0.85))
      ? suMiddleIsKelurahan
        ? normalizeKelurahanName(suMiddleIsKelurahan)
        : ""
      : kelurahanCandidate;
  const kelScopedMatch = kelurahanRawNormalized
    ? matchWilayahKelurahan(kelurahanRawNormalized, kecamatanNormalized)
    : null;
  const kelMatch =
    kelScopedMatch?.matched && kelScopedMatch.similarity >= 0.82
      ? kelScopedMatch
      : kelurahanRawNormalized
        ? matchWilayahKelurahan(kelurahanRawNormalized)
        : null;
  const kelurahanNormalized =
    kelMatch?.matched && kelMatch.similarity >= 0.8
      ? kelMatch.matched
      : kelurahanRawNormalized;
  if (
    kelMatch?.matched &&
    kelMatch.corrected &&
    kelMatch.similarity >= 0.8 &&
    kelMatch.similarity < 0.99
  ) {
    warnings.push(
      `Koreksi kamus wilayah: Kelurahan "${kelurahanRawNormalized}" disamakan ke "${kelMatch.matched}".`,
    );
  }

  // Reconcile Kecamatan against unique Kelurahan owner + 14-digit Kantah code when AI misreads Kecamatan (e.g. Medan Belawan vs Tanjung Sari)
  const hakEvRawForRegion = extraction.raw_evidence.teks_nomor_hak || "";
  const preCrossCheck = validateHakRegionCrossCheck({
    rawNomorHak: hakEvRawForRegion,
    kecamatan: kecamatanNormalized,
    kelurahan: kelurahanNormalized,
  });
  let resolvedKecamatan = kecamatanNormalized;
  let kecAutoReconciledNote: string | null = null;
  if (kelurahanNormalized) {
    const ownerInfo = findKecamatanByKelurahanAndCode(
      kelurahanNormalized,
      preCrossCheck.kecCode,
    );
    if (
      ownerInfo &&
      (!resolvedKecamatan ||
        (preCrossCheck.status === "mismatch" &&
          preCrossCheck.suggestedKecamatan === ownerInfo.kecamatan))
    ) {
      if (resolvedKecamatan && resolvedKecamatan !== ownerInfo.kecamatan) {
        kecAutoReconciledNote = `Kecamatan "${resolvedKecamatan}" diselaraskan ke "${ownerInfo.kecamatan}" sesuai Kelurahan "${kelurahanNormalized}" & kode Nomor Hak`;
        warnings.push(`${kecAutoReconciledNote}. Harap cek kembali.`);
      } else if (!resolvedKecamatan && ownerInfo.uniqueOwner) {
        kecAutoReconciledNote = `Kecamatan dilengkapi otomatis dari Kelurahan "${kelurahanNormalized}"`;
      }
      if (resolvedKecamatan || ownerInfo.uniqueOwner) {
        resolvedKecamatan = ownerInfo.kecamatan;
      }
    }
  }

  // 5. Calibrate confidence deterministically (prevents blanket overconfident 95%-99% LLM/OCR guesses)
  const makeMeta = (
    score: number,
    hasValue: boolean,
    customReason?: string | null,
  ): FieldConfidenceMeta => {
    const level = getConfidenceLevel(score, hasValue);
    return {
      score,
      level,
      reason: customReason ?? null,
    };
  };

  const clampScore = (s: number): number =>
    Math.max(0, Math.min(0.96, Math.round(s * 100) / 100));

  const noteText = (extraction.catatan_peringatan || "").toLowerCase();
  const hasAmbiguityCue =
    /(?:ragu|timpa|tumpang|coret|buram|kabur|samar|tidak\s+(?:terbaca|jelas)|terpotong|kemungkinan|\?|\batau\b)/i.test(
      noteText,
    );

  // 5a. Nomor SU calibration
  let suScore = clampScore(extraction.confidence.nomor_su);
  let suReason: string | null = null;
  const suEvRaw = extraction.raw_evidence.teks_nomor_su || "";
  const suEvNoDistractor = !/\b(?:daftar\s+isian|d\.?\s*i\.?\s*30\d|302|307|207|dialihmediakan|nip)\b/i.test(
    suEvRaw,
  );
  const suNumNoZero = nomorSuClean.replace(/^0+/, "") || nomorSuClean;
  const suEvDigits = sanitizeDigits(suEvRaw);
  const suCorroborated =
    Boolean(nomorSuFormatted) &&
    Boolean(suEvRaw.trim()) &&
    suEvNoDistractor &&
    suEvDigits.includes(suNumNoZero);

  if (nomorSuFormatted && !suEvNoDistractor) {
    suScore = Math.min(suScore, 0.58);
    suReason = "Bukti mirip nomor Daftar Isian/stempel, wajib cek visual";
    warnings.push(
      `Nomor SU (${nomorSuFormatted}) tampak berasal dari baris distraktor ("${suEvRaw}") — mohon periksa ulang.`,
    );
  } else if (nomorSuFormatted && !suCorroborated) {
    suScore = Math.min(suScore, 0.72);
    suReason = "Bukti teks Nomor SU belum terkonfirmasi";
  } else if (
    hasAmbiguityCue &&
    /(?:\bsu\b|nomor\s+su|surat\s+ukur|tahun)/i.test(noteText)
  ) {
    suScore = Math.min(suScore, 0.74);
    suReason = "Catatan AI menandai tulisan SU kurang jelas";
  } else if (suCorroborated) {
    const strongSuContext =
      Boolean(suEvidenceSlash && kelMatch?.matched) ||
      (Boolean(suEvidenceSimple) && tahunInRange);
    suScore = Math.min(suScore, strongSuContext ? 0.94 : 0.9);
  }

  // 5b. Tahun SU calibration
  let tahunScore = clampScore(extraction.confidence.tahun_su);
  let tahunReason: string | null = null;
  if (tahunClean.length === 4 && !tahunInRange) {
    tahunScore = Math.min(tahunScore, 0.68);
    tahunReason = `Tahun di luar rentang ${MIN_VALID_SU_YEAR}–${currentYear}`;
  } else if (tahunClean && (!suEvNoDistractor || !suEvDigits.includes(tahunClean))) {
    tahunScore = Math.min(tahunScore, suEvNoDistractor ? 0.74 : 0.58);
    tahunReason = suEvNoDistractor
      ? "Tahun SU belum terkonfirmasi di teks bukti"
      : "Tahun terdeteksi dari baris distraktor";
  }

  // 5c. Kode & Nomor Hak calibration (+ 8-digit prefix cross-check)
  let hakScore = clampScore(extraction.confidence.nomor_hak);
  let hakReason: string | null = null;
  let jenisHakScore = clampScore(extraction.confidence.jenis_hak);
  let jenisHakReason: string | null = null;

  const hakEvRaw = extraction.raw_evidence.teks_nomor_hak || "";
  const hakEvContainsDigits =
    Boolean(nomorHakDigits) &&
    sanitizeDigits(hakEvRaw).includes(nomorHakDigits.replace(/^0+/, "") || nomorHakDigits);
  const hakHasAmbiguityInEvidence =
    /(?:\?|\batau\b|\/.*\/|timpa|coret)/i.test(hakEvRaw) ||
    (hasAmbiguityCue && /(?:\bhak\b|digit|kotak|14\s*digit)/i.test(noteText));

  const regionCrossCheck = validateHakRegionCrossCheck({
    rawNomorHak: hakEvRaw,
    kecamatan: resolvedKecamatan,
    kelurahan: kelurahanNormalized,
  });

  if (duplicateSuHakRejected) {
    hakScore = 0;
    hakReason = "Dibersihkan karena identik dengan Nomor SU";
  } else if (parsedEvidence.kind === "nib_13" && !nomorHakFormatted) {
    hakScore = 0;
    hakReason = "Hanya NIB 13 digit yang terlihat";
  } else if (regionCrossCheck.status === "mismatch" && regionCrossCheck.message) {
    hakScore = Math.min(hakScore, 0.58);
    hakReason = "Kode wilayah Nomor Hak berbeda dengan Kecamatan/Kelurahan";
    warnings.push(regionCrossCheck.message);
  } else if (hakHasAmbiguityInEvidence) {
    hakScore = Math.min(hakScore, 0.72);
    hakReason = "Digit tulisan tangan tertimpa/meragukan — cek visual";
  } else if (nomorHakFormatted) {
    if (parsedEvidence.kind === "nomor_hak_14") {
      if (parsedEvidence.nomorHak5 !== nomorHakFormatted) {
        hakScore = Math.min(hakScore, 0.68);
        hakReason = "5 digit akhir berbeda dengan bukti 14 digit";
      } else {
        // Handwritten 14-digit cells often carry ambiguous strokes on the last digit; cap realistically at 0.92
        hakScore = Math.min(hakScore, 0.92);
      }
      if (parsedEvidence.kodeHak && resolvedHak && parsedEvidence.kodeHak !== resolvedHak) {
        jenisHakScore = Math.min(jenisHakScore, 0.62);
        jenisHakReason = `Digit ke-9 (${parsedEvidence.kodeHak}) berbeda dengan pilihan (${resolvedHak})`;
      } else if (parsedEvidence.kodeHak === resolvedHak) {
        jenisHakScore = Math.min(jenisHakScore, 0.94);
      }
    } else if (parsedEvidence.kind === "short_hak" && hakEvContainsDigits) {
      hakScore = Math.min(hakScore, 0.87);
      jenisHakScore = Math.min(jenisHakScore, 0.9);
    } else if (!hakEvContainsDigits) {
      hakScore = Math.min(hakScore, 0.68);
      hakReason = "Angka Nomor Hak belum terkonfirmasi di teks bukti";
    } else {
      hakScore = Math.min(hakScore, 0.82);
    }
  }

  // 5d. Kecamatan & Kelurahan dictionary & hierarchy calibration
  let kecScore = clampScore(extraction.confidence.kecamatan);
  let kecReason: string | null = null;
  if (resolvedKecamatan) {
    if (kecAutoReconciledNote) {
      kecScore = Math.min(kecScore || 0.78, 0.78);
      kecReason = "Diselaraskan dengan Kelurahan & kode wilayah — cek visual";
    } else if (regionCrossCheck.status === "mismatch") {
      kecScore = Math.min(kecScore, 0.65);
      kecReason = "Tidak cocok dengan prefiks kode wilayah Nomor Hak";
    } else if (kecMatch?.matched && kecMatch.corrected && kecMatch.similarity < 0.99) {
      kecScore = Math.min(kecScore, 0.78);
      kecReason = "Hasil koreksi kamus wilayah";
    } else if (!kecMatch?.matched || kecMatch.similarity < 0.85) {
      kecScore = Math.min(kecScore, 0.68);
      kecReason = "Kecamatan belum ada di kamus referensi";
    } else {
      kecScore = Math.min(kecScore, regionCrossCheck.status === "match" ? 0.95 : 0.93);
    }
  }

  let kelScore = clampScore(extraction.confidence.kelurahan);
  let kelReason: string | null = null;
  if (kelurahanNormalized) {
    const strictKelInKec = resolvedKecamatan
      ? matchWilayahKelurahan(kelurahanNormalized, resolvedKecamatan)
      : kelMatch;
    if (kelMatch?.matched && kelMatch.corrected && kelMatch.similarity < 0.99) {
      kelScore = Math.min(kelScore, 0.78);
      kelReason = "Hasil koreksi kamus Kelurahan";
    } else if (!kelMatch?.matched || kelMatch.similarity < 0.85) {
      kelScore = Math.min(kelScore, 0.66);
      kelReason = "Kelurahan belum ada di kamus referensi";
    } else if (
      resolvedKecamatan &&
      matchWilayahKecamatan(resolvedKecamatan).matched &&
      (!strictKelInKec?.matched || strictKelInKec.similarity < 0.85)
    ) {
      kelScore = Math.min(kelScore, 0.7);
      kelReason = `Kelurahan tidak umum di ${resolvedKecamatan}`;
    } else {
      kelScore = Math.min(kelScore, suMiddleIsKelurahan ? 0.95 : 0.93);
    }
  }

  const normalizedTeksNomorSu =
    nomorSuClean && tahunClean
      ? `${(suEvidenceSlash ? sanitizeDigits(suEvidenceSlash[1]) : "") || nomorSuClean}/${tahunClean}`
      : extraction.raw_evidence.teks_nomor_su;
  const cleanedLuasTanah = extraction.luas_tanah
    ? extraction.luas_tanah.replace(/(\d)[\s.\-]+(?=(?:m\s*2|m²|meter))/gi, "$1 ").trim()
    : "";

  return {
    fields: {
      nomorSu: nomorSuFormatted,
      tahunSu: tahunClean,
      kodeHak: resolvedHak ?? "",
      nomorHak: nomorHakFormatted,
      isCustomHak: false,
      customHak: "",
      kecamatan: resolvedKecamatan,
      kelurahan: kelurahanNormalized,
      nib: extraction.nib_terdeteksi || "",
      luasTanah: cleanedLuasTanah,
    },
    confidences: {
      nomorSu: makeMeta(suScore, Boolean(nomorSuFormatted), suReason),
      tahunSu: makeMeta(tahunScore, tahunClean.length === 4, tahunReason),
      kodeHak: makeMeta(jenisHakScore, Boolean(resolvedHak), jenisHakReason),
      nomorHak: makeMeta(hakScore, Boolean(nomorHakFormatted), hakReason),
      kecamatan: makeMeta(kecScore, Boolean(resolvedKecamatan), kecReason),
      kelurahan: makeMeta(kelScore, Boolean(kelurahanNormalized), kelReason),
    },
    isWrongPageSlot: !extraction.is_halaman_data_su,
    warnings,
    rawEvidence: {
      teksNomorSu: normalizedTeksNomorSu,
      teksNomorHak: extraction.raw_evidence.teks_nomor_hak,
      teksLokasi: extraction.raw_evidence.teks_lokasi ?? null,
      nibTerdeteksi: extraction.nib_terdeteksi,
    },
  };
}

export function createEmptyFields(): SuNamingFields {
  return {
    nomorSu: "",
    tahunSu: "",
    kodeHak: "M",
    nomorHak: "",
    isCustomHak: false,
    customHak: "",
    kecamatan: "",
    kelurahan: "",
    nib: "",
    luasTanah: "",
  };
}

export function createEmptyConfidences(): SuFieldConfidences {
  return {
    nomorSu: { score: null, level: "low", reason: null },
    tahunSu: { score: null, level: "low", reason: null },
    kodeHak: { score: null, level: "medium", reason: null },
    nomorHak: { score: null, level: "low", reason: null },
    kecamatan: { score: null, level: "low", reason: null },
    kelurahan: { score: null, level: "low", reason: null },
  };
}
