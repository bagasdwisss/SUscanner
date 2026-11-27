import { z } from "zod";

/**
 * Compact, token-efficient system instruction for Indonesian ATR/BPN Surat Ukur (SU)
 * structured extraction (including 1960s 1-sheet SUs, Kecamatan/Kelurahan, NIB, and Luas Tanah).
 */
export const SU_SYSTEM_INSTRUCTION = `Ekstrak data blangko fisik "SURAT UKUR" / "GAMBAR SITUASI" ATR/BPN ke JSON presisi (baik blangko 1 halaman tegak, buku lipat terbuka 2 panel DAFTAR ISIAN 207, maupun blangko kuning/hijau guilloche & lama 1960-an):
1. BEDAKAN DUA TATA LETAK BLANGKO SU:
   A. BUKU TERBUKA 2 PANEL (DAFTAR ISIAN 207):
      - PANEL KIRI (Hal lain-lain / Daftar Isian 302 / Tanda tangan Kepala Seksi / Tabel Pemisahan): JANGAN PERNAH ambil "Daftar Isian 302 tgl... No. 671/2000" atau nomor di tabel Pemisahan sebagai Nomor SU!
      - PANEL KANAN ("SURAT UKUR"): Semua identitas arsip ada DI PANEL KANAN! Kotak 14 digit PP.KK.Kec.Kel.H.NNNNN (mis. 02.01.10.02.1.02095) ada di kiri-atas panel kanan (digit ke-9 = kode hak, 5 digit terakhir = nomor_hak_raw); NIB ada di kanan atas sebelah tulisan "NIB :" (bisa 13 digit modern ATAU 4-6 digit seperti "02374").
   B. BLANGKO 1 HALAMAN TEGAK:
      - POJOK KIRI ATAS (kotak 14 digit PP.KK.Kec.Kel.H.NNNNN, mis. 02.01.10.02.1.01488): ini NOMOR HAK! Digit ke-9 = jenis hak (1=M, 2=HGU, 3=HGB, 4=HP, 5=HPL, 8=Wakaf) & 5 digit terakhir = nomor_hak_raw. Abaikan kode seri kertas (mis. AL 014904 / AM 750746).
      - POJOK KANAN ATAS: tercantum jenis hak & baris "Nomor hak : ...".
      - NIB: berada DI BAWAH tulisan "Nomor hak" kanan atas ATAU di kotak "NIB" bawah judul SURAT UKUR. Bisa 13 digit (02.01.16.06.00676) ATAU 4-6 digit (02374). Simpan ke nib_terdeteksi (JANGAN masukkan ke nomor_hak_raw atau nomor_su_raw).
2. NOMOR SU & TAHUN SU:
   - Berada tepat di bawah judul "SURAT UKUR" / "GAMBAR SITUASI" (terkadang diketik sedikit di atas garis titik-titik "Nomor : ..... / 19....", mis. "71/Tanjung Sari/2000" atau "616/TANJUNG SARI/1998" atau "00001/2009").
   - Jika berpola N/Kelurahan/Tahun (mis. "71/Tanjung Sari/2000" atau "616/TANJUNG SARI/1998"), ekstrak teks_nomor_su ringkas = "71/2000" (tanpa nama kelurahan), nomor_su_raw = "71" (pertahankan nol depan jika memang tertulis "00001"), tahun_su = "2000", dan pindahkan nama kelurahan ke kelurahan_raw.
3. ABAIKAN DISTRAKTOR:
   - Daftar Isian 302 / 307 / 207 (seperti "No. 671/2000" di panel kiri!), stempel "Telah Dialihmediakan" beserta tanggal/nomornya (mis. 01/12/2023, 07/12/2023, 100/SP-UP...), "Lembar : 14 / Kotak : 1/2", kode seri perforasi (AM 750746, AL 014904), NIP 18 digit, dan garis kosong "... / 19...".
   - Jika dikirim 2 gambar: Gambar 1 = halaman penuh, Gambar 2 = zoom detail panel SURAT UKUR / header. Gunakan Gambar 2 untuk membaca digit kecil, NIB samar, & tulisan tangan dengan teliti.
4. ATURAN KEJUJURAN CONFIDENCE (ANTI-99% PALSU):
   - DILARANG memberi skor 0.95/0.99 seragam di semua kolom! Evaluasi tiap kolom secara kritis berdasarkan keterbacaan visual nyatanya:
   - 0.93–0.98: HANYA jika huruf/angka cetakan mesin tajam atau tulisan tangan 1 goresan bersih tanpa keraguan satu digit pun.
   - 0.72–0.85: Jika diketik tipis di atas watermark hijau "BADANPERTANAHANNASIONAL", sedikit buram, atau terpotong garis titik-titik.
   - 0.45–0.70: WAJIB diturunkan bila ada angka tulisan tangan yang TERTIMPA / DICORET / DIPERBAIKI (mis. angka terakhir tampak seperti 5 tertimpa 8 atau 0/8 meragukan), tertutup stempel/lipatan, atau hasil tebakan — dan jelaskan singkat digit mana yang meragukan di catatan_peringatan!
5. is_halaman_data_su: true bila ada identitas SU/GS; false HANYA bila murni peta bidang ("SKALA 1 : ...") tanpa identitas SU.
6. kode_jenis_hak_angka & kode_jenis_hak_huruf: 1/HM->M, 2/HGU->U, 3/HGB->B, 4/HP->P, 5/HPL->L, 8/Wakaf->W.
7. kecamatan_raw & kelurahan_raw: ambil dari baris Kecamatan/Ketjamatan & Desa/Kelurahan (atau segmen tengah Nomor SU). Jangan ambil Propinsi atau Kabupaten/Kotamadya.
8. luas_tanah: ambil angka & satuan (mis. "138.- m2" -> "138 m2").`;

export const SU_USER_PROMPT =
  "Ekstrak data blangko SURAT UKUR ke JSON secara jujur: abaikan Daftar Isian 302 (halaman kiri) & stempel Telah Dialihmediakan. Baca Nomor Hak 5 digit dari kotak 14 digit & Nomor SU N/YYYY tepat di bawah judul SURAT UKUR. Jika ada digit tulisan tangan tertimpa/samar, turunkan confidence kolom tsb ke <=0.70 dan tulis alasannya di catatan_peringatan.";

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
        "Angka NIB di sebelah label 'NIB :' kanan atas atau kotak NIB — bisa 13 digit (02.01.16.06.00676) ATAU 4-6 digit lama (mis. 02374).",
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
