export interface KecamatanWilayahEntry {
  kecamatan: string;
  /** Optional common Kantah 2-digit kecamatan code hints (PP.KK.KKC) */
  kantahCodes?: readonly string[];
  kelurahan: readonly string[];
}

/**
 * Official master regional dictionary covering Kota Medan (21 Kecamatan, 151 Kelurahan)
 * plus major surrounding Kantah Deli Serdang & Kota Binjai districts for operator convenience.
 */
export const MASTER_WILAYAH_ENTRIES: readonly KecamatanWilayahEntry[] = [
  {
    kecamatan: "Medan Amplas",
    kantahCodes: ["01", "11"],
    kelurahan: [
      "Amplas",
      "Bangun Mulia",
      "Harjosari I",
      "Harjosari II",
      "Sitirejo II",
      "Sitirejo III",
      "Timbang Deli",
    ],
  },
  {
    kecamatan: "Medan Area",
    kantahCodes: ["02", "10"],
    kelurahan: [
      "Kotamatsum I",
      "Kotamatsum II",
      "Kotamatsum IV",
      "Pandau Hulu II",
      "Pasar Merah Timur",
      "Sei Rengas II",
      "Sei Rengas Permata",
      "Sukaramai I",
      "Sukaramai II",
      "Tegal Sari I",
      "Tegal Sari II",
      "Tegal Sari III",
    ],
  },
  {
    kecamatan: "Medan Barat",
    kantahCodes: ["03"],
    kelurahan: [
      "Glugur Kota",
      "Karang Berombak",
      "Kesawan",
      "Pulo Brayan Kota",
      "Sei Agul",
      "Silalas",
    ],
  },
  {
    kecamatan: "Medan Baru",
    kantahCodes: ["04"],
    kelurahan: [
      "Babura",
      "Darat",
      "Merdeka",
      "Padang Bulan",
      "Petisah Hulu",
      "Titi Rantai",
    ],
  },
  {
    kecamatan: "Medan Belawan",
    kantahCodes: ["05"],
    kelurahan: [
      "Bagan Deli",
      "Belawan Bahagia",
      "Belawan Bahari",
      "Belawan I",
      "Belawan II",
      "Belawan Sicanang",
    ],
  },
  {
    kecamatan: "Medan Deli",
    kantahCodes: ["06"],
    kelurahan: [
      "Kota Bangun",
      "Mabar",
      "Mabar Hilir",
      "Tanjung Mulia",
      "Tanjung Mulia Hilir",
      "Titi Papan",
    ],
  },
  {
    kecamatan: "Medan Denai",
    kantahCodes: ["07"],
    kelurahan: [
      "Binjai",
      "Denai",
      "Medan Tenggara",
      "Tegal Sari Mandala I",
      "Tegal Sari Mandala II",
      "Tegal Sari Mandala III",
    ],
  },
  {
    kecamatan: "Medan Helvetia",
    kantahCodes: ["08", "05"],
    kelurahan: [
      "Cinta Damai",
      "Dwikora",
      "Helvetia",
      "Helvetia Tengah",
      "Helvetia Timur",
      "Sei Sikambing C II",
      "Tanjung Gusta",
    ],
  },
  {
    kecamatan: "Medan Johor",
    kantahCodes: ["09"],
    kelurahan: [
      "Gedung Johor",
      "Kedai Durian",
      "Kwala Bekala",
      "Pangkalan Masyhur",
      "Suka Maju",
      "Titi Kuning",
    ],
  },
  {
    kecamatan: "Medan Kota",
    kantahCodes: ["10"],
    kelurahan: [
      "Kotamatsum III",
      "Mesjid",
      "Pandau Hulu I",
      "Pasar Baru",
      "Pasar Merah Barat",
      "Pusat Pasar",
      "Sei Rengas I",
      "Sitirejo I",
      "Sudirejo I",
      "Sudirejo II",
      "Teladan Barat",
      "Teladan Timur",
    ],
  },
  {
    kecamatan: "Medan Labuhan",
    kantahCodes: ["11"],
    kelurahan: [
      "Besar",
      "Martubung",
      "Nelayan Indah",
      "Pekan Labuhan",
      "Sei Mati",
      "Tangkahan",
    ],
  },
  {
    kecamatan: "Medan Maimun",
    kantahCodes: ["12"],
    kelurahan: [
      "Aur",
      "Hamdan",
      "Jati",
      "Kampung Baru",
      "Sei Mati",
      "Sukaraja",
    ],
  },
  {
    kecamatan: "Medan Marelan",
    kantahCodes: ["13"],
    kelurahan: [
      "Labuhan Deli",
      "Paya Pasir",
      "Rengas Pulau",
      "Tanah Enam Ratus",
      "Terjun",
    ],
  },
  {
    kecamatan: "Medan Perjuangan",
    kantahCodes: ["14"],
    kelurahan: [
      "Pahlawan",
      "Pandau Hilir",
      "Sei Kera Hilir I",
      "Sei Kera Hilir II",
      "Sei Kera Hulu",
      "Sidorame Barat I",
      "Sidorame Barat II",
      "Sidorame Timur",
      "Tegal Rejo",
    ],
  },
  {
    kecamatan: "Medan Petisah",
    kantahCodes: ["15"],
    kelurahan: [
      "Petisah Tengah",
      "Sei Putih Barat",
      "Sei Putih Tengah",
      "Sei Putih Timur I",
      "Sei Putih Timur II",
      "Sei Sikambing D",
      "Sekip",
    ],
  },
  {
    kecamatan: "Medan Polonia",
    kantahCodes: ["16"],
    kelurahan: [
      "Anggrung",
      "Madras Hulu",
      "Polonia",
      "Sari Rejo",
      "Suka Damai",
    ],
  },
  {
    kecamatan: "Medan Selayang",
    kantahCodes: ["10", "17"],
    kelurahan: [
      "Asam Kumbang",
      "Beringin",
      "Padang Bulan Selayang I",
      "Padang Bulan Selayang II",
      "Sempakata",
      "Tanjung Sari",
    ],
  },
  {
    kecamatan: "Medan Sunggal",
    kantahCodes: ["18"],
    kelurahan: [
      "Babura",
      "Lalang",
      "Sei Sikambing B",
      "Simpang Tanjung",
      "Sunggal",
      "Tanjung Rejo",
    ],
  },
  {
    kecamatan: "Medan Tembung",
    kantahCodes: ["19"],
    kelurahan: [
      "Bandar Selamat",
      "Bantan",
      "Bantan Timur",
      "Indra Kasih",
      "Sidorejo",
      "Sidorejo Hilir",
      "Tembung",
    ],
  },
  {
    kecamatan: "Medan Timur",
    kantahCodes: ["20"],
    kelurahan: [
      "Durian",
      "Gaharu",
      "Gang Buntu",
      "Glugur Darat I",
      "Glugur Darat II",
      "Perintis",
      "Pulo Brayan Bengkel",
      "Pulo Brayan Bengkel Baru",
      "Pulo Brayan Darat I",
      "Pulo Brayan Darat II",
      "Sidodadi",
    ],
  },
  {
    kecamatan: "Medan Tuntungan",
    kantahCodes: ["21"],
    kelurahan: [
      "Baru Ladang Bambu",
      "Kemenangan Tani",
      "Lau Cih",
      "Mangga",
      "Namo Gajah",
      "Sidomulyo",
      "Simalingkar B",
      "Simpang Selayang",
      "Tanjung Selamat",
    ],
  },
  {
    kecamatan: "Percut Sei Tuan",
    kelurahan: [
      "Amplas",
      "Bandar Khalipah",
      "Bandar Klippa",
      "Bandar Setia",
      "Cinta Damai",
      "Cinta Rakyat",
      "Kenangan",
      "Kenangan Baru",
      "Laut Dendang",
      "Medan Estate",
      "Pematang Lalang",
      "Percut",
      "Saentis",
      "Sampali",
      "Sei Rotan",
      "Sumber Rejo Timur",
      "Tanjung Rejo",
      "Tanjung Selamat",
      "Tembung",
    ],
  },
  {
    kecamatan: "Sunggal",
    kelurahan: [
      "Helvetia",
      "Kampung Lalang",
      "Mulia Sari",
      "Paya Geli",
      "Puji Mulyo",
      "Purwodadi",
      "Sei Beras Sekata",
      "Sei Mencirim",
      "Sei Semayang",
      "Serba Jadi",
      "Sumber Melati Diski",
      "Sunggal Kanan",
      "Tanjung Gusta",
      "Tanjung Selamat",
      "Telaga Sari",
    ],
  },
  {
    kecamatan: "Deli Tua",
    kelurahan: [
      "Deli Tua",
      "Deli Tua Barat",
      "Deli Tua Timur",
      "Kedai Durian",
      "Mekar Sari",
      "Suka Makmur",
    ],
  },
  {
    kecamatan: "Patumbak",
    kelurahan: [
      "Lantasan Baru",
      "Lantasan Lama",
      "Marindal I",
      "Marindal II",
      "Patumbak I",
      "Patumbak II",
      "Patumbak Kampung",
      "Sigara-gara",
    ],
  },
] as const;

