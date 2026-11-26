import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import {
  applyExtractionToForm,
  buildStandardFilename,
  extractDriveFolderId,
  findMatchingKecamatanFolder,
  findMatchingKelurahanFolder,
  mapHakCode,
  normalizeKecamatanName,
  normalizeKelurahanName,
  padFiveDigits,
  parseNomorHakEvidence,
  sanitizeCustomFilename,
  validateStandardFields,
} from "./su-formatter.ts";
import { suExtractionZodSchema } from "./su-prompt.ts";
import {
  mergeMultiPassOcrResults,
  parseSuratUkurOcrText,
} from "./local-ocr-parser.ts";
import { detectPaperCornersFromRgba } from "./auto-crop.ts";
import {
  computeNextAiQuotaReset,
  createInitialAiUsageStats,
  recordAiUsageEvent,
} from "./ai-usage.ts";
import {
  matchWilayahKecamatan,
  matchWilayahKelurahan,
  validateHakRegionCrossCheck,
} from "./wilayah-dict.ts";
import { analyzeRgbaImageQuality } from "./image-quality.ts";
import { hashKioskPin } from "./kiosk-lock.ts";
import {
  buildReportCsvBlob,
  buildReportXlsxBlob,
  buildStructuredBackupZipBlob,
} from "./backup-export.ts";
import type { AiExtractionResult, SessionHistoryItem } from "./su-types.ts";

