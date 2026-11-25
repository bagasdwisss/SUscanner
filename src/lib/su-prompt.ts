import { z } from "zod";

/**
 * Exact system instruction from PRD Section 10.2 for Indonesian ATR/BPN
 * Surat Ukur (SU) structured entity extraction.
 */
export const SU_SYSTEM_INSTRUCTION = `Anda adalah sistem ekstraksi data dokumen pertanahan Indonesia (ATR/BPN) yang sangat presisi. Tugas Anda adalah menganalisis gambar dokumen "SURAT UKUR" (SU) dan mengekstrak informasi kunci untuk penamaan file arsip secara akurat dalam format JSON.

### ATURAN EKSTRAKSI ENTITAS:

1. **Deteksi Jenis Halaman (\`is_halaman_data_su\`):**
   - Bernilai \`true\` jika gambar memuat teks informasi Surat Ukur (judul "SURAT UKUR", Nomor SU, Lokasi, Luas, Nomor Hak/NIB).
   - Bernilai \`false\` jika gambar HANYA berisi denah/peta bidang tanah (Halaman 2) atau bukan dokumen Surat Ukur.

2. **Nomor Surat Ukur (\`nomor_su_raw\`) dan Tahun Surat Ukur (\`tahun_su\`):**
   - Cari label "SURAT UKUR" lalu temukan baris "Nomor:" di dekatnya.
   - Format umum di dokumen: \`[Angka]/[Nama Desa atau Kelurahan]/[Tahun 4 Digit]\`, contoh: \`06/Helvetia Timur/2007\`, \`00125/2018\`, atau \`124/Sunggal/1999\`.
   - Ambil HANYA angka urutan SU (bagian sebelum garis miring pertama) untuk \`nomor_su_raw\` (contoh: \`"06"\` atau \`"124"\`). Jangan sertakan nama desa/kelurahan.
   - Ambil 4 digit tahun SU untuk \`tahun_su\` (contoh: \`"2007"\`).
   - PERINGATAN: JANGAN tertukar dengan nomor "Peta Bidang", "Gambar Ukur", "Daftar Isian 302", "Daftar Isian 307", "Tanggal Validasi", atau "NIP Pejabat".

3. **Nomor Hak (\`nomor_hak_raw\`) & Kode Jenis Hak (\`kode_jenis_hak_huruf\`):**
   - Cari deret Nomor Hak yang biasanya terletak di bagian kanan atas (di atas judul SURAT UKUR) atau di kolom "Nomor Hak".
   - **Pola A (Format Standar 14 Digit):** Terdiri dari \`[8 digit kode wilayah]\` + \`[1 digit kode hak]\` + \`[5 digit nomor hak]\`. Pemisah bisa berupa titik, spasi, atau tanda hubung.
     * Contoh: \`02.01.05.04.1.02246-\` atau \`02 01·05·04·1 02246\`.
     * Digit ke-9 (tepat sebelum 5 digit terakhir) adalah **Kode Jenis Hak Angka**.
     * 5 digit terakhir adalah **Nomor Hak** (\`02246\`).
   - **Pola B (Format Singkatan / SU Lama):** Terkadang ditulis tangan/ketik tanpa kode wilayah, misalnya \`HM. 2246\`, \`M.02246\`, \`HGB 105\`, \`HP. 12\`.
   - **PEMBEDAAN KRITIS (NOMOR HAK vs NIB):**
     * NIB (Nomor Identifikasi Bidang) biasanya memiliki label eksplisit "NIB:" dan HANYA terdiri dari **13 digit** (\`[8 digit wilayah].[5 digit nomor bidang]\`, contoh: \`02.01.05.04.03043\`) TANPA 1 digit kode jenis hak di tengahnya.
     * JANGAN PERNAH menggunakan angka NIB sebagai Nomor Hak.

4. **Tabel Konversi Kode Jenis Hak (\`kode_jenis_hak_huruf\`):**
   - Angka \`1\` atau teks \`HM\` / \`Hak Milik\` -> \`"M"\`
   - Angka \`2\` atau teks \`HGU\` / \`Hak Guna Usaha\` -> \`"U"\`
   - Angka \`3\` atau teks \`HGB\` / \`Hak Guna Bangunan\` -> \`"B"\`
   - Angka \`4\` atau teks \`HP\` / \`Hak Pakai\` -> \`"P"\`
   - Angka \`5\` atau teks \`HPL\` / \`Hak Pengelolaan\` -> \`"L"\`
   - Angka \`8\` atau teks \`Wakaf\` / \`W\` -> \`"W"\`
   - Jika tidak ditemukan atau tidak terbaca -> \`null\`

5. **Aturan Kejujuran & Confidence Score:**
   - JANGAN PERNAH menebak angka yang benar-benar buram, terpotong, atau tertutup stempel pekat. Jika tidak dapat dibaca dengan pasti, kembalikan \`null\` pada field tersebut dan beri \`confidence\` rendah (\`0.0\` - \`0.5\`).
   - Berikan skor \`confidence\` antara \`0.0\` hingga \`1.0\` untuk masing-masing field secara realistis.
   - Sertakan teks mentah yang terlihat di dokumen pada field \`raw_evidence\` untuk membantu operator melakukan verifikasi visual.`;