const CUSTOM_WILAYAH_KEY = "su_scanner_custom_wilayah_v1";

/**
 * Normalizes OCR character confusions and historical Indonesian orthography (tj->c, dj->j, oe->u)
 * solely for fuzzy region comparison while retaining official Roman-numeral capitalization on output.
 */
function normalizeForFuzzyMatch(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^(?:kecamatan|ketjamatan|kec\.?|ketj\.?|kelurahan|kel\.?|desa|ds\.?|kampung|kp\.?)\s*[:.\-]?\s*/i, "")
    .replace(/rn/g, "m")
    .replace(/cl/g, "d")
    .replace(/tj/g, "c")
    .replace(/dj/g, "j")
    .replace(/oe/g, "u")
    .replace(/0/g, "o")
    .replace(/[1|]/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/[69]/g, "g")
    .replace(/8/g, "b")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + cost);
      }
    }
  }
  return dp[m][n];
}

function similarityScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  const dist = damerauLevenshtein(a, b);
  return Math.max(0, 1 - dist / maxLen);
}

export function loadCustomWilayahEntries(): KecamatanWilayahEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_WILAYAH_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is KecamatanWilayahEntry =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as KecamatanWilayahEntry).kecamatan === "string" &&
        Array.isArray((item as KecamatanWilayahEntry).kelurahan),
    );
  } catch {
    return [];
  }
}

