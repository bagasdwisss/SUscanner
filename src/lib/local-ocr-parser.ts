import {
  MIN_VALID_SU_YEAR,
  mapHakCode,
  normalizeKecamatanName,
  normalizeKelurahanName,
  parseNomorHakEvidence,
} from "./su-formatter.ts";
import type { AiExtractionResult, StandardHakCode } from "./su-types.ts";

const NOISE_SU_LINE_RE =
  /\b(d\.?\s*i\.?\s*30\d|daftar\s+isian|peta\s+bidang|gambar\s+ukur|n\.?\s*i\.?\s*p\.?|nrp|skala|luas\s+tanah|tanggal|tgl\.?|ditanda|kepala\s+kantor|kutipan|terdaftar|penunjuk|lembaran|berlaku)\b/i;

const KECAMATAN_LABEL_RE =
  /(?:kec[ae](?:m|rn)[ae][tl][ae][nm]|ketj[ae](?:m|rn)[ae][tl][ae][nm]|(?:k[eo]c|ketj)\.?(?![a-z]))\s*[:.\-]?\s*(.+)$/i;

const KELURAHAN_LABEL_RE =
  /(?:kel[uw]r[ae][hb][ae][nm]|ke[il][uw]r[ae][hb][ae][nm]|d[eo]s[ae](?![a-z])|kampung|gampong|nagari|(?:k[eo]l|ds|kp)\.?(?![a-z]))\s*[:.\-]?\s*(.+)$/i;

const NIP_18_RE = /\b(?:19|20)\d{6}[\s.\-]?\d{6}[\s.\-]?\d[\s.\-]?\d{3}\b/g;

function repairNumericToken(raw: string): string {
  return raw
    .replace(/[OoQD]/g, "0")
    .replace(/[Il|!\]]/g, "1")
    .replace(/Z/g, "2")
    .replace(/[S$§]/g, "5")
    .replace(/G/g, "6")
    .replace(/B/g, "8")
    .replace(/\D/g, "");
}

function parseSuYearToken(rawTok: string, allowTwoDigitLegacy: boolean): string | null {
  const digits = repairNumericToken(rawTok);
  const maxYear = new Date().getFullYear() + 1;
  if (digits.length === 4) {
    const num = Number(digits);
    if (num >= MIN_VALID_SU_YEAR && num <= maxYear) {
      return digits;
    }
    return null;
  }
  if (allowTwoDigitLegacy && digits.length === 2) {
    const yy = Number(digits);
    if (yy >= 60 && yy <= 99) {
      return `19${digits}`;
    }
  }
  return null;
}

function cleanRegionSegment(rawSegment: string): string {
  return rawSegment
    .split(
      /\s*(?:\||,|;|\/|\s{3,}|\bkec[ae]m|\bketj|\bkec\.|\bkel[uw]r|\bkel\.|\bdesa\b|\bds\.|\bkabupaten\b|\bkotamadya\b|\bkota\b|\bpropinsi\b|\bprovinsi\b|\bluas\b|\brt\.?\b|\brw\.?\b)/i,
    )[0]
    .replace(/^[:.\-_]+/, "")
    .replace(/[:.\-_0-9]+$/, "")
    .trim();
}

function extractKecamatanFromText(rawText: string): {
  kecamatan: string | null;
  evidence: string | null;
} {
  const lines = rawText.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Never confuse Kota / Kotamadya / Kabupaten / Propinsi with Kecamatan
    if (/^\s*(?:kota(?:madya)?|kabupaten|propinsi|provinsi)\b/i.test(line) && !/kec|ketj/i.test(line)) {
      continue;
    }

    const match = line.match(KECAMATAN_LABEL_RE);
    if (!match) continue;

    const segment = cleanRegionSegment(match[1]);
    if (!segment || segment.length < 3 || /^\d+$/.test(segment)) continue;
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

function extractKelurahanFromText(
  rawText: string,
  suMiddleKelurahan: string | null,
): string | null {
  const lines = rawText.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(KELURAHAN_LABEL_RE);
    if (!match) continue;

    const segment = cleanRegionSegment(match[1]);
    if (!segment || segment.length < 3 || /^\d+$/.test(segment)) continue;
    const normalized = normalizeKelurahanName(segment);
    if (normalized) return normalized;
  }

  return suMiddleKelurahan ? normalizeKelurahanName(suMiddleKelurahan) || null : null;
}

