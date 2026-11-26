import type { SuNamingFields } from "./su-types";
import type { LearnedWilayahCodeMapping } from "./wilayah-dict";

const CORRECTION_MEMORY_KEY = "su_scanner_correction_memory_v1";
const MAX_CORRECTION_RULES = 200;
const MAX_WILAYAH_CODES = 300;

export type CorrectableFieldType = "kecamatan" | "kelurahan" | "kodeHak";

export interface CorrectionRule {
  id: string;
  field: CorrectableFieldType;
  fromRaw: string;
  toValue: string;
  hits: number;
  updatedAt: number;
}

export interface CorrectionMemoryState {
  rules: CorrectionRule[];
  wilayahCodes: LearnedWilayahCodeMapping[];
}

function createEmptyMemory(): CorrectionMemoryState {
  return { rules: [], wilayahCodes: [] };
}

function normalizeMatchKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export function loadCorrectionMemory(): CorrectionMemoryState {
  if (typeof window === "undefined") return createEmptyMemory();
  try {
    const raw = localStorage.getItem(CORRECTION_MEMORY_KEY);
    if (!raw) return createEmptyMemory();
    const parsed = JSON.parse(raw) as Partial<CorrectionMemoryState>;
    return {
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
      wilayahCodes: Array.isArray(parsed.wilayahCodes) ? parsed.wilayahCodes : [],
    };
  } catch {
    return createEmptyMemory();
  }
}

export function saveCorrectionMemory(state: CorrectionMemoryState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CORRECTION_MEMORY_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota restrictions
  }
}

/**
 * Records an operator's manual correction of an AI/OCR output so recurring local typos
 * or specific office abbreviations are automatically corrected on future scans.
 */
export function recordFieldCorrection(
  field: CorrectableFieldType,
  fromRaw: string | null | undefined,
  toValue: string | null | undefined,
): CorrectionMemoryState {
  const fromClean = (fromRaw || "").trim();
  const toClean = (toValue || "").trim();
  const state = loadCorrectionMemory();
  if (
    !fromClean ||
    !toClean ||
    normalizeMatchKey(fromClean) === normalizeMatchKey(toClean)
  ) {
    return state;
  }

  const ruleKey = `${field}::${normalizeMatchKey(fromClean)}`;
  const idx = state.rules.findIndex(
    (r) => `${r.field}::${normalizeMatchKey(r.fromRaw)}` === ruleKey,
  );
  if (idx >= 0) {
    state.rules[idx] = {
      ...state.rules[idx],
      toValue: toClean,
      hits: state.rules[idx].hits + 1,
      updatedAt: Date.now(),
    };
  } else {
    state.rules.unshift({
      id: ruleKey,
      field,
      fromRaw: fromClean,
      toValue: toClean,
      hits: 1,
      updatedAt: Date.now(),
    });
  }

  state.rules = state.rules
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CORRECTION_RULES);
  saveCorrectionMemory(state);
  return state;
}

/**
 * Associates an exported/confirmed 14-digit Nomor Hak prefix (PP.KK.KKC.KLR)
 * with its Kecamatan and Kelurahan so future scans cross-check consistency automatically.
 */
export function learnWilayahCodeFromConfirmedScan(params: {
  rawNomorHak: string | null | undefined;
  kecamatan: string;
  kelurahan: string;
}): CorrectionMemoryState {
  const digits = String(params.rawNomorHak || "").replace(/\D/g, "");
  const kec = params.kecamatan.trim();
  const kel = params.kelurahan.trim();
  const state = loadCorrectionMemory();
  if (digits.length !== 14 || !kec) return state;

  const prefix8 = `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
  const kecPrefix6 = `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 6)}`;

  const idx = state.wilayahCodes.findIndex((c) => c.prefix8 === prefix8);
  if (idx >= 0) {
    state.wilayahCodes[idx] = {
      prefix8,
      kecPrefix6,
      kecamatan: kec,
      kelurahan: kel || state.wilayahCodes[idx].kelurahan,
      confirmedCount: state.wilayahCodes[idx].confirmedCount + 1,
    };
  } else {
    state.wilayahCodes.unshift({
      prefix8,
      kecPrefix6,
      kecamatan: kec,
      kelurahan: kel,
      confirmedCount: 1,
    });
  }

  state.wilayahCodes = state.wilayahCodes.slice(0, MAX_WILAYAH_CODES);
  saveCorrectionMemory(state);
  return state;
}

/**
 * Applies learned self-corrections to extracted fields before presenting them to the operator.
 */
export function applyCorrectionMemoryToFields(
  fields: SuNamingFields,
  rawEvidence?: {
    teksLokasi?: string | null;
  },
  memory?: CorrectionMemoryState,
): {
  fields: SuNamingFields;
  appliedNotes: string[];
} {
  const state = memory ?? loadCorrectionMemory();
  const next = { ...fields };
  const appliedNotes: string[] = [];

  const findRule = (field: CorrectableFieldType, candidates: string[]) => {
    for (const c of candidates) {
      const k = normalizeMatchKey(c);
      if (!k) continue;
      const found = state.rules.find(
        (r) => r.field === field && normalizeMatchKey(r.fromRaw) === k,
      );
      if (found) return found;
    }
    return null;
  };

  if (next.kecamatan) {
    const rule = findRule("kecamatan", [
      next.kecamatan,
      rawEvidence?.teksLokasi || "",
    ]);
    if (rule && normalizeMatchKey(rule.toValue) !== normalizeMatchKey(next.kecamatan)) {
      appliedNotes.push(
        `Memori koreksi: Kecamatan "${next.kecamatan}" → "${rule.toValue}"`,
      );
      next.kecamatan = rule.toValue;
    }
  }

  if (next.kelurahan) {
    const rule = findRule("kelurahan", [next.kelurahan]);
    if (rule && normalizeMatchKey(rule.toValue) !== normalizeMatchKey(next.kelurahan)) {
      appliedNotes.push(
        `Memori koreksi: Kelurahan "${next.kelurahan}" → "${rule.toValue}"`,
      );
      next.kelurahan = rule.toValue;
    }
  }

  return { fields: next, appliedNotes };
}

export function deleteCorrectionRule(id: string): CorrectionMemoryState {
  const state = loadCorrectionMemory();
  state.rules = state.rules.filter((r) => r.id !== id);
  saveCorrectionMemory(state);
  return state;
}

export function clearAllCorrectionMemory(): CorrectionMemoryState {
  const fresh = createEmptyMemory();
  saveCorrectionMemory(fresh);
  return fresh;
}