export function saveCustomWilayahEntries(
  entries: KecamatanWilayahEntry[],
): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CUSTOM_WILAYAH_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage quota errors
  }
}

export function getAllWilayahEntries(): KecamatanWilayahEntry[] {
  const custom = loadCustomWilayahEntries();
  if (custom.length === 0) return [...MASTER_WILAYAH_ENTRIES];
  const merged = new Map<string, KecamatanWilayahEntry>();
  for (const e of MASTER_WILAYAH_ENTRIES) {
    merged.set(e.kecamatan.toLowerCase(), e);
  }
  for (const c of custom) {
    const key = c.kecamatan.trim().toLowerCase();
    const existing = merged.get(key);
    if (existing) {
      merged.set(key, {
        kecamatan: existing.kecamatan,
        kantahCodes: c.kantahCodes ?? existing.kantahCodes,
        kelurahan: Array.from(new Set([...existing.kelurahan, ...c.kelurahan])),
      });
    } else if (c.kecamatan.trim()) {
      merged.set(key, {
        kecamatan: c.kecamatan.trim(),
        kantahCodes: c.kantahCodes,
        kelurahan: Array.from(new Set(c.kelurahan.map((k) => k.trim()).filter(Boolean))),
      });
    }
  }
  return Array.from(merged.values());
}

export function getKecamatanOptions(): string[] {
  return getAllWilayahEntries().map((e) => e.kecamatan);
}