describe("SU-Scanner formatter & domain rules", () => {
  it("formats PRD Section 10.5 reference output to SU.00006.2007.M.02246.pdf", () => {
    const sample: AiExtractionResult = {
      is_halaman_data_su: true,
      nomor_su_raw: "06",
      tahun_su: "2007",
      kode_jenis_hak_angka: "1",
      kode_jenis_hak_huruf: "M",
      nomor_hak_raw: "02246",
      kecamatan_raw: "Kecamatan Medan Helvetia",
      kelurahan_raw: "Kelurahan Helvetia Timur",
      nib_terdeteksi: "02.01.05.04.03043",
      raw_evidence: {
        teks_nomor_su: "06/Helvetia Timur/2007",
        teks_nomor_hak: "02 01·05·04·1 02246-",
        teks_lokasi: "Kecamatan: Medan Helvetia",
      },
      confidence: {
        nomor_su: 0.98,
        tahun_su: 0.99,
        jenis_hak: 0.95,
        nomor_hak: 0.96,
        kecamatan: 0.94,
        kelurahan: 0.93,
      },
      catatan_peringatan: null,
    };

    const parsedZod = suExtractionZodSchema.parse(sample);
    const processed = applyExtractionToForm(parsedZod, 2026);

    assert.equal(processed.isWrongPageSlot, false);
    assert.equal(processed.fields.nomorSu, "00006");
    assert.equal(processed.fields.tahunSu, "2007");
    assert.equal(processed.fields.kodeHak, "M");
    assert.equal(processed.fields.nomorHak, "02246");
    assert.equal(processed.fields.kecamatan, "Medan Helvetia");
    assert.equal(processed.fields.kelurahan, "Helvetia Timur");
    assert.equal(processed.confidences.nomorSu.level, "high");
    assert.equal(processed.confidences.nomorHak.level, "high");
    assert.equal(processed.confidences.kecamatan.level, "high");
    assert.equal(processed.confidences.kelurahan.level, "high");
    assert.equal(
      buildStandardFilename(processed.fields),
      "SU.00006.2007.M.02246.pdf",
    );
  });

  it("handles 1960s 1-sheet legacy Surat Ukur with old spelling Ketjamatan", () => {
    const legacy1960s: AiExtractionResult = {
      is_halaman_data_su: true,
      nomor_su_raw: "12",
      tahun_su: "1964",
      kode_jenis_hak_angka: null,
      kode_jenis_hak_huruf: null,
      nomor_hak_raw: "HM. 145",
      kecamatan_raw: "Ketjamatan Medan Baru",
      kelurahan_raw: null,
      nib_terdeteksi: null,
      raw_evidence: {
        teks_nomor_su: "No. 12/1964",
        teks_nomor_hak: "HM. 145",
        teks_lokasi: "Ketjamatan : Medan Baru",
      },
      confidence: {
        nomor_su: 0.92,
        tahun_su: 0.91,
        jenis_hak: 0.89,
        nomor_hak: 0.88,
        kecamatan: 0.9,
        kelurahan: 0,
      },
      catatan_peringatan: null,
    };

    const parsed = suExtractionZodSchema.parse(legacy1960s);
    const processed = applyExtractionToForm(parsed, 2026);
    assert.equal(buildStandardFilename(processed.fields), "SU.00012.1964.M.00145.pdf");
    assert.equal(processed.fields.kecamatan, "Medan Baru");
    assert.equal(validateStandardFields(processed.fields, 2026).valid, true);
  });

  it("normalizes Kecamatan names consistently and extracts Drive folder IDs", () => {
    assert.equal(normalizeKecamatanName("Kec. MEDAN HELVETIA"), "Medan Helvetia");
    assert.equal(normalizeKecamatanName("Ketjamatan: Sunggal"), "Sunggal");
    assert.equal(normalizeKecamatanName("kecamatan   medan johor/"), "Medan Johor");
    assert.equal(normalizeKecamatanName("   "), "");

    assert.equal(
      extractDriveFolderId(
        "https://drive.google.com/drive/folders/1D5fIBh9sa8cD1QBTL1J3NoRw6NWDudub?usp=sharing",
      ),
      "1D5fIBh9sa8cD1QBTL1J3NoRw6NWDudub",
    );
    assert.equal(
      extractDriveFolderId("1D5fIBh9sa8cD1QBTL1J3NoRw6NWDudub"),
      "1D5fIBh9sa8cD1QBTL1J3NoRw6NWDudub",
    );
    assert.equal(extractDriveFolderId("https://example.com/bad"), null);

    const existingFolders = [
      { id: "f1", name: "Kecamatan Medan Baru" },
      { id: "f2", name: "MEDAN HELVETIA" },
    ];
    assert.equal(
      findMatchingKecamatanFolder(existingFolders, "Medan Baru")?.id,
      "f1",
    );
    assert.equal(
      findMatchingKecamatanFolder(existingFolders, "Kec. Medan Helvetia")?.id,
      "f2",
    );
    assert.equal(
      findMatchingKecamatanFolder(existingFolders, "Medan Johor"),
      undefined,
    );

    assert.equal(normalizeKelurahanName("Kel. HELVETIA TIMUR"), "Helvetia Timur");
    assert.equal(normalizeKelurahanName("Desa Sei Rotan"), "Sei Rotan");
    const kelFolders = [
      { id: "k1", name: "Kelurahan Helvetia Timur" },
      { id: "k2", name: "SEI SIKAMBING C II" },
    ];
    assert.equal(
      findMatchingKelurahanFolder(kelFolders, "Helvetia Timur")?.id,
      "k1",
    );
    assert.equal(
      findMatchingKelurahanFolder(kelFolders, "Sei Sikambing C Ii")?.id,
      "k2",
    );
  });

  it("maps all 6 ATR/BPN hak codes (digit & abbreviation)", () => {
    assert.equal(mapHakCode("1"), "M");
    assert.equal(mapHakCode("2"), "U");
    assert.equal(mapHakCode("3"), "B");
    assert.equal(mapHakCode("4"), "P");
    assert.equal(mapHakCode("5"), "L");
    assert.equal(mapHakCode("8"), "W");
    assert.equal(mapHakCode("HM"), "M");
    assert.equal(mapHakCode("HGU"), "U");
    assert.equal(mapHakCode("HGB"), "B");
    assert.equal(mapHakCode("HP"), "P");
    assert.equal(mapHakCode("HPL"), "L");
    assert.equal(mapHakCode("WAKAF"), "W");
    assert.equal(mapHakCode("9"), null);
  });

  it("distinguishes 14-digit Nomor Hak from 13-digit NIB", () => {
    const hak14 = parseNomorHakEvidence("02.01.05.04.1.02246-");
    assert.equal(hak14.kind, "nomor_hak_14");
    assert.equal(hak14.kodeHak, "M");
    assert.equal(hak14.nomorHak5, "02246");

    const nib13 = parseNomorHakEvidence("02.01.05.04.03043");
    assert.equal(nib13.kind, "nib_13");
    assert.equal(nib13.kodeHak, null);
    assert.equal(nib13.nomorHak5, null);

    // Guard against AI accidentally putting 13-digit NIB into nomor_hak_raw
    const leakedNib: AiExtractionResult = {
      is_halaman_data_su: true,
      nomor_su_raw: "125",
      tahun_su: "2018",
      kode_jenis_hak_angka: null,
      kode_jenis_hak_huruf: null,
      nomor_hak_raw: "02.01.05.04.03043",
      kecamatan_raw: null,
      kelurahan_raw: null,
      nib_terdeteksi: "02.01.05.04.03043",
      raw_evidence: {
        teks_nomor_su: "125/2018",
        teks_nomor_hak: "02.01.05.04.03043",
        teks_lokasi: null,
      },
      confidence: {
        nomor_su: 0.95,
        tahun_su: 0.95,
        jenis_hak: 0.2,
        nomor_hak: 0.4,
        kecamatan: 0,
        kelurahan: 0,
      },
      catatan_peringatan: null,
    };

    const res = applyExtractionToForm(leakedNib, 2026);
    assert.equal(res.fields.nomorHak, "");
    assert.equal(res.confidences.nomorHak.level, "low");
    assert.ok(res.warnings.some((w) => w.includes("NIB")));
  });

  it("handles legacy short hak formats and embedded 14-digit noisy evidence", () => {
    const hm = parseNomorHakEvidence("HM. 2246");
    assert.equal(hm.kind, "short_hak");
    assert.equal(hm.kodeHak, "M");
    assert.equal(hm.nomorHak5, "02246");

    const hgb = parseNomorHakEvidence("HGB 105");
    assert.equal(hgb.kind, "short_hak");
    assert.equal(hgb.kodeHak, "B");
    assert.equal(hgb.nomorHak5, "00105");

    const legacyWord = parseNomorHakEvidence("Hak Milik No. 145");
    assert.equal(legacyWord.kind, "short_hak");
    assert.equal(legacyWord.kodeHak, "M");
    assert.equal(legacyWord.nomorHak5, "00145");

    const noisy14 = parseNomorHakEvidence("Penunjuk Hak: 02.01.05.04.1.02246- / Medan");
    assert.equal(noisy14.kind, "nomor_hak_14");
    assert.equal(noisy14.kodeHak, "M");
    assert.equal(noisy14.nomorHak5, "02246");

    // Cross-validation recovers kelurahan/nomorHak from raw_evidence if AI omitted them
    const partialAi: AiExtractionResult = {
      is_halaman_data_su: true,
      nomor_su_raw: null,
      tahun_su: null,
      kode_jenis_hak_angka: null,
      kode_jenis_hak_huruf: null,
      nomor_hak_raw: null,
      kecamatan_raw: null,
      kelurahan_raw: null,
      nib_terdeteksi: null,
      raw_evidence: {
        teks_nomor_su: "06/Helvetia Timur/2007",
        teks_nomor_hak: "02.01.05.04.1.02246-",
        teks_lokasi: "Kelurahan: Helvetia Timur, Kecamatan: Medan Helvetia",
      },
      confidence: {
        nomor_su: 0.9,
        tahun_su: 0.9,
        jenis_hak: 0.9,
        nomor_hak: 0.9,
        kecamatan: 0.9,
        kelurahan: 0.85,
      },
      catatan_peringatan: null,
    };
    const crossChecked = applyExtractionToForm(partialAi, 2026);
    assert.equal(
      buildStandardFilename(crossChecked.fields),
      "SU.00006.2007.M.02246.pdf",
    );
    assert.equal(crossChecked.fields.kecamatan, "Medan Helvetia");
    assert.equal(crossChecked.fields.kelurahan, "Helvetia Timur");
  });

  it("zero-pads 5 digits and validates year boundaries", () => {
    assert.equal(padFiveDigits("6"), "00006");
    assert.equal(padFiveDigits("00125"), "00125");
    assert.equal(padFiveDigits(""), "");

    const badYear = validateStandardFields(
      {
        nomorSu: "6",
        tahunSu: "1945",
        kodeHak: "M",
        nomorHak: "2246",
        isCustomHak: false,
        customHak: "",
        kecamatan: "",
        kelurahan: "",
      },
      2026,
    );
    assert.equal(badYear.valid, false);
    assert.ok(badYear.errors.tahunSu);

    const year1960 = validateStandardFields(
      {
        nomorSu: "6",
        tahunSu: "1960",
        kodeHak: "M",
        nomorHak: "2246",
        isCustomHak: false,
        customHak: "",
        kecamatan: "",
        kelurahan: "",
      },
      2026,
    );
    assert.equal(year1960.valid, true);

    const goodYear = validateStandardFields(
      {
        nomorSu: "6",
        tahunSu: "2007",
        kodeHak: "M",
        nomorHak: "2246",
        isCustomHak: false,
        customHak: "",
        kecamatan: "Medan Timur",
        kelurahan: "Durian",
      },
      2026,
    );
    assert.equal(goodYear.valid, true);
  });

  it("flags wrong page slot when Page 1 is a Peta Bidang", () => {
    const page2UploadedToSlot1: AiExtractionResult = {
      is_halaman_data_su: false,
      nomor_su_raw: null,
      tahun_su: null,
      kode_jenis_hak_angka: null,
      kode_jenis_hak_huruf: null,
      nomor_hak_raw: null,
      kecamatan_raw: null,
      kelurahan_raw: null,
      nib_terdeteksi: null,
      raw_evidence: {
        teks_nomor_su: null,
        teks_nomor_hak: null,
        teks_lokasi: null,
      },
      confidence: {
        nomor_su: 0,
        tahun_su: 0,
        jenis_hak: 0,
        nomor_hak: 0,
        kecamatan: 0,
        kelurahan: 0,
      },
      catatan_peringatan: "Gambar hanya berisi peta bidang tanah.",
    };
    const processed = applyExtractionToForm(page2UploadedToSlot1, 2026);
    assert.equal(processed.isWrongPageSlot, true);
    assert.equal(processed.confidences.nomorSu.level, "low");
  });

  it("sanitizes custom filenames safely", () => {
    assert.equal(
      sanitizeCustomFilename('SU:06/2007*?"<>|'),
      "SU062007.pdf",
    );
    assert.equal(sanitizeCustomFilename("SU.00006.2007.M.02246"), "SU.00006.2007.M.02246.pdf");
    assert.equal(sanitizeCustomFilename("   "), "SU.dokumen.pdf");
  });

  it("parses modern and 1960s Surat Ukur text via built-in OCR parser fallback", () => {
    const noisyTesseractText = `
      SURAT UKT?" Hak: 02.01.05.04.1.02246-
      Nomor: O6/Helvetia Timur/2007
      NIB: 02.01.05.04.03043
      Kecamatan : Medan Helvetia
    `;
    const parsedModern = parseSuratUkurOcrText(noisyTesseractText, 75);
    const modernForm = applyExtractionToForm(parsedModern, 2026);
    assert.equal(modernForm.isWrongPageSlot, false);
    assert.equal(
      buildStandardFilename(modernForm.fields),
      "SU.00006.2007.M.02246.pdf",
    );
    assert.equal(modernForm.fields.kecamatan, "Medan Helvetia");
    assert.equal(modernForm.fields.kelurahan, "Helvetia Timur");
    assert.equal(modernForm.rawEvidence.nibTerdeteksi, "02.01.05.04.03043");

    const legacy1960Text = `
      SURAT UKUR Hak Milik : HM. 145
      Nomor : 12/1964
      Propinsi : Sumatera Utara
      Ketjamatan : Medan Baru
    `;
    const parsedLegacy = parseSuratUkurOcrText(legacy1960Text, 92);
    const legacyForm = applyExtractionToForm(parsedLegacy, 2026);
    assert.equal(
      buildStandardFilename(legacyForm.fields),
      "SU.00012.1964.M.00145.pdf",
    );
    assert.equal(legacyForm.fields.kecamatan, "Medan Baru");

    const mapOnlyText = "PETA BIDANG TANAH SKALA 1 : 1000";
    const parsedMap = parseSuratUkurOcrText(mapOnlyText, 70);
    assert.equal(parsedMap.is_halaman_data_su, false);

    // Rejects NIP 18-digit, D.I. 302, and dates rather than making wrong guesses; handles garbled OCR separators
    const noisyWithNipAndDi = `
      SURAT UKUR
      D.I. 302 No. 889/2018
      Nornor: O6 | Helvetia Timur | 2OO7
      NIB: 02.01.05.04.03043
      Kota : Medan
      Kecarnatan : Medan Helvetia
      NIP. 19750412 199903 1 002
      H.G.B. No. 105
    `;
    const parsedNoisy = parseSuratUkurOcrText(noisyWithNipAndDi, 78);
    const noisyForm = applyExtractionToForm(parsedNoisy, 2026);
    assert.equal(
      buildStandardFilename(noisyForm.fields),
      "SU.00006.2007.B.00105.pdf",
    );
    assert.equal(noisyForm.fields.kecamatan, "Medan Helvetia");
    assert.equal(noisyForm.fields.kelurahan, "Helvetia Timur");

    // Multi-pass merge: clean header pass wins on SU/Hak while full-sheet pass recovers missing Kecamatan
    const headerOnly = parseSuratUkurOcrText(
      `SURAT UKUR\nHak: 02.01.05.04.1.02246-\nNomor: 06/Helvetia Timur/2007`,
      85,
    );
    const fullSheet = parseSuratUkurOcrText(
      `SURAT UKUR\nKecamatan : Medan Helvetia\nTanggal : 14/2012`,
      75,
    );
    const merged = mergeMultiPassOcrResults(
      { result: headerOnly, meanConfidence: 85 },
      { result: fullSheet, meanConfidence: 75 },
    );
    const mergedForm = applyExtractionToForm(merged.extraction, 2026);
    assert.equal(
      buildStandardFilename(mergedForm.fields),
      "SU.00006.2007.M.02246.pdf",
    );
    assert.equal(mergedForm.fields.kecamatan, "Medan Helvetia");
  });

  it("auto-crops paper edges across dark desks, wood desks, light desks, skewed traps, and keeps clean flat scans intact", () => {
    const makeImage = (
      w: number,
      h: number,
      paint: (x: number, y: number) => [number, number, number],
    ) => {
      const rgba = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const [r, g, b] = paint(x, y);
          rgba[idx] = r;
          rgba[idx + 1] = g;
          rgba[idx + 2] = b;
          rgba[idx + 3] = 255;
        }
      }
      return rgba;
    };

    // 1. Wooden desk with dark inner SU box frame
    const wood = makeImage(120, 120, (x, y) => {
      const insidePaper = x >= 18 && x <= 101 && y >= 14 && y <= 105;
      if (insidePaper) {
        const isInk = x === 30 || x === 88 || y === 26 || y === 94;
        return isInk ? [20, 20, 20] : [246, 244, 236];
      }
      return [165, 132, 98];
    });
    const woodRes = detectPaperCornersFromRgba(wood, 120, 120);
    assert.equal(woodRes.detected, true);
    assert.ok(woodRes.corners[0].x >= 0.12 && woodRes.corners[0].x <= 0.18);
    assert.ok(woodRes.corners[0].y >= 0.09 && woodRes.corners[0].y <= 0.15);
    assert.ok(woodRes.corners[2].x >= 0.81 && woodRes.corners[2].x <= 0.88);
    assert.ok(woodRes.corners[2].y >= 0.84 && woodRes.corners[2].y <= 0.91);

    // 2. Dark charcoal desk (regression test for old lum < 105 dark background bug)
    const darkDesk = makeImage(120, 120, (x, y) => {
      const insidePaper = x >= 14 && x <= 105 && y >= 12 && y <= 107;
      if (insidePaper) {
        const isInk = (x === 60 && y > 30 && y < 90) || y === 45;
        return isInk ? [18, 18, 18] : [242, 240, 234];
      }
      return [28, 28, 32];
    });
    const darkRes = detectPaperCornersFromRgba(darkDesk, 120, 120);
    assert.equal(darkRes.detected, true);
    assert.ok(darkRes.corners[0].x >= 0.09 && darkRes.corners[0].x <= 0.15);
    assert.ok(darkRes.corners[0].y >= 0.07 && darkRes.corners[0].y <= 0.14);
    assert.ok(darkRes.corners[2].x >= 0.84 && darkRes.corners[2].x <= 0.91);
    assert.ok(darkRes.corners[2].y >= 0.86 && darkRes.corners[2].y <= 0.93);

    // 3. Skewed/tilted trapezoid document on dark granite table
    const skewed = makeImage(120, 120, (x, y) => {
      const nx = x / 119;
      const ny = y / 119;
      const leftBound = 0.18 - ny * 0.06;
      const rightBound = 0.84 + ny * 0.06;
      const topBound = 0.1 + nx * 0.04;
      const botBound = 0.86 + nx * 0.03;
      const insidePaper =
        nx >= leftBound && nx <= rightBound && ny >= topBound && ny <= botBound;
      if (insidePaper) {
        const isInk = Math.abs(nx - 0.5) < 0.02 && ny > 0.3 && ny < 0.7;
        return isInk ? [15, 15, 15] : [248, 246, 240];
      }
      return [55, 58, 62];
    });
    const skewedRes = detectPaperCornersFromRgba(skewed, 120, 120);
    assert.equal(skewedRes.detected, true);
    assert.ok(skewedRes.corners[0].x >= 0.14 && skewedRes.corners[0].x <= 0.21);
    assert.ok(skewedRes.corners[2].x >= 0.86 && skewedRes.corners[2].x <= 0.93);

    // 4. Light beige desk vs white paper with sharp black text inside
    const lightDesk = makeImage(120, 120, (x, y) => {
      const insidePaper = x >= 15 && x <= 104 && y >= 15 && y <= 104;
      if (insidePaper) {
        const isDarkRule = y === 35 && x > 28 && x < 92;
        return isDarkRule ? [10, 10, 10] : [252, 252, 250];
      }
      return [205, 196, 178];
    });
    const lightRes = detectPaperCornersFromRgba(lightDesk, 120, 120);
    assert.equal(lightRes.detected, true);
    assert.ok(lightRes.corners[0].x >= 0.1 && lightRes.corners[0].x <= 0.16);

    // 5. Already full-frame clean paper scan with an interior printed border must NOT over-crop
    const flatFullFrame = makeImage(120, 120, (x, y) => {
      const isBorder =
        ((x === 10 || x === 109) && y >= 10 && y <= 109) ||
        ((y === 10 || y === 109) && x >= 10 && x <= 109);
      return isBorder ? [15, 15, 15] : [245, 239, 224];
    });
    const flatRes = detectPaperCornersFromRgba(flatFullFrame, 120, 120);
    assert.equal(flatRes.detected, false);
  });

  it("tracks AI usage counts, token totals, and daily Pacific-Time reset rollover", () => {
    const day1 = new Date("2026-11-25T10:00:00Z"); // 02:00 PST Nov 25
    let stats = createInitialAiUsageStats(day1);
    assert.equal(stats.dailyQuotaLimit, 250);

    stats = recordAiUsageEvent(stats, {
      engine: "gemini",
      model: "gemini-3.5-flash",
      status: 200,
      ok: true,
      promptTokens: 320,
      outputTokens: 90,
      totalTokens: 410,
      now: day1,
    });
    assert.equal(stats.usedTodayRequests, 1);
    assert.equal(stats.totalTokensToday, 410);

    stats = recordAiUsageEvent(stats, {
      engine: "local-ocr",
      model: "tesseract-ind",
      status: 200,
      ok: true,
      now: day1,
    });
    // Local OCR does not consume Gemini quota count
    assert.equal(stats.usedTodayRequests, 1);
    assert.equal(stats.localOcrToday, 1);

    const nextDay = new Date("2026-11-26T09:00:00Z"); // 01:00 PST Nov 26 (past 00:00 PT reset)
    stats = recordAiUsageEvent(stats, {
      engine: "gemini",
      model: "gemini-3.6-flash",
      status: 200,
      ok: true,
      promptTokens: 200,
      outputTokens: 50,
      totalTokens: 250,
      now: nextDay,
    });
    assert.equal(stats.usedTodayRequests, 1);
    assert.equal(stats.totalRequestsAllTime, 2);
    assert.equal(stats.totalTokensToday, 250);
    assert.equal(stats.totalTokensAllTime, 660);

    const resetInfo = computeNextAiQuotaReset(day1);
    assert.ok(resetInfo.wibTimeLabel.includes("WIB"));
    assert.ok(resetInfo.remainingMs > 0);
  });

  it("matches official Kota Medan Kecamatan/Kelurahan dictionary typos & cross-validates 8-digit Nomor Hak codes", () => {
    assert.equal(matchWilayahKecamatan("Medn Helvetia").matched, "Medan Helvetia");
    assert.equal(matchWilayahKecamatan("medan timnr").matched, "Medan Timur");
    assert.equal(
      matchWilayahKelurahan("Helvetia Timnr", "Medan Helvetia").matched,
      "Helvetia Timur",
    );
    assert.equal(
      matchWilayahKelurahan("Pulo Brayan Darat I", "Medan Timur").matched,
      "Pulo Brayan Darat I",
    );

    const okCross = validateHakRegionCrossCheck({
      rawNomorHak: "02.01.05.04.1.02246",
      kecamatan: "Medan Helvetia",
      kelurahan: "Helvetia Timur",
    });
    assert.equal(okCross.hasPrefix8, true);
    assert.equal(okCross.prefix8, "02.01.05.04");
    assert.equal(okCross.status, "match");

    const wrongCity = validateHakRegionCrossCheck({
      rawNomorHak: "09.99.01.02.1.00010",
      kecamatan: "Medan Baru",
      kelurahan: "Babura",
    });
    assert.equal(wrongCity.status, "mismatch");

    const learnedMismatch = validateHakRegionCrossCheck({
      rawNomorHak: "02.01.05.04.1.02246",
      kecamatan: "Medan Johor",
      kelurahan: "Pangkalan Masyhur",
      learnedCodes: [
        {
          prefix8: "02.01.05.04",
          kecPrefix6: "02.01.05",
          kecamatan: "Medan Helvetia",
          kelurahan: "Helvetia Timur",
          confirmedCount: 3,
        },
      ],
    });
    assert.equal(learnedMismatch.status, "mismatch");
    assert.equal(learnedMismatch.suggestedKecamatan, "Medan Helvetia");
  });

  it("detects sharp documents vs motion blur and lamp glare", () => {
    const makeRgba = (
      w: number,
      h: number,
      fn: (x: number, y: number) => [number, number, number],
    ): Uint8ClampedArray => {
      const out = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const [r, g, b] = fn(x, y);
          const idx = (y * w + x) * 4;
          out[idx] = r;
          out[idx + 1] = g;
          out[idx + 2] = b;
          out[idx + 3] = 255;
        }
      }
      return out;
    };

    const sharp = makeRgba(100, 100, (x, y) => {
      const isLine = y >= 25 && y <= 75 && x % 4 === 0 && y % 3 === 0;
      return isLine ? [20, 20, 20] : [235, 232, 226];
    });
    const sharpRes = analyzeRgbaImageQuality(sharp, 100, 100);
    assert.equal(sharpRes.status, "good");
    assert.ok(sharpRes.sharpnessScore > 25);

    const blurry = makeRgba(100, 100, (x, y) => {
      const band = Math.round(210 + 4 * Math.sin(x * 0.1) + 4 * Math.cos(y * 0.1));
      return [band, band, band];
    });
    const blurRes = analyzeRgbaImageQuality(blurry, 100, 100);
    assert.ok(blurRes.sharpnessScore < sharpRes.sharpnessScore);

    const glare = makeRgba(100, 100, (x, y) => {
      if (x >= 20 && x <= 75 && y >= 20 && y <= 75) {
        return [255, 255, 255];
      }
      return x % 3 === 0 && y % 3 === 0 ? [25, 25, 25] : [235, 235, 235];
    });
    const glareRes = analyzeRgbaImageQuality(glare, 100, 100);
    assert.ok(glareRes.glarePercent >= 12);
    assert.ok(
      glareRes.status === "warn_glare" || glareRes.status === "warn_both",
    );
  });

  it("extracts luas tanah from OCR text and hashes kiosk admin PIN deterministically", async () => {
    const parsed = parseSuratUkurOcrText(
      "SURAT UKUR\nNomor: 00006/Helvetia Timur/2007\nLuas tanah: 145 m2\nKecamatan: Medan Helvetia\nKelurahan: Helvetia Timur",
      88,
    );
    assert.ok(parsed.luas_tanah?.includes("145"));

    const h1 = await hashKioskPin("2468", "kantah-medan");
    const h2 = await hashKioskPin("2468", "kantah-medan");
    const hDiff = await hashKioskPin("9999", "kantah-medan");
    assert.equal(h1, h2);
    assert.notEqual(h1, hDiff);
    assert.ok(h1.length >= 16);
  });

  it("builds valid CSV, OOXML XLSX, and hierarchical Kecamatan/Kelurahan ZIP backup packages", async () => {
    const dummyPdf = new TextEncoder().encode("%PDF-1.4\n%%EOF").buffer;
    const sampleItems: SessionHistoryItem[] = [
      {
        id: "item-1",
        filename: "SU.00006.2007.M.02246.pdf",
        createdAt: 1700000000000,
        pageCount: 2,
        sizeBytes: dummyPdf.byteLength,
        nomorSu: "00006",
        tahunSu: "2007",
        kodeHak: "M",
        nomorHak: "02246",
        nib: "02.01.05.04.03043",
        luasTanah: "145 m2",
        kecamatan: "Medan Helvetia",
        kelurahan: "Helvetia Timur",
        operatorName: "Operator Meja 1",
        pdfBytes: dummyPdf,
      },
      {
        id: "item-2",
        filename: "SU.00006.2007.M.02246.pdf",
        createdAt: 1700000005000,
        pageCount: 1,
        sizeBytes: dummyPdf.byteLength,
        nomorSu: "00006",
        tahunSu: "2007",
        kodeHak: "M",
        nomorHak: "02246",
        kecamatan: "Medan Helvetia",
        kelurahan: "Helvetia Timur",
        pdfBytes: dummyPdf,
      },
    ];

    const csvText = await buildReportCsvBlob(sampleItems).text();
    assert.ok(csvText.includes("SU.00006.2007.M.02246.pdf"));
    assert.ok(csvText.includes("Medan Helvetia"));

    const xlsxBytes = new Uint8Array(await buildReportXlsxBlob(sampleItems).arrayBuffer());
    const xlsxFiles = unzipSync(xlsxBytes);
    assert.ok("xl/workbook.xml" in xlsxFiles);
    assert.ok("xl/worksheets/sheet1.xml" in xlsxFiles);
    const sheetXml = strFromU8(xlsxFiles["xl/worksheets/sheet1.xml"]);
    assert.ok(sheetXml.includes("SU.00006.2007.M.02246.pdf"));
    assert.ok(sheetXml.includes("Helvetia Timur"));

    const { blob: zipBlob, includedPdfCount } =
      await buildStructuredBackupZipBlob(sampleItems);
    assert.equal(includedPdfCount, 2);
    const zipEntries = unzipSync(new Uint8Array(await zipBlob.arrayBuffer()));
    assert.ok(
      "Medan Helvetia/Helvetia Timur/SU.00006.2007.M.02246.pdf" in zipEntries,
    );
    assert.ok(
      "Medan Helvetia/Helvetia Timur/SU.00006.2007.M.02246_rev2.pdf" in zipEntries,
    );
    assert.ok("rekap-scan.csv" in zipEntries);
  });
});
