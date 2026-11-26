import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SU-Scanner — Pemindai & Penamaan Otomatis Surat Ukur",
  description:
    "Aplikasi web pemindai warkah Surat Ukur (SU) ATR/BPN dengan auto-crop perspektif, ekstraksi Vision AI, dan ekspor PDF standar arsip.",
};

export const viewport: Viewport = {
  colorScheme: "light",
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
      <body className="min-h-full bg-[#FFFFFF] text-[#111114] flex flex-col selection:bg-[#5E17EB] selection:text-white">
        <a
          href="#main-workspace"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-[10px] focus:border focus:border-[#4C0FD1] focus:bg-[#5E17EB] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-[0_8px_20px_-4px_rgba(94,23,235,0.35)]"
        >
          Lewati ke area kerja utama
        </a>
        {children}
      </body>
    </html>
  );
}