interface SuCandidate {
  nomorSu: string;
  tahunSu: string;
  kelurahanFromSu: string | null;
  evidence: string;
  score: number;
}

function extractSuNumberAndYear(rawText: string): {
  nomorSu: string | null;
  tahunSu: string | null;
  kelurahanFromSu: string | null;
  evidence: string | null;
  confidenceBonus: number;
} {
  const lines = rawText.split(/\r?\n/).map((l) => l.trim());
  const numTok = "([0-9OoQDIl|!]{1,5})";
  const year4Tok = "((?:19|20|1[9O]|2[0O])[0-9OoQDIl|!]{2})";
  const sepTok = "[\\/|\\\\\\-]";

  let suHeaderIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/\b(?:SURAT\s+UK[UV]R|SURA[TF]\s+UKUR|GAMBAR\s+SITUASI)\b/i.test(lines[i])) {
      suHeaderIdx = i;
      break;
    }
  }

  const candidates: SuCandidate[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const nearHeader = suHeaderIdx >= 0 && Math.abs(i - suHeaderIdx) <= 4;
    const isNoise = NOISE_SU_LINE_RE.test(line) && !/surat\s+ukur|gambar\s+situasi/i.test(line);
    if (isNoise) continue;

    const headerBoost = nearHeader ? 20 : 0;

    // Candidate 1: Labeled "Nomor: 06/Helvetia Timur/2007" (tolerates OCR slash as | or - or \)
    const labeledModern = line.match(
      new RegExp(
        `(?:nomor|nornor|nomer|no\\.?)\\s*[:.\\-]?\\s*${numTok}\\s*${sepTok}\\s*([A-Za-z][A-Za-z0-9\\s.'-]{1,42}?)\\s*${sepTok}\\s*${year4Tok}\\b`,
        "i",
      ),
    );
    if (labeledModern) {
      const no = repairNumericToken(labeledModern[1]);
      const yr = parseSuYearToken(labeledModern[3], false);
      const mid = cleanRegionSegment(labeledModern[2]);
      if (no && yr && /[A-Za-z]{2,}/.test(mid)) {
        candidates.push({
          nomorSu: no,
          tahunSu: yr,
          kelurahanFromSu: mid,
          evidence: `${labeledModern[1]}/${mid}/${yr}`,
          score: 100 + headerBoost,
        });
        continue;
      }
    }

    // Candidate 2: Unlabeled modern "06/Helvetia Timur/2007"
    const plainModern = line.match(
      new RegExp(
        `\\b${numTok}\\s*${sepTok}\\s*([A-Za-z][A-Za-z\\s.'-]{2,36}?)\\s*${sepTok}\\s*${year4Tok}\\b`,
      ),
    );
    if (plainModern) {
      const no = repairNumericToken(plainModern[1]);
      const yr = parseSuYearToken(plainModern[3], false);
      const mid = cleanRegionSegment(plainModern[2]);
      if (no && yr && /[A-Za-z]{2,}/.test(mid)) {
        candidates.push({
          nomorSu: no,
          tahunSu: yr,
          kelurahanFromSu: mid,
          evidence: `${plainModern[1]}/${mid}/${yr}`,
          score: 86 + headerBoost,
        });
        continue;
      }
    }

    // Candidate 3: Legacy 1960s–1990s labeled "Nomor : 12 / 1964", "No. 45 tahun 1962", or "No. 12/64" near header
    const labeledLegacy = line.match(
      new RegExp(
        `(?:nomor|nornor|no\\.?|surat\\s+ukur\\s+no\\.?)\\s*[:.\\-]?\\s*${numTok}\\s*(?:${sepTok}|\\btahun\\b|\\bthn\\.?\\b|\\bth\\.?\\b)\\s*([0-9OoQDIl|!]{2,4})\\b`,
        "i",
      ),
    );
    if (labeledLegacy) {
      const no = repairNumericToken(labeledLegacy[1]);
      const yr = parseSuYearToken(labeledLegacy[2], nearHeader);
      if (no && yr && no.length <= 5) {
        candidates.push({
          nomorSu: no,
          tahunSu: yr,
          kelurahanFromSu: null,
          evidence: labeledLegacy[0].trim(),
          score: 82 + headerBoost,
        });
        continue;
      }
    }

    // Candidate 4: Bare "12 / 1964" ONLY when near "SURAT UKUR" / "GAMBAR SITUASI" header (prevents date/DI false matches)
    if (nearHeader) {
      const nearHeaderSlash = line.match(
        new RegExp(`\\b${numTok}\\s*\\/\\s*${year4Tok}\\b`),
      );
      if (nearHeaderSlash) {
        const no = repairNumericToken(nearHeaderSlash[1]);
        const yr = parseSuYearToken(nearHeaderSlash[2], false);
        if (no && yr) {
          candidates.push({
            nomorSu: no,
            tahunSu: yr,
            kelurahanFromSu: null,
            evidence: nearHeaderSlash[0].trim(),
            score: 72 + headerBoost,
          });
        }
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (best) {
    return {
      nomorSu: best.nomorSu,
      tahunSu: best.tahunSu,
      kelurahanFromSu: best.kelurahanFromSu,
      evidence: best.evidence,
      confidenceBonus: best.score >= 100 ? 0.1 : 0,
    };
  }

  return {
    nomorSu: null,
    tahunSu: null,
    kelurahanFromSu: null,
    evidence: null,
    confidenceBonus: 0,
  };
}

function extractHakAndNib(rawText: string): {
  kodeAngka: string | null;
  kodeHuruf: StandardHakCode | null;
  nomorHak: string | null;
  nib: string | null;
  evidence: string | null;
  explicitContext: boolean;
} {
  // Mask out 18-digit NIPs and explicit NIP lines so they are never misread as 14-digit Nomor Hak
  const scrubbedLines = rawText
    .split(/\r?\n/)
    .map((line) => {
      if (/\b(?:n\.?\s*i\.?\s*p\.?|nrp)\b/i.test(line)) return "";
      return line.replace(NIP_18_RE, " ");
    });

  let detectedNib: string | null = null;
  const nibMatch = rawText.match(
    /\bN\.?\s*I\.?\s*B\.?\s*[:.\-]?\s*((?:[0-9OoQDIl|!][\s.\-·_,:;]*){13})\b/i,
  );
  if (nibMatch) {
    const digits = repairNumericToken(nibMatch[1]);
    if (digits.length === 13) {
      detectedNib = nibMatch[1].trim();
    }
  }

  // Scored 14-digit Nomor Hak candidates (strict 2.2.2.2.1.5 grouped or contiguous)
  let best14: {
    score: number;
    kodeAngka: string;
    kodeHuruf: StandardHakCode;
    nomorHak: string;
    evidence: string;
  } | null = null;

  for (let i = 0; i < scrubbedLines.length; i++) {
    const line = scrubbedLines[i].trim();
    if (!line || NOISE_SU_LINE_RE.test(line)) continue;

    const hasHakKeyword = /\b(?:hak|milik|guna|pakai|pengelolaan|wakaf|hm|hgb|hgu|hp|hpl|penunjuk)\b/i.test(line);
    const hasNibKeyword = /\bnib\b/i.test(line);
    if (hasNibKeyword && !hasHakKeyword) continue;

    const cands = line.matchAll(
      /(?:[0-9OoQDIl|!][\s.\-·_,:;]{0,2}){13}[0-9OoQDIl|!]/g,
    );
    for (const m of cands) {
      const rawSeg = m[0].trim();
      const digits = repairNumericToken(rawSeg);
      if (digits.length === 14) {
        const parsed = parseNomorHakEvidence(digits);
        if (parsed.kind === "nomor_hak_14" && parsed.kodeHak && parsed.nomorHak5) {
          const score =
            70 +
            (hasHakKeyword ? 25 : 0) +
            (i <= Math.floor(scrubbedLines.length * 0.45) ? 10 : 0);
          if (!best14 || score > best14.score) {
            best14 = {
              score,
              kodeAngka: digits[8] ?? "",
              kodeHuruf: parsed.kodeHak,
              nomorHak: parsed.nomorHak5,
              evidence: rawSeg,
            };
          }
        }
      } else if (digits.length === 13 && !detectedNib) {
        detectedNib = rawSeg;
      }
    }
  }

  if (best14) {
    return {
      kodeAngka: best14.kodeAngka,
      kodeHuruf: best14.kodeHuruf,
      nomorHak: best14.nomorHak,
      nib: detectedNib,
      evidence: best14.evidence,
      explicitContext: best14.score >= 85,
    };
  }

  // Legacy short & dotted formats: "H.M. 145", "HM. 2246", "H.G.B. 105", "Hak Milik No. 145"
  for (const rawLine of scrubbedLines) {
    const line = rawLine.trim();
    if (!line || NOISE_SU_LINE_RE.test(line)) continue;

    const legacyHakMatch = line.match(
      /\b(HAK\s+MILIK|HAK\s+GUNA\s+USAHA|HAK\s+GUNA\s+BANGUNAN|HAK\s+PAKAI|HAK\s+PENGELOLAAN|H\.?\s*G\.?\s*B\.?|H\.?\s*G\.?\s*U\.?|H\.?\s*P\.?\s*L\.?|H\.?\s*M\.?|H\.?\s*P\.?|WAKAF)\b[\s.\-:/]*(?:(?:NO|NOMOR)\.?\s*)?([0-9OoQDIl|!]{1,5})\b/i,
    );
    if (legacyHakMatch) {
      const code = mapHakCode(legacyHakMatch[1]);
      const no = repairNumericToken(legacyHakMatch[2]);
      if (code && no) {
        return {
          kodeAngka: null,
          kodeHuruf: code,
          nomorHak: no,
          nib: detectedNib,
          evidence: legacyHakMatch[0].trim(),
          explicitContext: true,
        };
      }
    }
  }

  return {
    kodeAngka: null,
    kodeHuruf: null,
    nomorHak: null,
    nib: detectedNib,
    evidence: detectedNib,
    explicitContext: false,
  };
}

/**
 * Deterministic scored ATR/BPN Surat Ukur text parser used by the built-in
 * offline OCR engine (`tesseract.js`).
 */
export function parseSuratUkurOcrText(
  rawText: string,
  ocrMeanConfidence = 75,
): AiExtractionResult {
  const normalizedConfidence = Math.max(
    0.45,
    Math.min(0.88, ocrMeanConfidence / 100),
  );
  const su = extractSuNumberAndYear(rawText);
  const hak = extractHakAndNib(rawText);
  const kec = extractKecamatanFromText(rawText);
  const kelurahan = extractKelurahanFromText(rawText, su.kelurahanFromSu);

  const hasSuHeader = /\b(?:SURAT\s+UK[UV]R|SURA[TF]\s+UKUR|GAMBAR\s+SITUASI)\b/i.test(
    rawText,
  );
  const hasOnlyMapWords =
    /\bPETA\s+BIDANG\b/i.test(rawText) &&
    !hasSuHeader &&
    !su.nomorSu &&
    !hak.nomorHak;

  const isDataSu =
    !hasOnlyMapWords && Boolean(hasSuHeader || su.nomorSu || hak.nomorHak);

  const suScore = su.nomorSu
    ? Math.min(0.92, normalizedConfidence + su.confidenceBonus)
    : 0;
  const hakScore = hak.nomorHak
    ? Math.min(0.92, normalizedConfidence + (hak.explicitContext ? 0.08 : 0))
    : 0;

  return {
    is_halaman_data_su: isDataSu,
    nomor_su_raw: su.nomorSu || null,
    tahun_su: su.tahunSu || null,
    kode_jenis_hak_angka: hak.kodeAngka,
    kode_jenis_hak_huruf: hak.kodeHuruf,
    nomor_hak_raw: hak.nomorHak || null,
    kecamatan_raw: kec.kecamatan,
    kelurahan_raw: kelurahan,
    nib_terdeteksi: hak.nib,
    raw_evidence: {
      teks_nomor_su: su.evidence,
      teks_nomor_hak: hak.evidence,
      teks_lokasi: kec.evidence,
    },
    confidence: {
      nomor_su: suScore,
      tahun_su: su.tahunSu ? suScore : 0,
      jenis_hak: hak.kodeHuruf ? Math.min(0.9, hakScore || normalizedConfidence) : 0,
      nomor_hak: hakScore,
      kecamatan: kec.kecamatan ? Math.min(0.86, normalizedConfidence) : 0,
      kelurahan: kelurahan ? Math.min(0.84, normalizedConfidence) : 0,
    },
    catatan_peringatan:
      "Diekstrak oleh OCR Lokal terstruktur (header + validasi pola). Harap verifikasi ulang sebelum ekspor.",
  };
}

/**
 * Merges Header-ROI pass and optional Full-Sheet pass cleanly so clean header
 * fields win over noisy map diagram text while missing fields are recovered.
 */
export function mergeMultiPassOcrResults(
  headerPass: { result: AiExtractionResult; meanConfidence: number },
  fullPass?: { result: AiExtractionResult; meanConfidence: number } | null,
): { extraction: AiExtractionResult; meanConfidence: number } {
  if (!fullPass) {
    return {
      extraction: headerPass.result,
      meanConfidence: headerPass.meanConfidence,
    };
  }

  const h = headerPass.result;
  const f = fullPass.result;

  const pick = <T>(primary: T | null, secondary: T | null): T | null =>
    primary !== null && primary !== undefined && primary !== ""
      ? primary
      : secondary;

  const merged: AiExtractionResult = {
    is_halaman_data_su: h.is_halaman_data_su || f.is_halaman_data_su,
    nomor_su_raw: pick(h.nomor_su_raw, f.nomor_su_raw),
    tahun_su: pick(h.tahun_su, f.tahun_su),
    kode_jenis_hak_angka: pick(h.kode_jenis_hak_angka, f.kode_jenis_hak_angka),
    kode_jenis_hak_huruf: pick(h.kode_jenis_hak_huruf, f.kode_jenis_hak_huruf),
    nomor_hak_raw: pick(h.nomor_hak_raw, f.nomor_hak_raw),
    kecamatan_raw: pick(h.kecamatan_raw, f.kecamatan_raw),
    kelurahan_raw: pick(h.kelurahan_raw, f.kelurahan_raw),
    nib_terdeteksi: pick(h.nib_terdeteksi, f.nib_terdeteksi),
    raw_evidence: {
      teks_nomor_su: pick(h.raw_evidence.teks_nomor_su, f.raw_evidence.teks_nomor_su),
      teks_nomor_hak: pick(h.raw_evidence.teks_nomor_hak, f.raw_evidence.teks_nomor_hak),
      teks_lokasi: pick(h.raw_evidence.teks_lokasi, f.raw_evidence.teks_lokasi),
    },
    confidence: {
      nomor_su: Math.max(h.confidence.nomor_su, f.confidence.nomor_su),
      tahun_su: Math.max(h.confidence.tahun_su, f.confidence.tahun_su),
      jenis_hak: Math.max(h.confidence.jenis_hak, f.confidence.jenis_hak),
      nomor_hak: Math.max(h.confidence.nomor_hak, f.confidence.nomor_hak),
      kecamatan: Math.max(h.confidence.kecamatan, f.confidence.kecamatan),
      kelurahan: Math.max(h.confidence.kelurahan, f.confidence.kelurahan),
    },
    catatan_peringatan: h.catatan_peringatan || f.catatan_peringatan,
  };

  return {
    extraction: merged,
    meanConfidence: Math.max(headerPass.meanConfidence, fullPass.meanConfidence),
  };
}
