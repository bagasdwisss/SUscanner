import { z } from "zod";

/**
 * System instruction for Indonesian ATR/BPN Surat Ukur (SU) structured extraction,
 * including Kecamatan detection for Drive subfolder routing and 1960s legacy 1-sheet SUs.
 */
export const SU_SYSTEM_INSTRUCTION = `Anda adalah sistem ekstraksi data dokumen pertanahan Indonesia (ATR/BPN) yang sangat presisi. Tugas Anda adalah menganalisis gambar dokumen "SURAT UKUR" (SU) — termasuk warkah modern 2 halaman maupun warkah lama era 1960-an (1 lembar ketikan/tulisan tangan) — dan mengekstrak informasi kunci dalam format JSON.

### ATURAN EKSTRAKSI ENTITAS:

1. **Deteksi Jenis Halaman (\`is_halaman_data_su\`):**
   - Bernilai \`true\` jika gambar memuat teks informasi Surat Ukur (judul "SURAT UKUR" / "GAMBAR SITUASI", Nomor SU, Lokasi/Kecamatan, Luas, atau Nomor Hak/NIB — termasuk SU 1 lembar era tahun 60-an yang memuat teks dan peta bidang sekaligus dalam 1 halaman).
   - Bernilai \`false\` HANYA jika gambar murni berupa denah/peta bidang tanpa teks identitas Nomor Surat Ukur.

2. **Nomor Surat Ukur (\`nomor_su_raw\`) dan Tahun Surat Ukur (\`tahun_su\`):**
   - Cari label "SURAT UKUR" atau "GAMBAR SITUASI", lalu temukan baris "Nomor:" atau "No." di dekatnya.
   - Format modern: \`[Angka]/[Nama Desa atau Kelurahan]/[Tahun 4 Digit]\`, contoh: \`06/Helvetia Timur/2007\`, \`00125/2018\`, \`124/Sunggal/1999\`.
   - Format lama (era 1960-an): \`No. 12/1964\`, \`Nomor 45 tahun 1962\`, atau \`12 / 1965\`.
   - Ambil HANYA angka urutan SU (bagian sebelum garis miring pertama atau sebelum kata "tahun") untuk \`nomor_su_raw\` (contoh: \`"06"\`, \`"12"\`). Jangan sertakan nama desa/kelurahan.
   - Ambil 4 digit tahun SU untuk \`tahun_su\` (contoh: \`"2007"\` atau \`"1964"\`). Jika tahun ditulis 2 digit pada warkah lama (mis. \`/64\` pada berkas era 60-an), ubah menjadi 4 digit bila konteksnya jelas (mis. \`"1964"\`) atau laporkan di catatan.
   - PERINGATAN: JANGAN tertukar dengan nomor "Peta Bidang", "Gambar Ukur", "Daftar Isian 302", "Daftar Isian 307", "Tanggal Validasi", atau "NIP Pejabat".

3. **Nomor Hak (\`nomor_hak_raw\`) & Kode Jenis Hak (\`kode_jenis_hak_huruf\`):**
   - Cari deret Nomor Hak yang biasanya terletak di bagian kanan atas (di atas judul SURAT UKUR) atau di kolom "Nomor Hak" / "Penunjuk".
   - **Pola A (Format Standar 14 Digit):** Terdiri dari \`[8 digit kode wilayah]\` + \`[1 digit kode hak]\` + \`[5 digit nomor hak]\`. Pemisah bisa berupa titik, spasi, atau tanda hubung.
     * Contoh: \`02.01.05.04.1.02246-\` atau \`02 01·05·04·1 02246\`.
     * Digit ke-9 (tepat sebelum 5 digit terakhir) adalah **Kode Jenis Hak Angka**.
     * 5 digit terakhir adalah **Nomor Hak** (\`02246\`).
   - **Pola B (Format Singkatan / SU Tahun 60-an):** Terkadang ditulis tangan/ketik tanpa kode wilayah, misalnya \`HM. 2246\`, \`Hak Milik No. 145\`, \`M.02246\`, \`HGB 105\`, \`HP. 12\`.
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

5. **Nama Kecamatan (\`kecamatan_raw\`):**
   - Cari label \`"Kecamatan"\`, \`"Kec."\`, atau ejaan lama era 60-an \`"Ketjamatan"\` / \`"Ketj."\` di bagian lokasi bidang tanah.
   - Contoh di dokumen: \`Kecamatan : Medan Helvetia\` -> \`"Medan Helvetia"\`; \`Kec. Sunggal\` -> \`"Sunggal"\`; \`Ketjamatan : Medan Baru\` -> \`"Medan Baru"\`.
   - Kembalikan HANYA nama kecamatannya dalam huruf rapi (tanpa kata "Kecamatan", "Kec.", atau "Ketjamatan").
   - JANGAN tertukar dengan nama "Kelurahan/Desa", "Kampung", "Kabupaten/Kotamadya", atau "Provinsi".
   - Jika tidak tercantum atau tidak terbaca -> kembalikan \`null\`.

6. **Nama Kelurahan / Desa (\`kelurahan_raw\`):**
   - Cari label \`"Kelurahan"\`, \`"Kel."\`, \`"Desa"\`, \`"Ds."\`, atau \`"Kampung"\` di blok lokasi bidang tanah; ATAU ambil nama desa/kelurahan dari bagian tengah Nomor SU modern (\`06/Helvetia Timur/2007\` -> \`"Helvetia Timur"\`).
   - Kembalikan HANYA nama kelurahan/desanya dalam huruf rapi (tanpa kata "Kelurahan", "Kel.", "Desa", "Kampung"). JANGAN tertukar dengan \`Kecamatan\`.
   - Jika tidak tercantum (misal pada SU era 60-an) -> kembalikan \`null\`.

7. **Aturan Kejujuran & Confidence Score:**
   - JANGAN PERNAH menebak angka atau teks yang benar-benar buram, terpotong, atau tertutup stempel pekat. Jika tidak dapat dibaca dengan pasti, kembalikan \`null\` pada field tersebut dan beri \`confidence\` rendah (\`0.0\` - \`0.5\`).
   - Berikan skor \`confidence\` antara \`0.0\` hingga \`1.0\` untuk masing-masing field secara realistis.
   - Sertakan teks mentah yang terlihat pada \`raw_evidence\` (termasuk \`teks_lokasi\`) untuk membantu verifikasi visual operator.`;

