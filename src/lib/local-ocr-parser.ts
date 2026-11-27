import {
  MIN_VALID_SU_YEAR,
  mapHakCode,
  normalizeKecamatanName,
  normalizeKelurahanName,
  parseNomorHakEvidence,
} from "./su-formatter.ts";
import {
  matchWilayahKecamatan,
  matchWilayahKelurahan,
} from "./wilayah-dict.ts";
import type { AiExtractionResult, StandardHakCode } from "./su-types.ts";

const NOISE_SU_LINE_RE =
  /\b(d\.?\s*i\.?\s*30\d|daftar\s+isian|peta\s+bidang|gambar\s+ukur|n\.?\s*i\.?\s*p\.?|nrp|skala|luas\s+tanah|tanggal|tgl\.?|ditanda|kepala\s+kantor|kutipan|terdaftar|penunjuk|lembaran|berlaku|telah\s+dialihmediakan|dialihmediakan|berkat\s+cahaya|tangg\.?\s*up|lembar\s*:|nomor\s+pendaftaran|kotak\s*:)\b/i;

const KECAMATAN_LABEL_RE =
  /(?:kec[ae](?:m|rn)[ae][tl][ae][nm]|ketj[ae](?:m|rn)[ae][tl][ae][nm]|(?:k[eo]c|ketj)\.?(?![a-z]))\s*[:.\-]?\s*(.+)$/i;

const KELURAHAN_LABEL_RE =
  /(?:des[ae]\s*\/\s*kel(?:urahan)?|kel[uw]r[ae][hb][ae][nm]\s*\/\s*des[ae]|kel[uw]r[ae][hb][ae][nm]|ke[il][uw]r[ae][hb][ae][nm]|d[eo]s[ae](?![a-z])|kampung|gampong|nagari|(?:k[eo]l|ds|kp)\.?(?![a-z]))\s*[:.\-]?\s*(.+)$/i;

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

/**
 * Repairs OCR digit glyphs inside BPN 13/14-digit grid boxes without turning
 * vertical box walls ('|', '[', ']', '/') into spurious '1' digits.
 */
function repairBoxDigitToken(raw: string): string {
  return raw
    .replace(/[OoQD]/g, "0")
    .replace(/[Il!]/g, "1")
    .replace(/Z/g, "2")
    .replace(/[S$§]/g, "5")
    .replace(/G/g, "6")
    .replace(/B/g, "8")
    .replace(/\D/g, "");
}