export function getKelurahanOptions(kecamatanHint?: string): string[] {
  const entries = getAllWilayahEntries();
  if (kecamatanHint?.trim()) {
    const matched = matchWilayahKecamatan(kecamatanHint);
    const target = entries.find(
      (e) =>
        e.kecamatan.toLowerCase() ===
        (matched.matched || kecamatanHint.trim()).toLowerCase(),
    );
    if (target) return [...target.kelurahan];
  }
  return Array.from(
    new Set(entries.flatMap((e) => [...e.kelurahan])),
  ).sort((a, b) => a.localeCompare(b, "id"));
}

export interface WilayahMatchResult {
  matched: string | null;
  corrected: boolean;
  similarity: number;
}

export function matchWilayahKecamatan(raw: string): WilayahMatchResult {
  const cleanQuery = normalizeForFuzzyMatch(raw);
  if (!cleanQuery || cleanQuery.length < 3) {
    return { matched: null, corrected: false, similarity: 0 };
  }

  const entries = getAllWilayahEntries();
  let bestName: string | null = null;
  let bestScore = 0;

  for (const entry of entries) {
    const normEntry = normalizeForFuzzyMatch(entry.kecamatan);
    const score = similarityScore(cleanQuery, normEntry);
    if (score > bestScore) {
      bestScore = score;
      bestName = entry.kecamatan;
    }
    // Check shorthand without "Medan " prefix if query omits it (e.g. "Helvetia")
    const shortEntry = normEntry.replace(/^medan\s+/, "");
    if (shortEntry !== normEntry && cleanQuery === shortEntry) {
      return { matched: entry.kecamatan, corrected: true, similarity: 0.96 };
    }
  }

  if (bestName && bestScore >= 0.78) {
    const changed =
      bestName.trim().toLowerCase() !== raw.trim().toLowerCase();
    return { matched: bestName, corrected: changed, similarity: bestScore };
  }

  return { matched: null, corrected: false, similarity: bestScore };
}

export function matchWilayahKelurahan(
  raw: string,
  kecamatanHint?: string,
): WilayahMatchResult {
  const cleanQuery = normalizeForFuzzyMatch(raw);
  if (!cleanQuery || cleanQuery.length < 2) {
    return { matched: null, corrected: false, similarity: 0 };
  }

  const entries = getAllWilayahEntries();
  const scopedEntries = kecamatanHint?.trim()
    ? entries.filter((e) => {
        const matchedKec = matchWilayahKecamatan(kecamatanHint).matched;
        return (
          e.kecamatan.toLowerCase() ===
          (matchedKec || kecamatanHint.trim()).toLowerCase()
        );
      })
    : entries;

  const candidatePool =
    scopedEntries.length > 0
      ? Array.from(new Set(scopedEntries.flatMap((e) => [...e.kelurahan])))
      : Array.from(new Set(entries.flatMap((e) => [...e.kelurahan])));

  let bestName: string | null = null;
  let bestScore = 0;

  for (const cand of candidatePool) {
    const normCand = normalizeForFuzzyMatch(cand);
    const score = similarityScore(cleanQuery, normCand);
    if (score > bestScore) {
      bestScore = score;
      bestName = cand;
    }
  }

  if (bestName && bestScore >= 0.78) {
    const changed =
      bestName.trim().toLowerCase() !== raw.trim().toLowerCase();
    return { matched: bestName, corrected: changed, similarity: bestScore };
  }

  return { matched: null, corrected: false, similarity: bestScore };
}

export interface LearnedWilayahCodeMapping {
  prefix8: string;
  kecPrefix6: string;
  kecamatan: string;
  kelurahan: string;
  confirmedCount: number;
}

export interface HakRegionCrossCheckResult {
  hasPrefix8: boolean;
  prefix8: string | null;
  provCode: string | null;
  kabCode: string | null;
  kecCode: string | null;
  kelCode: string | null;
  status: "match" | "mismatch" | "unverified" | "none";
  message: string | null;
  suggestedKecamatan?: string;
  suggestedKelurahan?: string;
}

