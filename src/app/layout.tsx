import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SU-Scanner Pro — Pemindai & Penamaan Otomatis Surat Ukur",
  description:
    "Aplikasi web pemindai warkah Surat Ukur (SU) ATR/BPN dengan auto-crop perspektif, ekstraksi Vision AI, dan ekspor PDF standar arsip.",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <a
          href="#main-workspace"
          className="visually-hidden fixed left-3 top-3 z-50 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] shadow-lg"
        >
          Lewati ke area kerja utama
        </a>
        {children}
      </body>
    </html>
  );
}
