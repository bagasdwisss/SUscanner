import { z } from "zod";

/**
 * Compact, token-efficient system instruction for Indonesian ATR/BPN Surat Ukur (SU)
 * structured extraction (including 1960s 1-sheet SUs & Kecamatan/Kelurahan detection).
 */
export const SU_SYSTEM_INSTRUCTION = `Ekstrak data "SURAT UKUR" / "GAMBAR SITUASI" ATR/BPN (warkah modern 2 hal maupun lama 1960-an 1 lembar) ke JSON presisi:
1. raw_evidence: salin persis teks asli di kertas (teks_nomor_su, teks_nomor_hak, teks_lokasi). nib_terdeteksi: angka NIB 13 digit bila tercantum.
2. is_halaman_data_su: true bila ada teks identitas SU; false HANYA bila murni peta bidang tanpa nomor SU.
3. nomor_su_raw & tahun_su: ambil hanya nomor urut SU (pertahankan nol depan, mis. "06", "12") & 4 digit tahun SU (konversi 2 digit lama mis. /64 -> "1964"). Jangan ambil D.I. 302/307, Peta Bidang, NIP, atau tanggal validasi.
4. kode_jenis_hak_angka & kode_jenis_hak_huruf: 1/HM->M, 2/HGU->U, 3/HGB->B, 4/HP->P, 5/HPL->L, 8/Wakaf->W.
5. nomor_hak_raw: 5 digit nomor hak (digit ke-10..14 pada pola 14 digit BPN, atau angka pada HM.145 / H.M. 145). DILARANG mengisi NIB 13 digit.
6. kecamatan_raw: nama pada baris Kecamatan/Ketjamatan saja (jangan Kota/Kabupaten).
7. kelurahan_raw: nama pada baris Kelurahan/Desa/Kampung atau segmen tengah Nomor SU modern (06/Helvetia Timur/2007 -> "Helvetia Timur"). null bila tidak ada.
8. catatan_peringatan: isi sangat singkat hanya jika teks penting buram/terpotong, else null. Jangan menebak bila tidak terbaca.`;

export const SU_USER_PROMPT = "Ekstrak data Surat Ukur ke JSON.";

export const SU_GEMINI_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    raw_evidence: {
      type: "object",
      properties: {
        teks_nomor_su: { type: ["string", "null"] },
        teks_nomor_hak: { type: ["string", "null"] },
        teks_lokasi: { type: ["string", "null"] },
      },
      required: ["teks_nomor_su", "teks_nomor_hak", "teks_lokasi"],
    },
    nib_terdeteksi: { type: ["string", "null"] },
    is_halaman_data_su: { type: "boolean" },
    nomor_su_raw: { type: ["string", "null"] },
    tahun_su: { type: ["string", "null"] },
    kode_jenis_hak_angka: { type: ["string", "null"] },
    kode_jenis_hak_huruf: {
      type: ["string", "null"],
      enum: ["M", "U", "B", "P", "L", "W", null],
    },
    nomor_hak_raw: { type: ["string", "null"] },
    kecamatan_raw: { type: ["string", "null"] },
    kelurahan_raw: { type: ["string", "null"] },
    confidence: {
      type: "object",
      properties: {
        nomor_su: { type: "number", minimum: 0, maximum: 1 },
        tahun_su: { type: "number", minimum: 0, maximum: 1 },
        jenis_hak: { type: "number", minimum: 0, maximum: 1 },
        nomor_hak: { type: "number", minimum: 0, maximum: 1 },
        kecamatan: { type: "number", minimum: 0, maximum: 1 },
        kelurahan: { type: "number", minimum: 0, maximum: 1 },
      },
      required: [
        "nomor_su",
        "tahun_su",
        "jenis_hak",
        "nomor_hak",
        "kecamatan",
        "kelurahan",
      ],
    },
    catatan_peringatan: { type: ["string", "null"] },
  },
  required: [
    "raw_evidence",
    "is_halaman_data_su",
    "nomor_su_raw",
    "tahun_su",
    "kode_jenis_hak_huruf",
    "nomor_hak_raw",
    "kecamatan_raw",
    "kelurahan_raw",
    "confidence",
  ],
} as const;

export const suExtractionZodSchema = z.object({
  is_halaman_data_su: z.boolean(),
  nomor_su_raw: z.string().nullable(),
  tahun_su: z.string().nullable(),
  kode_jenis_hak_angka: z.string().nullable().default(null),
  kode_jenis_hak_huruf: z.enum(["M", "U", "B", "P", "L", "W"]).nullable(),
  nomor_hak_raw: z.string().nullable(),
  kecamatan_raw: z.string().nullable().default(null),
  kelurahan_raw: z.string().nullable().default(null),
  nib_terdeteksi: z.string().nullable().default(null),
  raw_evidence: z.object({
    teks_nomor_su: z.string().nullable(),
    teks_nomor_hak: z.string().nullable(),
    teks_lokasi: z.string().nullable().default(null),
  }),
  confidence: z.object({
    nomor_su: z.number().min(0).max(1),
    tahun_su: z.number().min(0).max(1),
    jenis_hak: z.number().min(0).max(1),
    nomor_hak: z.number().min(0).max(1),
    kecamatan: z.number().min(0).max(1).default(0),
    kelurahan: z.number().min(0).max(1).default(0),
  }),
  catatan_peringatan: z.string().nullable().default(null),
});