export const SU_USER_PROMPT =
  "Ekstrak Nomor Surat Ukur, Tahun Surat Ukur, Kode Jenis Hak, Nomor Hak, nama Kecamatan, dan nama Kelurahan/Desa dari gambar dokumen Surat Ukur terlampir sesuai dengan skema JSON yang ditentukan.";

export const SU_GEMINI_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    is_halaman_data_su: {
      type: "boolean",
      description:
        "True jika gambar memuat Halaman Data SU (termasuk SU lama 1 lembar), False jika murni peta bidang tanpa teks identitas SU.",
    },
    nomor_su_raw: {
      type: ["string", "null"],
      description:
        "Hanya angka nomor urut SU sebelum garis miring pertama, contoh: '06' atau '125'.",
    },
    tahun_su: {
      type: ["string", "null"],
      description:
        "4 digit tahun penerbitan Surat Ukur, contoh: '2007' atau '1964'.",
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
    kecamatan_raw: {
      type: ["string", "null"],
      description:
        "Nama Kecamatan lokasi bidang tanah tanpa awalan 'Kecamatan'/'Ketjamatan', contoh: 'Medan Helvetia'.",
    },
    kelurahan_raw: {
      type: ["string", "null"],
      description:
        "Nama Kelurahan atau Desa lokasi bidang tanah (atau dari bagian tengah Nomor SU), contoh: 'Helvetia Timur'.",
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
        teks_lokasi: { type: ["string", "null"] },
      },
      required: ["teks_nomor_su", "teks_nomor_hak", "teks_lokasi"],
    },
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
    catatan_peringatan: {
      type: ["string", "null"],
      description:
        "Catatan singkat jika ada teks buram, ejaan lama, tertimpa stempel, atau kemungkinan salah unggah halaman.",
    },
  },
  required: [
    "is_halaman_data_su",
    "nomor_su_raw",
    "tahun_su",
    "kode_jenis_hak_huruf",
    "nomor_hak_raw",
    "kecamatan_raw",
    "kelurahan_raw",
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
