import { describe, it } from "node:test";
import assert from "node:assert/strict";
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
import { parseSuratUkurOcrText } from "./local-ocr-parser.ts";
import { detectPaperCornersFromRgba } from "./auto-crop.ts";
import {
  computeNextAiQuotaReset,
  createInitialAiUsageStats,
  recordAiUsageEvent,
} from "./ai-usage.ts";
import type { AiExtractionResult } from "./su-types.ts";

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

  it("handles legacy short hak formats like 'HM. 2246' and 'HGB 105'", () => {
    const hm = parseNomorHakEvidence("HM. 2246");
    assert.equal(hm.kind, "short_hak");
    assert.equal(hm.kodeHak, "M");
    assert.equal(hm.nomorHak5, "02246");

    const hgb = parseNomorHakEvidence("HGB 105");
    assert.equal(hgb.kind, "short_hak");
    assert.equal(hgb.kodeHak, "B");
    assert.equal(hgb.nomorHak5, "00105");
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
  });

  it("auto-crops paper edges cleanly from a wooden desk background", () => {
    const w = 100;
    const h = 100;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const insidePaper = x >= 15 && x <= 84 && y >= 12 && y <= 88;
        if (insidePaper) {
          // Cream/white document with dark inner frame ink
          const isInk = x === 25 || x === 74 || y === 22 || y === 78;
          rgba[idx] = isInk ? 25 : 246;
          rgba[idx + 1] = isInk ? 25 : 244;
          rgba[idx + 2] = isInk ? 25 : 236;
          rgba[idx + 3] = 255;
        } else {
          // Warm wooden desk border around paper
          rgba[idx] = 165;
          rgba[idx + 1] = 132;
          rgba[idx + 2] = 98;
          rgba[idx + 3] = 255;
        }
      }
    }

    const res = detectPaperCornersFromRgba(rgba, w, h);
    assert.equal(res.detected, true);
    // Detected top-left & bottom-right corners should hug the paper margin (0.15, 0.12 -> 0.85, 0.88), not inner ink (0.25)
    assert.ok(res.corners[0].x >= 0.12 && res.corners[0].x <= 0.19);
    assert.ok(res.corners[0].y >= 0.09 && res.corners[0].y <= 0.16);
    assert.ok(res.corners[2].x >= 0.81 && res.corners[2].x <= 0.88);
    assert.ok(res.corners[2].y >= 0.84 && res.corners[2].y <= 0.92);
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
});