/**
 * Extracts and cross-validates the 8-digit administrative region prefix (PP.KK.KKC.KLR)
 * embedded inside 14-digit BPN Nomor Hak (PP.KK.KKC.KLR.H.NNNNN) against Kecamatan & Kelurahan.
 */
export function validateHakRegionCrossCheck(params: {
  rawNomorHak: string | null | undefined;
  kecamatan: string;
  kelurahan: string;
  learnedCodes?: readonly LearnedWilayahCodeMapping[];
}): HakRegionCrossCheckResult {
  const digits = String(params.rawNomorHak || "").replace(/\D/g, "");
  if (digits.length !== 14) {
    return {
      hasPrefix8: false,
      prefix8: null,
      provCode: null,
      kabCode: null,
      kecCode: null,
      kelCode: null,
      status: "none",
      message: null,
    };
  }

  const provCode = digits.slice(0, 2);
  const kabCode = digits.slice(2, 4);
  const kecCode = digits.slice(4, 6);
  const kelCode = digits.slice(6, 8);
  const prefix8 = `${provCode}.${kabCode}.${kecCode}.${kelCode}`;
  const kecPrefix6 = `${provCode}.${kabCode}.${kecCode}`;

  const kecTrim = params.kecamatan.trim();
  const kelTrim = params.kelurahan.trim();

  // 1. Check exact learned Kantah 8-digit prefix mapping first
  const exactLearned = params.learnedCodes?.find((c) => c.prefix8 === prefix8);
  if (exactLearned) {
    const kecMatch =
      !kecTrim ||
      normalizeForFuzzyMatch(kecTrim) ===
        normalizeForFuzzyMatch(exactLearned.kecamatan);
    const kelMatch =
      !kelTrim ||
      !exactLearned.kelurahan ||
      normalizeForFuzzyMatch(kelTrim) ===
        normalizeForFuzzyMatch(exactLearned.kelurahan);

    if (kecMatch && kelMatch) {
      return {
        hasPrefix8: true,
        prefix8,
        provCode,
        kabCode,
        kecCode,
        kelCode,
        status: "match",
        message: `Kode wilayah ${prefix8} cocok dengan ${exactLearned.kecamatan}${exactLearned.kelurahan ? ` / ${exactLearned.kelurahan}` : ""}.`,
      };
    }

    return {
      hasPrefix8: true,
      prefix8,
      provCode,
      kabCode,
      kecCode,
      kelCode,
      status: "mismatch",
      suggestedKecamatan: exactLearned.kecamatan,
      suggestedKelurahan: exactLearned.kelurahan || undefined,
      message: `Peringatan silang: Kode ${prefix8} pada Nomor Hak tercatat untuk ${exactLearned.kecamatan}${exactLearned.kelurahan ? ` / ${exactLearned.kelurahan}` : ""}, berbeda dengan isian "${kecTrim || "-"}${kelTrim ? ` / ${kelTrim}` : ""}".`,
    };
  }

  // 2. Check Kecamatan 6-digit prefix against learned rules
  const kecPrefixMatch = params.learnedCodes?.find(
    (c) => c.kecPrefix6 === kecPrefix6,
  );
  if (
    kecPrefixMatch &&
    kecTrim &&
    normalizeForFuzzyMatch(kecTrim) !==
      normalizeForFuzzyMatch(kecPrefixMatch.kecamatan)
  ) {
    return {
      hasPrefix8: true,
      prefix8,
      provCode,
      kabCode,
      kecCode,
      kelCode,
      status: "mismatch",
      suggestedKecamatan: kecPrefixMatch.kecamatan,
      message: `Kode Kecamatan ${kecPrefix6} biasa digunakan oleh ${kecPrefixMatch.kecamatan}, bukan "${kecTrim}". Periksa apakah angka atau folder tertukar.`,
    };
  }

  // 3. Regional province/city sanity check for North Sumatra / Kota Medan (02.01)
  const matchedKecEntry = kecTrim
    ? getAllWilayahEntries().find(
        (e) =>
          normalizeForFuzzyMatch(e.kecamatan) ===
          normalizeForFuzzyMatch(kecTrim),
      )
    : undefined;

  if (matchedKecEntry?.kecamatan.startsWith("Medan ") && `${provCode}.${kabCode}` !== "02.01") {
    return {
      hasPrefix8: true,
      prefix8,
      provCode,
      kabCode,
      kecCode,
      kelCode,
      status: "mismatch",
      message: `Prefiks Nomor Hak "${provCode}.${kabCode}" bukan kode Kota Medan (02.01), padahal Kecamatan tertulis ${matchedKecEntry.kecamatan}. Periksa digit awal Nomor Hak.`,
    };
  }

  if (matchedKecEntry) {
    if (
      `${provCode}.${kabCode}` === "02.01" &&
      matchedKecEntry.kantahCodes &&
      matchedKecEntry.kantahCodes.length > 0 &&
      !matchedKecEntry.kantahCodes.includes(kecCode)
    ) {
      const kelOwner = kelTrim
        ? findKecamatanByKelurahanAndCode(kelTrim, kecCode)
        : null;
      if (kelOwner && kelOwner.kecamatan !== matchedKecEntry.kecamatan) {
        return {
          hasPrefix8: true,
          prefix8,
          provCode,
          kabCode,
          kecCode,
          kelCode,
          status: "mismatch",
          suggestedKecamatan: kelOwner.kecamatan,
          suggestedKelurahan: kelTrim || undefined,
          message: `Peringatan silang: Kode kecamatan ${kecCode} pada Nomor Hak (${prefix8}) & Kelurahan "${kelTrim}" mengarah ke ${kelOwner.kecamatan}, bukan "${matchedKecEntry.kecamatan}".`,
        };
      }
    }

    return {
      hasPrefix8: true,
      prefix8,
      provCode,
      kabCode,
      kecCode,
      kelCode,
      status: `${provCode}.${kabCode}` === "02.01" ? "match" : "unverified",
      message:
        `${provCode}.${kabCode}` === "02.01"
          ? `Kode wilayah ${prefix8} (Sumut / Kota Medan · Kec ${kecCode} Kel ${kelCode}) konsisten dengan ${matchedKecEntry.kecamatan}.`
          : `Kode wilayah terbaca ${prefix8} (belum dipetakan ke kamus lokal).`,
    };
  }

  return {
    hasPrefix8: true,
    prefix8,
    provCode,
    kabCode,
    kecCode,
    kelCode,
    status: "unverified",
    message: `Kode wilayah Nomor Hak: ${prefix8} (Prov ${provCode}, Kab/Kota ${kabCode}, Kec ${kecCode}, Kel ${kelCode}).`,
  };
}

