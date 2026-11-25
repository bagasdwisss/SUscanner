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
      <body className="min-h-full bg-[#F6F5F0] text-[#111111] flex flex-col">
        <a
          href="#main-workspace"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-2xl focus:border-2 focus:border-[#111111] focus:bg-[#FDE047] focus:px-4 focus:py-2 focus:text-sm focus:font-extrabold focus:text-[#111111] focus:shadow-[4px_4px_0px_#111111]"
        >
          Lewati ke area kerja utama
        </a>
        {children}
      </body>
    </html>
  );
}
