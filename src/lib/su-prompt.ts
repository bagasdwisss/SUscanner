import { z } from "zod";

/**
 * System instruction for Indonesian ATR/BPN Surat Ukur (SU) structured extraction,
 * including Kecamatan detection for Drive subfolder routing and 1960s legacy 1-sheet SUs.
 */
export const SU_SYSTEM_INSTRUCTION = `Anda adalah sistem OCR & ekstraksi data dokumen pertanahan Indonesia (ATR/BPN) dengan ketelitian maksimal. Tugas Anda adalah membaca gambar "SURAT UKUR" (SU) atau "GAMBAR SITUASI" — baik warkah modern maupun warkah lama era 1960-an (1 lembar ketikan/tulisan tangan) — dan menghasilkan JSON terstruktur yang akurat.

### LANGKAH 1 — TRANSKRIPSI BUKTI MENTAH TERLEBIH DAHULU (\`raw_evidence\`):
Sebelum mengisi kolom hasil, salin persis teks asli yang tercetak/tertulis di kertas:
- \`teks_nomor_su\`: Baris "Nomor:" / "No." di bawah atau di samping judul SURAT UKUR (contoh: \`"06/Helvetia Timur/2007"\` atau \`"No. 12 / 1964"\`).
- \`teks_nomor_hak\`: Baris Nomor Hak 14 digit atau penunjuk hak singkat di pojok kanan atas/kolom penunjuk (contoh: \`"02.01.05.04.1.02246-"\` atau \`"Hak Milik : HM. 145"\`).
- \`teks_lokasi\`: Blok lokasi tanah ("Terletak dalam", Kelurahan/Desa, Kecamatan/Ketjamatan, Kota/Kabupaten).
- \`nib_terdeteksi\`: Nomor NIB 13 digit bila tercantum (hanya untuk pencegahan salah ambil).

### LANGKAH 2 — ATURAN EKSTRAKSI ENTITAS:

1. **Deteksi Jenis Halaman (\`is_halaman_data_su\`):**
   - \`true\` jika gambar memuat teks identitas Surat Ukur / Gambar Situasi (judul, Nomor SU, Lokasi, Luas, atau Nomor Hak/NIB — termasuk SU 1 lembar tahun 60-an).
   - \`false\` HANYA jika murni gambar peta bidang/denah tanpa teks identitas Nomor SU.

2. **Nomor Surat Ukur (\`nomor_su_raw\`) & Tahun SU (\`tahun_su\`):**
   - Format modern: \`[Angka]/[Nama Desa/Kelurahan]/[Tahun 4 Digit]\`, contoh: \`06/Helvetia Timur/2007\`, \`00125/Sunggal/2018\`.
   - Format lama 1960-an: \`No. 12/1964\`, \`Nomor 45 tahun 1962\`.
   - Ambil HANYA angka urutan SU (pertahankan nol di depan seperti \`"06"\` atau \`"00125"\`) untuk \`nomor_su_raw\`. Jangan sertakan nama kelurahan/tahun.
   - Ambil 4 digit tahun penerbitan SU untuk \`tahun_su\` (perhatikan angka yang mirip seperti \`0\` vs \`8\`, \`6\` vs \`5\`, \`1\` vs \`7\`). Jika tahun ditulis 2 digit pada warkah era 60-an (mis. \`12/64\`), konversi ke 4 digit bila konteksnya jelas (\`"1964"\`).
   - DILARANG mengambil nomor "D.I. 302", "D.I. 307", "Peta Bidang", "Tanggal Validasi/Penomoran", "NIP Pejabat", atau "Luas M2".

3. **Nomor Hak (\`nomor_hak_raw\`) & Kode Jenis Hak (\`kode_jenis_hak_huruf\`):**
   - Lokasi lazim: pojok kanan atas dokumen (di atas/samping judul SURAT UKUR) atau kolom "Penunjuk / Nomor Hak".
   - **Pola A (Format BPN 14 Digit):** \`[2 digit prop].[2 digit kab/kota].[2 digit kec].[2 digit kel].[1 digit kode hak].[5 digit no hak]\`, pemisah bisa titik (\`.\`), tanda hubung (\`-\`), titik tengah (\`·\`), atau spasi. Contoh: \`02.01.05.04.1.02246-\`.
     * Digit ke-9 (tepat sebelum 5 digit terakhir) = \`kode_jenis_hak_angka\` (\`1\`).
     * 5 digit terakhir = \`nomor_hak_raw\` (\`"02246"\`). Pertahankan angka nol di depan!
   - **Pola B (Format Singkatan / SU Tahun 60-an):** Contoh \`HM. 2246\`, \`Hak Milik No. 145\`, \`M.02246\`, \`HGB No. 105\`, \`HP. 12\`.
   - **PEMBEDAAN KRITIS NOMOR HAK vs NIB:**
     * NIB memiliki label "NIB" dan HANYA **13 digit** (\`02.01.05.04.03043\` = 8 digit wilayah + 5 digit nomor bidang) TANPA digit ke-9 jenis hak.
     * JANGAN PERNAH memasukkan angka NIB ke \`nomor_hak_raw\`.

4. **Tabel Konversi Kode Jenis Hak (\`kode_jenis_hak_huruf\`):**
   - \`1\` / \`HM\` / \`Hak Milik\` -> \`"M"\`
   - \`2\` / \`HGU\` / \`Hak Guna Usaha\` -> \`"U"\`
   - \`3\` / \`HGB\` / \`Hak Guna Bangunan\` -> \`"B"\`
   - \`4\` / \`HP\` / \`Hak Pakai\` -> \`"P"\`
   - \`5\` / \`HPL\` / \`Hak Pengelolaan\` -> \`"L"\`
   - \`8\` / \`Wakaf\` / \`W\` -> \`"W"\`
   - Tidak terbaca -> \`null\`

5. **Nama Kecamatan (\`kecamatan_raw\`):**
   - Cari khusus baris berlabel \`"Kecamatan"\`, \`"Kec."\`, atau ejaan lama \`"Ketjamatan"\` / \`"Ketj."\`.
   - DILARANG mengambil baris \`"Kota"\` / \`"Kotamadya"\` / \`"Kabupaten"\` (mis. \`Kota : Medan\` atau \`Kabupaten : Deli Serdang\`) kecuali jika nama Kecamatan itu sendiri memang mengandung nama kota tersebut pada baris Kecamatan (mis. \`Kecamatan : Medan Helvetia\` -> \`"Medan Helvetia"\`, \`Ketjamatan : Medan Baru\` -> \`"Medan Baru"\`).
   - Kembalikan HANYA nama kecamatannya tanpa kata "Kecamatan"/"Ketjamatan".

6. **Nama Kelurahan / Desa (\`kelurahan_raw\`):**
   - Cari label \`"Kelurahan"\`, \`"Kel."\`, \`"Desa"\`, \`"Ds."\`, atau \`"Kampung"\`; ATAU ambil nama desa/kelurahan dari bagian tengah Nomor SU modern (\`06/Helvetia Timur/2007\` -> \`"Helvetia Timur"\`).
   - Kembalikan HANYA nama kelurahan/desa tanpa awalan "Kelurahan"/"Desa"/"Kampung". JANGAN tertukar dengan \`Kecamatan\`.
   - Jika memang tidak tercantum (umum pada SU lama era 60-an) -> \`null\`.

7. **Kejujuran & Confidence Score:**
   - Periksa kembali kesesuaian antara \`raw_evidence\` dan setiap field hasil.
   - Jangan menebak angka yang benar-benar terpotong/tertutup stempel pekat; isi \`null\` dengan confidence rendah (\`0.0\`–\`0.5\`).`;

export const SU_USER_PROMPT =
  "Baca dengan cermat gambar Surat Ukur terlampir. Transkrip terlebih dahulu teks aslinya ke dalam raw_evidence, lalu ekstrak Nomor SU, Tahun SU, Kode Jenis Hak, Nomor Hak, Kecamatan, dan Kelurahan/Desa secara presisi dalam format JSON.";

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
    nib_terdeteksi: {
      type: ["string", "null"],
      description:
        "Angka NIB 13 digit jika terlihat (hanya sebagai verifikasi agar tidak tertukar dengan Nomor Hak 14 digit).",
    },
    is_halaman_data_su: {
      type: "boolean",
      description:
        "True jika gambar memuat Halaman Data SU (termasuk SU lama 1 lembar), False jika murni peta bidang tanpa teks identitas SU.",
    },
    nomor_su_raw: {
      type: ["string", "null"],
      description:
        "Hanya angka nomor urut SU sebelum garis miring pertama (pertahankan angka 0 di depan), contoh: '06' atau '125'.",
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
        "Angka nomor hak (5 digit terakhir tanpa kode wilayah dan tanpa kode hak), contoh: '02246'.",
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
