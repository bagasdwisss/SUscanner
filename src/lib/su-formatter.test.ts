import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyExtractionToForm,
  buildStandardFilename,
  mapHakCode,
  padFiveDigits,
  parseNomorHakEvidence,
  sanitizeCustomFilename,
  validateStandardFields,
} from "./su-formatter.ts";
import { suExtractionZodSchema } from "./su-prompt.ts";
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
      nib_terdeteksi: "02.01.05.04.03043",
      raw_evidence: {
        teks_nomor_su: "06/Helvetia Timur/2007",
        teks_nomor_hak: "02 01·05·04·1 02246-",
      },
      confidence: {
        nomor_su: 0.98,
        tahun_su: 0.99,
        jenis_hak: 0.95,
        nomor_hak: 0.96,
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
    assert.equal(processed.confidences.nomorSu.level, "high");
    assert.equal(processed.confidences.nomorHak.level, "high");
    assert.equal(
      buildStandardFilename(processed.fields),
      "SU.00006.2007.M.02246.pdf",
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
      nib_terdeteksi: "02.01.05.04.03043",
      raw_evidence: {
        teks_nomor_su: "125/2018",
        teks_nomor_hak: "02.01.05.04.03043",
      },
      confidence: {
        nomor_su: 0.95,
        tahun_su: 0.95,
        jenis_hak: 0.2,
        nomor_hak: 0.4,
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
      },
      2026,
    );
    assert.equal(badYear.valid, false);
    assert.ok(badYear.errors.tahunSu);

    const goodYear = validateStandardFields(
      {
        nomorSu: "6",
        tahunSu: "2007",
        kodeHak: "M",
        nomorHak: "2246",
        isCustomHak: false,
        customHak: "",
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
      nib_terdeteksi: null,
      raw_evidence: { teks_nomor_su: null, teks_nomor_hak: null },
      confidence: {
        nomor_su: 0,
        tahun_su: 0,
        jenis_hak: 0,
        nomor_hak: 0,
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
});
