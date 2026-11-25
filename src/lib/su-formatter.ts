import type {
  AiExtractionResult,
  ConfidenceLevel,
  FieldConfidenceMeta,
  StandardHakCode,
  SuFieldConfidences,
  SuNamingFields,
} from "./su-types";

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
  "HAK MILIK": "M",
  MILIK: "M",
  U: "U",
  HGU: "U",
  "HAK GUNA USAHA": "U",
  B: "B",
  HGB: "B",
  "HAK GUNA BANGUNAN": "B",
  P: "P",
  HP: "P",
  "HAK PAKAI": "P",
  L: "L",
  HPL: "L",
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

  // Match embedded 14-digit BPN Nomor Hak even if surrounded by labels or trailing dash
  const match14 = raw.match(
    /\b(\d{2})[\s.\-·_]*(\d{2})[\s.\-·_]*(\d{2})[\s.\-·_]*(\d{2})[\s.\-·_]*([123458])[\s.\-·_]*(\d{5})\b/,
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

  // Legacy short format e.g. "HM. 2246", "Hak Milik No. 145", "Hak Milik : HM. 145", "HGB No. 105", "M.02246"
  const shortMatch = raw
    .trim()
    .toUpperCase()
    .match(
      /\b(HAK\s+MILIK|HAK\s+GUNA\s+USAHA|HAK\s+GUNA\s+BANGUNAN|HAK\s+PAKAI|HAK\s+PENGELOLAAN|TANAH\s+WAKAF|HM|HGU|HGB|HP|HPL|WAKAF|M|U|B|P|L|W)[\s.\-:/]*(?:(?:NO|NOMOR)\.?)?[\s.\-:/]*(\d{1,5})\b/,
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
  const suMiddleIsKelurahan =
    suEvidenceSlash && /[a-zA-Z]{2,}/.test(suEvidenceSlash[2])
      ? suEvidenceSlash[2].trim()
      : null;

  const nomorSuClean =
    sanitizeDigits(extraction.nomor_su_raw) ||
    (suEvidenceSlash ? sanitizeDigits(suEvidenceSlash[1]) : "") ||
    (suEvidenceSimple ? sanitizeDigits(suEvidenceSimple[1]) : "");
  const nomorSuFormatted = nomorSuClean ? padFiveDigits(nomorSuClean) : "";

  // 2. Tahun SU: sanitize 4 digits + logical year check (1960..currentYear)
  const tahunClean = (
    sanitizeDigits(extraction.tahun_su).slice(0, 4) ||
    (suEvidenceSlash ? suEvidenceSlash[3] : "") ||
    (suEvidenceSimple ? suEvidenceSimple[2] : "")
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

  // 3. Kode Hak & Nomor Hak with 14-digit vs 13-digit NIB disambiguation
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

  const nomorHakFormatted = nomorHakDigits
    ? padFiveDigits(nomorHakDigits)
    : "";

  // 4. Kecamatan & Kelurahan/Desa with deterministic fallback from teks_lokasi / teks_nomor_su
  const lokasi = extraction.raw_evidence.teks_lokasi || "";
  const kecFromLokasi = lokasi.match(
    /(?:kecamatan|ketjamatan|kec\.?|ketj\.?)\s*[:.\-]?\s*([^\n,;\/|]+)/i,
  )?.[1];
  const kelFromLokasi = lokasi.match(
    /(?:kelurahan|kel\.?|desa|ds\.?|kampung|kp\.?)\s*[:.\-]?\s*([^\n,;\/|]+)/i,
  )?.[1];

  const kecamatanNormalized =
    normalizeKecamatanName(extraction.kecamatan_raw) ||
    normalizeKecamatanName(kecFromLokasi);
  const kelurahanNormalized =
    normalizeKelurahanName(extraction.kelurahan_raw) ||
    normalizeKelurahanName(kelFromLokasi) ||
    normalizeKelurahanName(suMiddleIsKelurahan);

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

  let tahunScore = extraction.confidence.tahun_su;
  let tahunReason: string | null = null;
  if (tahunClean.length === 4 && !tahunInRange) {
    tahunScore = Math.min(tahunScore, 0.72);
    tahunReason = `Tahun di luar rentang ${MIN_VALID_SU_YEAR}–${currentYear}`;
  }

  let hakScore = extraction.confidence.nomor_hak;
  let hakReason: string | null = null;
  if (parsedEvidence.kind === "nib_13" && !nomorHakFormatted) {
    hakScore = 0;
    hakReason = "Hanya NIB 13 digit yang terlihat";
  }

  return {
    fields: {
      nomorSu: nomorSuFormatted,
      tahunSu: tahunClean,
      kodeHak: resolvedHak ?? "",
      nomorHak: nomorHakFormatted,
      isCustomHak: false,
      customHak: "",
      kecamatan: kecamatanNormalized,
      kelurahan: kelurahanNormalized,
    },
    confidences: {
      nomorSu: makeMeta(extraction.confidence.nomor_su, Boolean(nomorSuFormatted)),
      tahunSu: makeMeta(tahunScore, tahunClean.length === 4, tahunReason),
      kodeHak: makeMeta(
        extraction.confidence.jenis_hak,
        Boolean(resolvedHak),
      ),
      nomorHak: makeMeta(hakScore, Boolean(nomorHakFormatted), hakReason),
      kecamatan: makeMeta(
        extraction.confidence.kecamatan,
        Boolean(kecamatanNormalized),
      ),
      kelurahan: makeMeta(
        extraction.confidence.kelurahan,
        Boolean(kelurahanNormalized),
      ),
    },
    isWrongPageSlot: !extraction.is_halaman_data_su,
    warnings,
    rawEvidence: {
      teksNomorSu: extraction.raw_evidence.teks_nomor_su,
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
