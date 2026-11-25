# SU-Scanner

Aplikasi web pemindai dan penamaan otomatis dokumen **Surat Ukur (SU)** ATR/BPN dalam tata letak **Soft Neo-Brutalism Bento Grid (Split-Tone)**, dilengkapi integrasi subfolder bertingkat otomatis Google Drive berdasarkan **Kecamatan → Kelurahan/Desa**.

Format output standar arsip:
```text
SU.[5-Digit No SU].[4-Digit Tahun].[Kode Hak].[5-Digit No Hak].pdf
```
Contoh: `SU.00006.2007.M.02246.pdf`

## Fitur Utama

- **Input Fleksibel 1 atau 2 Halaman (Termasuk SU Lama Tahun 60-an):** Mendukung **1 lembar saja** (khusus Surat Ukur lama era 1960-an atau arsip tunggal) maupun **2 halaman** (Data SU + Peta Bidang). Mendukung *drag-and-drop*, *multi-select*, unggah file (`JPG`, `JPEG`, `PNG`, `WEBP`, `HEIC`), dan kamera live (`getUserMedia` + fallback sistem).
- **Auto-Crop & Auto-Scan Full Dokumen (Ujung ke Ujung):** Deteksi 4 sudut tepi kertas otomatis berbasis jarak warna latar, pemangkasan bingkai pemindai, dan kontur Sobel agar latar meja/pinggiran terpotong penuh menyisakan dokumen utuh; dilengkapi penyesuaian sudut manual dengan kaca pembesar (*loupe*), tombol satu-klik **Auto-Crop**, rotasi `±90°`, tukar Halaman 1 & 2, serta 4 filter pemindaian (`Original`, `Magic Color`, `Grayscale`, `B&W Crisp`) beserta slider kecerahan & kontras.
- **Sidebar Usage AI & Kuota Harian:** Memantau total kuota harian, jumlah pemakaian Gemini AI & OCR lokal, sisa kuota, jumlah token input/output dari respons API, log permintaan terbaru, serta hitung mundur jadwal reset harian Google AI Studio (`00:00 Pacific Time` / WIB).
- **Ekstraksi Vision AI + OCR Cadangan Bawaan (`tesseract.js`):** Membaca Nomor SU, Tahun SU (1960–sekarang), Kode Jenis Hak (`1=M`, `2=U`, `3=B`, `4=P`, `5=L`, `8=W`), Nomor Hak 14 digit / singkatan lama (`HM. 145`) yang dipisahkan dari NIB 13 digit, serta nama **Kecamatan** (termasuk ejaan lama *Ketjamatan*) dan **Kelurahan/Desa** melalui Gemini Vision AI, dengan cadangan otomatis ke **OCR Lokal `tesseract.js`** di browser tanpa membutuhkan API key eksternal.
- **Arsip Subfolder Bertingkat Google Drive (Kecamatan → Kelurahan):** Menemukan atau membuat subfolder Kecamatan (mis. `/Medan Helvetia/`) dan di dalamnya subfolder Kelurahan/Desa (mis. `/Helvetia Timur/`) secara case-insensitive & ternormalisasi di dalam folder induk Google Drive tujuan (`1D5fIBh9sa8cD1QBTL1J3NoRw6NWDudub`) dan mengunggah PDF langsung melalui URL Google Apps Script Web App yang sudah tertanam di sistem ([docs/google-apps-script-drive.gs](docs/google-apps-script-drive.gs)) maupun OAuth2 / Service Account. Jika subfolder Kecamatan atau Kelurahan sudah ada di Drive, berkas langsung dimasukkan tanpa membuat folder duplikat.
- **Ekspor PDF Multi-Orientasi:** Menggabungkan 1 atau 2 halaman menjadi 1 file PDF di browser (`pdf-lib`) dengan dukungan orientasi campuran (*Landscape/Portrait*) dan kompresi adaptif (`< 1.5 MB`).
- **Riwayat Sesi Lokal:** Menyimpan daftar ekspor PDF (beserta nama Kecamatan, Kelurahan, & tautan Drive) pada IndexedDB browser untuk mencegah duplikasi berkas.

## API Routes

- `POST /api/extract-su`: Ekstraksi entitas Surat Ukur, Kecamatan, dan Kelurahan dari gambar teroptimasi via Gemini Vision (`@google/genai` dengan fallback model otomatis).
- `GET /api/drive/status`: Memeriksa konfigurasi autentikasi Drive di server dan folder induk default.
- `POST /api/drive/upload`: Memvalidasi PDF Base64 + nama Kecamatan & Kelurahan opsional, membuat/menggunakan ulang subfolder bertingkat `Kecamatan / Kelurahan` pada Google Drive induk, lalu mengunggah PDF.

## Menjalankan Secara Lokal

1. Pasang dependensi:
   ```bash
   npm install
   ```
2. Salin `.env.example` menjadi `.env.local` dan isi `GEMINI_API_KEY`:
   ```env
   GEMINI_API_KEY=isi_api_key_gemini_anda
   GOOGLE_DRIVE_ROOT_FOLDER_ID=1D5fIBh9sa8cD1QBTL1J3NoRw6NWDudub
   ```
3. *(Opsional untuk Auto-Subfolder Google Drive)*:
   - Cara termudah untuk Drive pribadi: salin [docs/google-apps-script-drive.gs](docs/google-apps-script-drive.gs) ke [script.google.com](https://script.google.com/home), Deploy sebagai Web App (`Execute as: Me`, `Who has access: Anyone`), lalu masukkan URL `/exec` ke menu **Google Drive** di aplikasi atau ke `GOOGLE_DRIVE_APPS_SCRIPT_URL` di `.env.local`.
4. Jalankan server pengembangan:
   ```bash
   npm run dev
   ```
   Buka `http://localhost:3000`.

## Pengujian & Build

```bash
npx tsc --noEmit
npm test
npm run lint
npm run build
```