function formatGroupedBpnDigits(digits: string): string {
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}.${digits[8]}.${digits.slice(9, 14)}`;
  }
  if (digits.length === 13) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}.${digits.slice(8, 13)}`;
  }
  return digits;
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
  const withoutLeadingPunct = rawSegment.replace(/^[\s:.\-_·•,/]+/, "");
  return withoutLeadingPunct
    .split(
      /\s*(?:\||,|;|\/|\s{3,}|\bkec[ae]m|\bketj|\bkec\.|\bkel[uw]r|\bkel\.|\bdesa\b|\bds\.|\bkabupaten\b|\bkotamadya\b|\bkota\b|\bpropinsi\b|\bprovinsi\b|\bluas\b|\brt\.?\b|\brw\.?\b)/i,
    )[0]
    .replace(/^[\s:.\-_·•,]+/, "")
    .replace(/[\s:.\-_·•,0-9]+$/, "")
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

  if (!suMiddleKelurahan) return null;
  const fallback = normalizeKelurahanName(suMiddleKelurahan);
  if (!fallback) return null;
  const dictMatch = matchWilayahKelurahan(fallback);
  if (dictMatch.matched && dictMatch.similarity >= 0.78) {
    return dictMatch.matched;
  }
  // Reject obvious garbled OCR digits mixed inside fallback SU middle segment (e.g. "Anguk9 3a")
  if (/\d/.test(fallback)) {
    return null;
  }
  return fallback;
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
    const rawLine = lines[i];
    if (!rawLine) continue;
    // Strip full dd/mm/yyyy dates, blank serial codes (AL 014904), and dotted template lines ("Nomor : ..... / 19...")
    const line = rawLine
      .replace(/\b\d{1,2}\s*[\/|\-]\s*\d{1,2}\s*[\/|\-]\s*(?:19|20)\d{2}\b/g, " ")
      .replace(/\b[A-Z]{2}\s*0\d{5}\b/g, " ")
      .replace(/\b(?:nomor|nomer|no\.?)\s*[:.]?\s*[._\- ]*\s*\/\s*19[._\- ]*(?!\d)/gi, " ");

    const nearHeader = suHeaderIdx >= 0 && Math.abs(i - suHeaderIdx) <= 7;
    const hasExplicitSuKeyword = /\b(?:surat\s+ukur|sura[tf]\s+ukur|gambar\s+situasi|no\.?\s*su|nomor\s+su)\b/i.test(
      line,
    );
    const hasExplicitHakOnly =
      /\b(?:no\.?\s*hak|nomor\s+hak|hak\s+milik|hak\s+guna|hak\s+pakai|hak\s+pengelolaan|wakaf|h\.?\s*g\.?\s*b\.?|h\.?\s*g\.?\s*u\.?|h\.?\s*p\.?\s*l\.?|h\.?\s*m\.?|nib)\b/i.test(
        line,
      ) && !hasExplicitSuKeyword;
    const isNoise = NOISE_SU_LINE_RE.test(line) && !hasExplicitSuKeyword;
    if (isNoise) continue;

    const headerBoost = nearHeader ? 20 : 0;

    // Candidate 1: Labeled "Nomor: 616/TANJUNG SARI/1998" -> extracts compact "616/1998" + kelurahan "TANJUNG SARI"
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
          evidence: `${no}/${yr}`,
          score: 100 + headerBoost,
        });
        continue;
      }
    }

    // Candidate 2: Unlabeled 3-part "616/TANJUNG SARI/1998" -> extracts compact "616/1998" + kelurahan "TANJUNG SARI"
    const plainModern = line.match(
      new RegExp(
        `\\b${numTok}\\s*${sepTok}\\s*([A-Za-z][A-Za-z0-9\\s.'-]{1,42}?)\\s*${sepTok}\\s*${year4Tok}\\b`,
      ),
    );
    if (plainModern && !hasExplicitHakOnly) {
      const no = repairNumericToken(plainModern[1]);
      const yr = parseSuYearToken(plainModern[3], false);
      const mid = cleanRegionSegment(plainModern[2]);
      if (no && yr && /[A-Za-z]{2,}/.test(mid) && !/\d{3,}/.test(mid)) {
        candidates.push({
          nomorSu: no,
          tahunSu: yr,
          kelurahanFromSu: mid,
          evidence: `${no}/${yr}`,
          score: 90 + headerBoost,
        });
        continue;
      }
    }

    // Candidate 3: Labeled "Nomor : 00001 / 2009", "No. SU 00001/2009", "No. 45 tahun 1962", or "No. 12/64"
    const labeledLegacy = line.match(
      new RegExp(
        `(?:surat\\s+ukur\\s*(?:no\\.?|nomor)?|no\\.?\\s*su|nomor\\s*su|nomor|nornor|nomer|no\\.?)\\s*[:.\\-]?\\s*${numTok}\\s*(?:${sepTok}|\\btahun\\b|\\bthn\\.?\\b|\\bth\\.?\\b)\\s*([0-9OoQDIl|!]{2,4})\\b`,
        "i",
      ),
    );
    if (labeledLegacy && !hasExplicitHakOnly) {
      const no = repairNumericToken(labeledLegacy[1]);
      const yr = parseSuYearToken(labeledLegacy[2], nearHeader || hasExplicitSuKeyword);
      if (no && yr && no.length <= 5) {
        candidates.push({
          nomorSu: no,
          tahunSu: yr,
          kelurahanFromSu: null,
          evidence: `${no}/${yr}`,
          score: 84 + headerBoost + (no.length === 5 ? 6 : 0),
        });
        continue;
      }
    }

    // Candidate 4: Adjacent NNNNN/YYYY (e.g. "00001/2009" or "00001 | 2009") outside date & Hak-only lines
    if (!hasExplicitHakOnly) {
      const bareSlashYear = line.match(
        new RegExp(`(?:^|[^\\d.\\/])${numTok}\\s*[\\/|\\\\]\\s*${year4Tok}(?![\\d.\\/])`),
      );
      if (bareSlashYear) {
        const no = repairNumericToken(bareSlashYear[1]);
        const yr = parseSuYearToken(bareSlashYear[2], false);
        if (no && yr && no.length <= 5) {
          const looksZeroPaddedSu = no.length >= 4 && /^0/.test(no);
          if (nearHeader || looksZeroPaddedSu || hasExplicitSuKeyword || no.length === 5) {
            candidates.push({
              nomorSu: no,
              tahunSu: yr,
              kelurahanFromSu: null,
              evidence: `${no}/${yr}`,
              score:
                72 +
                headerBoost +
                (hasExplicitSuKeyword ? 14 : 0) +
                (looksZeroPaddedSu ? 12 : 0),
            });
          }
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
  // Mask out 18-digit NIPs, alihmedia stamps, dates, and blank form serials before scanning Hak/NIB
  const scrubbedLines = rawText
    .split(/\r?\n/)
    .map((line) => {
      if (
        /\b(?:n\.?\s*i\.?\s*p\.?|nrp|telah\s+dialihmediakan|dialihmediakan|berkat\s+cahaya|tangg\.?\s*up)\b/i.test(
          line,
        )
      ) {
        return "";
      }
      return line
        .replace(NIP_18_RE, " ")
        .replace(/\b\d{1,2}\s*[\/\-]\s*\d{1,2}\s*[\/\-]\s*(?:19|20)\d{2}\b/g, " ")
        .replace(/\b[A-Z]{2}\s*0\d{5}\b/g, " ");
    });

  let detectedNib: string | null = null;
  const boxSeqRe =
    /(?:^|[^\dA-Za-z])((?:[0-9OoQDIZS$§GBIl!][\s.\-·_,:;|\/\[\]]{0,4}){12,13}[0-9OoQDIZS$§GBIl!])(?![0-9])/g;

  const nibLabeled = scrubbedLines
    .join(" ")
    .match(
      /\b(?:N|M)\s*[I1l|]?\s*B\b[\s.\-:|]*((?:[0-9OoQDIZS$§GBIl!][\s.\-·_,:;|\/\[\]]{0,4}){12}[0-9OoQDIZS$§GBIl!])/i,
    );
  if (nibLabeled) {
    const digits = repairBoxDigitToken(nibLabeled[1]);
    if (digits.length === 13) {
      detectedNib = formatGroupedBpnDigits(digits);
    }
  }

  // Scored 14-digit Nomor Hak candidates (top-left BPN boxes) and unlabelled 13-digit NIBs (below Nomor hak)
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

    const hasHakKeyword = /\b(?:hak|milik|guna|pakai|pengelolaan|wakaf|hm|hgb|hgu|hp|hpl|penunjuk)\b/i.test(
      line,
    );
    const hasNibKeyword = /\b(?:N|M)\s*[I1l|]?\s*B\b/i.test(line);

    const cands = line.matchAll(boxSeqRe);
    for (const m of cands) {
      const rawSeg = m[1].trim();
      if (/[A-Za-z]{3,}/.test(rawSeg)) continue;
      const digits = repairBoxDigitToken(rawSeg);

      if (digits.length === 13) {
        if (!detectedNib) {
          detectedNib = formatGroupedBpnDigits(digits);
        }
        continue;
      }

      if (hasNibKeyword && !hasHakKeyword) continue;

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
              evidence: /[|\[\]]/.test(rawSeg)
                ? formatGroupedBpnDigits(digits)
                : rawSeg,
            };
          }
        }
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

  // Explicit "Nomor Hak : 00246" / "No. Hak : M. 00246" format (separate from SU NNNNN/YYYY)
  let inferredJenisHak: StandardHakCode | null = null;
  for (const rawLine of scrubbedLines) {
    const line = rawLine.trim();
    if (!line || NOISE_SU_LINE_RE.test(line)) continue;
    const typeMatch = line.match(
      /\b(HAK\s+MILIK|HAK\s+GUNA\s+USAHA|HAK\s+GUNA\s+BANGUNAN|HAK\s+PAKAI|HAK\s+PENGELOLAAN|H\.?\s*G\.?\s*B\.?|H\.?\s*G\.?\s*U\.?|H\.?\s*P\.?\s*L\.?|H\.?\s*M\.?|H\.?\s*P\.?|WAKAF)\b/i,
    );
    if (typeMatch && !inferredJenisHak) {
      inferredJenisHak = mapHakCode(typeMatch[1]);
    }
  }

  for (const rawLine of scrubbedLines) {
    const line = rawLine.trim();
    if (!line || NOISE_SU_LINE_RE.test(line)) continue;

    const explicitNoHakMatch = line.match(
      /\b(?:no\.?|nom[eo]r|nornor)\s*h[ae]k\b[\s.,_\-:—~]*([A-Za-z]{1,4}[\s.\-/]*)?(?:(?:no\.?|nom[eo]r)\.?\s*[:.\-]?\s*)?([0-9OoQDIl|!]{1,5})\b(?!\s*[\/|\\]\s*(?:19|20)\d{2}\b)(?!\s*(?:m2|m²|meter)\b)/i,
    );
    if (explicitNoHakMatch) {
      const no = repairNumericToken(explicitNoHakMatch[2]);
      const code =
        (explicitNoHakMatch[1] ? mapHakCode(explicitNoHakMatch[1].replace(/[.\-/]/g, " ")) : null) ||
        inferredJenisHak;
      if (no && no.length <= 5) {
        return {
          kodeAngka: null,
          kodeHuruf: code,
          nomorHak: no,
          nib: detectedNib,
          evidence: explicitNoHakMatch[0].trim(),
          explicitContext: true,
        };
      }
    }
  }

  // Legacy short & dotted formats: "H.M. 145", "HM. 2246", "H.G.B. 105", "Hak Milik No. 145"
  for (const rawLine of scrubbedLines) {
    const line = rawLine.trim();
    if (!line || NOISE_SU_LINE_RE.test(line)) continue;
    const lineWithoutSu = line.replace(
      /\b(?:surat\s+ukur|gambar\s+situasi|no\.?\s*su|nomor\s+su)\s*(?:no\.?|nomor)?\s*[:.\-]?\s*[0-9OoQDIl|!]{1,5}(?:\s*[\/|\\]\s*(?:19|20)\d{2})?\b/gi,
      " ",
    );

    const legacyHakMatch = lineWithoutSu.match(
      /\b(HAK\s+MILIK|HAK\s+GUNA\s+USAHA|HAK\s+GUNA\s+BANGUNAN|HAK\s+PAKAI|HAK\s+PENGELOLAAN|H\.?\s*G\.?\s*B\.?|H\.?\s*G\.?\s*U\.?|H\.?\s*P\.?\s*L\.?|H\.?\s*M\.?|H\.?\s*P\.?|WAKAF)\b[\s.\-:/]*(?:(?:NO|NOMOR)\.?\s*[:.\-]?\s*)?([0-9OoQDIl|!]{1,5})\b(?!\s*[\/|\\]\s*(?:19|20)\d{2}\b)(?!\s*(?:m2|m²|meter)\b)/i,
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

function extractLuasTanahFromText(rawText: string): string | null {
  const m = rawText.match(
    /\b(?:luas(?:\s+tanah|\s+bidang)?|l\s*=)\s*[:.=]?\s*(\d[\d.,]{0,9})(?:\s*[.\-]*)\s*(?:m\s*2|m²|meter\s+persegi)\b/i,
  );
  if (m && m[1]) {
    return `${m[1].replace(/[\s.\-]+$/g, "").replace(/\s+/g, "")} m2`;
  }
  const compact = rawText.match(/\b(\d{1,5}(?:[.,]\d{1,3})?)(?:\s*[.\-]*)\s*(?:m²|m2)\b/i);
  if (compact && compact[1]) {
    return `${compact[1].replace(/[\s.\-]+$/g, "")} m2`;
  }
  return null;
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
  const luasTanah = extractLuasTanahFromText(rawText);

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
    luas_tanah: luasTanah,
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

  // Prefer secondary pass when it unlocks a dictionary-verified region match or stronger SU signal
  const primaryKecDict = h.kecamatan_raw
    ? matchWilayahKecamatan(h.kecamatan_raw).similarity >= 0.85
    : false;
  const secondaryKecDict = f.kecamatan_raw
    ? matchWilayahKecamatan(f.kecamatan_raw).similarity >= 0.85
    : false;
  const chosenKec =
    !primaryKecDict && secondaryKecDict
      ? f.kecamatan_raw
      : pick(h.kecamatan_raw, f.kecamatan_raw);

  const primaryKelDict = h.kelurahan_raw
    ? matchWilayahKelurahan(h.kelurahan_raw, chosenKec ?? undefined).similarity >= 0.85
    : false;
  const secondaryKelDict = f.kelurahan_raw
    ? matchWilayahKelurahan(f.kelurahan_raw, chosenKec ?? undefined).similarity >= 0.85
    : false;
  const chosenKel =
    !primaryKelDict && secondaryKelDict
      ? f.kelurahan_raw
      : pick(h.kelurahan_raw, f.kelurahan_raw);

  const secondaryWinsSu =
    Boolean(f.nomor_su_raw && f.tahun_su) &&
    (!h.nomor_su_raw ||
      !h.tahun_su ||
      (secondaryKelDict && !primaryKelDict && f.confidence.nomor_su >= h.confidence.nomor_su));

  const merged: AiExtractionResult = {
    is_halaman_data_su: h.is_halaman_data_su || f.is_halaman_data_su,
    nomor_su_raw: secondaryWinsSu ? f.nomor_su_raw : pick(h.nomor_su_raw, f.nomor_su_raw),
    tahun_su: secondaryWinsSu ? f.tahun_su : pick(h.tahun_su, f.tahun_su),
    kode_jenis_hak_angka: pick(h.kode_jenis_hak_angka, f.kode_jenis_hak_angka),
    kode_jenis_hak_huruf: pick(h.kode_jenis_hak_huruf, f.kode_jenis_hak_huruf),
    nomor_hak_raw: pick(h.nomor_hak_raw, f.nomor_hak_raw),
    kecamatan_raw: chosenKec,
    kelurahan_raw: chosenKel,
    nib_terdeteksi: pick(h.nib_terdeteksi, f.nib_terdeteksi),
    luas_tanah: pick(h.luas_tanah ?? null, f.luas_tanah ?? null),
    raw_evidence: {
      teks_nomor_su: secondaryWinsSu
        ? f.raw_evidence.teks_nomor_su
        : pick(h.raw_evidence.teks_nomor_su, f.raw_evidence.teks_nomor_su),
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
