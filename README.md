# SU-Scanner Pro

Aplikasi web pemindai dan penamaan otomatis dokumen **Surat Ukur (SU)** ATR/BPN dalam satu antarmuka terpadu (*split-screen workspace*).

Format output standar arsip:
```text
SU.[5-Digit No SU].[4-Digit Tahun].[Kode Hak].[5-Digit No Hak].pdf
```
Contoh: `SU.00006.2007.M.02246.pdf`

## Fitur Utama

- **Input Cepat (Dual Upload & Kamera):** Mendukung *drag-and-drop*, *multi-select* 2 gambar sekaligus, serta kamera perangkat mobile (`JPG`, `JPEG`, `PNG`, `WEBP`, `HEIC`).
- **Auto-Scan Client-Side:** Deteksi 4 sudut kertas otomatis, koreksi perspektif (*perspective dewarping*), penyesuaian sudut manual dengan kaca pembesar (*loupe*), rotasi `±90°`, tukar Halaman 1 & 2, serta 4 filter pemindaian (`Original`, `Magic Color`, `Grayscale`, `B&W Crisp`) beserta slider kecerahan & kontras.
- **Ekstraksi Vision AI Otomatis:** Membaca Nomor SU, Tahun SU, Kode Jenis Hak (`1=M`, `2=U`, `3=B`, `4=P`, `5=L`, `8=W`), dan Nomor Hak 14 digit (terpisah dari NIB 13 digit) melalui Gemini 2.5 Flash dengan indikator skor keyakinan & deteksi salah urutan halaman.
- **Ekspor PDF Multi-Orientasi:** Menggabungkan Halaman 1 dan Halaman 2 menjadi 1 file PDF di browser (`pdf-lib`) dengan dukungan orientasi campuran (*Landscape/Portrait*) dan kompresi adaptif (`< 1.5 MB`).
- **Riwayat Sesi Lokal:** Menyimpan daftar file hasil ekspor pada IndexedDB browser untuk mencegah duplikasi berkas.

## Menjalankan Secara Lokal

1. Pasang dependensi:
   ```bash
   npm install
   ```
2. Salin `.env.example` menjadi `.env.local` dan isi salah satu API key Vision AI:
   ```env
   GEMINI_API_KEY=isi_api_key_gemini_anda
   ```
   *(Opsional: mendukung `AI_GATEWAY_API_KEY` untuk Vercel AI Gateway. Tanpa API key, fitur pemindaian & penamaan manual tetap bekerja secara offline).*
3. Jalankan server pengembangan:
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