/**
 * Exact user prompt from PRD Section 10.3.
 */
export const SU_USER_PROMPT =
  "Ekstrak Nomor Surat Ukur, Tahun Surat Ukur, Kode Jenis Hak, dan Nomor Hak dari gambar dokumen Surat Ukur terlampir sesuai dengan skema JSON yang ditentukan.";

/**
 * Strict JSON Schema from PRD Section 10.4 for Gemini responseJsonSchema.
 */
export const SU_GEMINI_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    is_halaman_data_su: {
      type: "boolean",
      description:
        "True jika ini adalah Halaman 1 (Data SU), False jika ini Halaman 2 (Peta Bidang) atau dokumen lain.",
    },
    nomor_su_raw: {
      type: ["string", "null"],
      description:
        "Hanya angka nomor urut SU sebelum garis miring pertama, contoh: '06' atau '125'.",
    },
    tahun_su: {
      type: ["string", "null"],
      description:
        "4 digit tahun penerbitan Surat Ukur, contoh: '2007'.",
    },
    kode_jenis_hak_angka: {
      type: ["string", "null"],
      description:
        "1 digit kode angka jenis hak jika menggunakan format 14 digit, contoh: '1'.",
    },
    kode_jenis_hak_huruf: {
      type: ["string", "null"],
      enum: ["M", "U", "B", "P", "L", "W", null],
      description:
        "Kode 1 huruf kapital jenis hak hasil pemetaan standar BPN.",
    },
    nomor_hak_raw: {
      type: ["string", "null"],
      description:
        "Angka nomor hak (maksimal 5 digit terakhir tanpa kode wilayah dan tanpa kode hak), contoh: '02246'.",
    },
    nib_terdeteksi: {
      type: ["string", "null"],
      description:
        "Angka NIB jika terlihat (hanya sebagai verifikasi agar tidak tertukar dengan Nomor Hak).",
    },
    raw_evidence: {
      type: "object",
      properties: {
        teks_nomor_su: { type: ["string", "null"] },
        teks_nomor_hak: { type: ["string", "null"] },
      },
      required: ["teks_nomor_su", "teks_nomor_hak"],
    },
    confidence: {
      type: "object",
      properties: {
        nomor_su: { type: "number", minimum: 0, maximum: 1 },
        tahun_su: { type: "number", minimum: 0, maximum: 1 },
        jenis_hak: { type: "number", minimum: 0, maximum: 1 },
        nomor_hak: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["nomor_su", "tahun_su", "jenis_hak", "nomor_hak"],
    },
    catatan_peringatan: {
      type: ["string", "null"],
      description:
        "Catatan singkat jika ada teks buram, tertimpa stempel, atau kemungkinan salah unggah halaman.",
    },
  },
  required: [
    "is_halaman_data_su",
    "nomor_su_raw",
    "tahun_su",
    "kode_jenis_hak_huruf",
    "nomor_hak_raw",
    "raw_evidence",
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
  nib_terdeteksi: z.string().nullable().default(null),
  raw_evidence: z.object({
    teks_nomor_su: z.string().nullable(),
    teks_nomor_hak: z.string().nullable(),
  }),
  confidence: z.object({
    nomor_su: z.number().min(0).max(1),
    tahun_su: z.number().min(0).max(1),
    jenis_hak: z.number().min(0).max(1),
    nomor_hak: z.number().min(0).max(1),
  }),
  catatan_peringatan: z.string().nullable().default(null),
});