/**
 * Finds the matching Kecamatan in MASTER_WILAYAH_ENTRIES that owns `kelurahanName`
 * (optionally disambiguating with a 2-digit Kantah kecamatan code).
 */
export function findKecamatanByKelurahanAndCode(
  kelurahanName: string,
  kantahKecCode?: string | null,
): { kecamatan: string; kelurahan: string; uniqueOwner: boolean } | null {
  const cleanKel = normalizeForFuzzyMatch(kelurahanName);
  if (!cleanKel || cleanKel.length < 3) return null;

  const owners: Array<{ entry: KecamatanWilayahEntry; kel: string }> = [];
  for (const entry of getAllWilayahEntries()) {
    for (const k of entry.kelurahan) {
      if (normalizeForFuzzyMatch(k) === cleanKel) {
        owners.push({ entry, kel: k });
        break;
      }
    }
  }
  if (owners.length === 0) return null;

  if (kantahKecCode) {
    const codeMatch = owners.find((o) =>
      o.entry.kantahCodes?.includes(kantahKecCode),
    );
    if (codeMatch) {
      return {
        kecamatan: codeMatch.entry.kecamatan,
        kelurahan: codeMatch.kel,
        uniqueOwner: owners.length === 1,
      };
    }
  }

  return {
    kecamatan: owners[0].entry.kecamatan,
    kelurahan: owners[0].kel,
    uniqueOwner: owners.length === 1,
  };
}
