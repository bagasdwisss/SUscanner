import { z } from "zod";

/**
 * Compact, token-efficient system instruction for Indonesian ATR/BPN Surat Ukur (SU)
 * structured extraction (including 1960s 1-sheet SUs, Kecamatan/Kelurahan, NIB, and Luas Tanah).
 */
export const SU_SYSTEM_INSTRUCTION = `Ekstrak data blangko fisik "SURAT UKUR" / "GAMBAR SITUASI" ATR/BPN (warkah modern, blangko kuning guilloche berkotak, maupun lama 1960-an) ke JSON presisi:
1. TATA LETAK FISIK BLANGKO SU:
   - POJOK KIRI ATAS (dalam kotak-kotak 14 digit PP.KK.Kec.Kel.H.NNNNN, mis. 02.01.10.02.1.01488): ini adalah NOMOR HAK! Digit ke-9 = jenis hak (1=M, 2=HGU, 3=HGB, 4=HP, 5=HPL, 8=Wakaf) & 5 digit terakhir (01488) = nomor_hak_raw. Abaikan kode seri kertas di bawahnya (mis. AL 014904).
   - POJOK KANAN ATAS: tercantum jenis hak (mis. HAK MILIK) & baris "Nomor hak : ..." (mis. 1488 -> pad 5 digit "01488"). Gunakan bersama kotak kiri atas untuk konfirmasi silang nomor_hak_raw.
   - NIB (13 digit, mis. 02.01.16.06.00676): bisa berada DI BAWAH tulisan "Nomor hak" di kanan atas, ATAU di kotak-kotak bertuliskan "NIB" tepat di bawah judul SURAT UKUR / GAMBAR SITUASI. Simpan ke nib_terdeteksi (JANGAN masukkan ke nomor_hak_raw atau nomor_su_raw).
   - NOMOR SU & TAHUN SU: berada di tengah di bawah SURAT UKUR / GAMBAR SITUASI & baris template "Nomor : ..... / 19...." (mis. 616/TANJUNG SARI/1998 atau 00001/2009). Jika berpola N/Kelurahan/Tahun (seperti "616/TANJUNG SARI/1998"), ekstrak teks_nomor_su ringkas menjadi "616/1998" saja (tanpa nama kelurahan), nomor_su_raw: "616" (pertahankan nol depan penuh bila ada, mis. "00001"), tahun_su: "1998", lalu pindahkan "TANJUNG SARI" ke kelurahan_raw.
2. ABADIKAN & ABAIKAN DISTRAKTOR: Abaikan stempel "Telah Dialihmediakan" beserta tanggalnya (mis. 07/12/2023, 31/08/2023, TANGG. UP...), "Lembar : 1/1", "Kotak : C23/A", "AL 014904", "D.I. 302/307", NIP, dan baris kosong template "... / 19...".
3. is_halaman_data_su: true bila ada identitas SU/GS; false HANYA bila murni peta bidang tanpa identitas SU.
4. kode_jenis_hak_angka & kode_jenis_hak_huruf: 1/HM->M, 2/HGU->U, 3/HGB->B, 4/HP->P, 5/HPL->L, 8/Wakaf->W.
5. kecamatan_raw & kelurahan_raw: ambil dari baris Kecamatan/Ketjamatan & Desa/Kelurahan (atau segmen tengah Nomor SU seperti TANJUNG SARI). Jangan ambil Propinsi atau Kabupaten/Kotamadya.
6. luas_tanah: ambil angka & satuan (mis. "872.- m2" -> "872 m2").
7. catatan_peringatan: isi sangat singkat hanya jika teks penting buram/terpotong, else null. Jangan menebak bila tidak terbaca.`;

export const SU_USER_PROMPT =
  "Ekstrak data Surat Ukur ke JSON: Nomor Hak 5 digit dari kotak 14 digit kiri atas & kolom Nomor hak kanan atas; NIB 13 digit di bawah Nomor hak atau kotak NIB; dan Nomor SU/Tahun ringkas N/YYYY (mis. 616/TANJUNG SARI/1998 diekstrak menjadi teks_nomor_su='616/1998', nomor_su_raw='616', tahun_su='1998', kelurahan_raw='Tanjung Sari').";

export const SU_GEMINI_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    raw_evidence: {
      type: "object",
      properties: {
        teks_nomor_su: {
          type: ["string", "null"],
          description:
            "Ringkas menjadi 'NomorSU/TahunSU' saja tanpa nama kelurahan di tengah (mis. '616/1998' dari '616/TANJUNG SARI/1998', atau '00001/2009').",
        },
        teks_nomor_hak: {
          type: ["string", "null"],
          description:
            "Salin 14 digit kotak kiri atas (mis. 02.01.10.02.1.01488) dan/atau Nomor hak kanan atas (mis. HAK MILIK Nomor hak 1488).",
        },
        teks_lokasi: { type: ["string", "null"] },
      },
      required: ["teks_nomor_su", "teks_nomor_hak", "teks_lokasi"],
    },
    nib_terdeteksi: {
      type: ["string", "null"],
      description:
        "Angka 13 digit NIB yang berada di bawah Nomor hak sebelah kanan atau di dalam kotak-kotak bertuliskan NIB (mis. 02.01.16.06.00676).",
    },
    luas_tanah: { type: ["string", "null"] },
    is_halaman_data_su: { type: "boolean" },
    nomor_su_raw: {
      type: ["string", "null"],
      description:
        "Nomor urut SU di samping /Tahun (mis. '616' dari '616/TANJUNG SARI/1998', atau '00001' dari '00001/2009'). Pertahankan nol depan; terpisah dari Nomor Hak.",
    },
    tahun_su: {
      type: ["string", "null"],
      description:
        "4 digit tahun penerbitan SU (mis. '1998' dari '616/TANJUNG SARI/1998' atau '2009' dari '00001/2009'). Jangan ambil tahun stempel Telah Dialihmediakan.",
    },
    kode_jenis_hak_angka: { type: ["string", "null"] },
    kode_jenis_hak_huruf: {
      type: ["string", "null"],
      enum: ["M", "U", "B", "P", "L", "W", null],
    },
    nomor_hak_raw: {
      type: ["string", "null"],
      description:
        "5 digit terakhir Nomor Hak dari kotak-kotak 14 digit kiri atas & kolom Nomor hak kanan atas (mis. '01488' dari 02.01.10.02.1.01488 / 1488). Bukan NIB 13 digit & bukan Nomor SU.",
    },
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
  luas_tanah: z.string().nullable().optional().default(null),
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
