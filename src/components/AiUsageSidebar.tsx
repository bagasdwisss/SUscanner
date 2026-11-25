"use client";

import { useEffect, useId, useState } from "react";
import {
  Activity,
  Clock,
  Cpu,
  ExternalLink,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import {
  computeNextAiQuotaReset,
  type AiUsageStats,
} from "@/lib/ai-usage";

interface AiUsageSidebarProps {
  open: boolean;
  onClose: () => void;
  stats: AiUsageStats;
  onUpdateDailyLimit: (newLimit: number) => void;
  onResetLocalCounters: () => void;
}

export function AiUsageSidebar({
  open,
  onClose,
  stats,
  onUpdateDailyLimit,
  onResetLocalCounters,
}: AiUsageSidebarProps) {
  const [limitDraft, setLimitDraft] = useState(String(stats.dailyQuotaLimit));
  const [tickMs, setTickMs] = useState<number | null>(null);
  const limitInputId = useId();
  const headingId = useId();

  useEffect(() => {
    if (!open) return;
    Promise.resolve().then(() => setTickMs(Date.now()));
    const interval = setInterval(() => {
      setTickMs(Date.now());
    }, 15_000);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearInterval(interval);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const limit = Math.max(1, stats.dailyQuotaLimit);
  const used = stats.usedTodayRequests;
  const remaining = Math.max(0, limit - used);
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const resetInfo = tickMs ? computeNextAiQuotaReset(new Date(tickMs)) : null;

  const handleSaveLimit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(limitDraft.replace(/\D/g, ""));
    if (Number.isFinite(num) && num >= 1 && num <= 100_000) {
      onUpdateDailyLimit(num);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 bg-[#111111]/55 backdrop-blur-[2px]"
      />

      {/* Dedicated Right Side Bar Panel */}
      <aside
        role="region"
        aria-labelledby={headingId}
        className="relative z-10 flex h-dvh w-full max-w-md flex-col border-l-2 border-[#111111] bg-[#F6F5F0] shadow-[-6px_0px_0px_#111111]"
      >
        <header className="nb-dark-sidebar flex items-center justify-between gap-3 border-b-2 border-[#111111] px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-[#F6F5F0] bg-[#D9F99D] text-[#111111]">
              <Activity className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id={headingId}
                className="text-base font-black tracking-tight text-[#F6F5F0]"
              >
                Sidebar Usage AI &amp; Kuota
              </h2>
              <p className="text-[11px] font-bold text-[#FEF08A]">
                Pemantauan pemakaian request, token &amp; jadwal reset harian
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Sidebar Usage AI"
            className="nb-btn-sm inline-flex min-h-10 min-w-10 items-center justify-center bg-white text-[#111111] hover:bg-[#FBCFE8]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 [overscroll-behavior:contain]">
          {/* Bento Card 1: Kuota & Terpakai */}
          <div className="nb-card space-y-3 bg-[#FEF08A] p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="nb-pill">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                KUOTA AI HARIAN
              </span>
              <span className="rounded-full border-2 border-[#111111] bg-white px-2.5 py-0.5 font-mono text-xs font-black text-[#111111]">
                {pct}% Terpakai
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border-2 border-[#111111] bg-white p-2.5">
                <span className="nb-micro block text-[10px] text-[#3F3F46]">
                  TOTAL KUOTA
                </span>
                <span className="mt-0.5 block font-mono text-xl font-black text-[#111111]">
                  {limit}
                </span>
              </div>
              <div className="rounded-xl border-2 border-[#111111] bg-[#FBCFE8] p-2.5">
                <span className="nb-micro block text-[10px] text-[#111111]">
                  DIGUNAKAN
                </span>
                <span className="mt-0.5 block font-mono text-xl font-black text-[#111111]">
                  {used}
                </span>
              </div>
              <div className="rounded-xl border-2 border-[#111111] bg-[#D9F99D] p-2.5">
                <span className="nb-micro block text-[10px] text-[#111111]">
                  SISA KUOTA
                </span>
                <span className="mt-0.5 block font-mono text-xl font-black text-[#111111]">
                  {remaining}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <progress
                aria-label="Persentase pemakaian kuota AI harian"
                value={used}
                max={limit}
                className="su-progress h-3 w-full"
              />
              <div className="flex items-center justify-between text-[11px] font-bold text-[#111111]/85">
                <span>Sukses Gemini: {stats.successToday}</span>
                <span>Gagal/Limit: {stats.failedToday}</span>
                <span>Total Sesi: {stats.totalRequestsAllTime}</span>
              </div>
            </div>

            {/* Target Limit Customizer */}
            <form
              onSubmit={handleSaveLimit}
              className="flex items-end gap-2 rounded-xl border-2 border-[#111111] bg-white p-2.5"
            >
              <div className="flex-1">
                <label
                  htmlFor={limitInputId}
                  className="nb-micro block text-[10px] text-[#3F3F46]"
                >
                  Atur Batas Kuota Harian (sesuai tier Google AI Anda)
                </label>
                <input
                  id={limitInputId}
                  type="text"
                  inputMode="numeric"
                  value={limitDraft}
                  onChange={(e) => setLimitDraft(e.target.value.replace(/\D/g, ""))}
                  className="mt-1 w-full rounded-lg border-2 border-[#111111] bg-[#F6F5F0] px-2.5 py-1 font-mono text-xs font-extrabold text-[#111111]"
                />
              </div>
              <button
                type="submit"
                className="nb-btn-sm min-h-9 bg-[#D9F99D] px-3 py-1.5 text-xs text-[#111111]"
              >
                Simpan
              </button>
            </form>
          </div>

          {/* Bento Card 2: Jadwal Reset Harian */}
          <div className="nb-card space-y-2.5 bg-[#BAE6FD] p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="nb-pill">
                <Clock className="h-3 w-3" aria-hidden="true" />
                WAKTU RESET KUOTA
              </span>
              <span className="rounded-full border-2 border-[#111111] bg-white px-2.5 py-0.5 font-mono text-xs font-black text-[#111111]">
                {resetInfo ? resetInfo.wibTimeLabel : "15:00 WIB"}
              </span>
            </div>

            <div className="rounded-xl border-2 border-[#111111] bg-white p-3">
              <p className="nb-micro text-[10px] text-[#3F3F46]">
                RESET BERIKUTNYA DALAM
              </p>
              <p className="mt-0.5 font-mono text-2xl font-black text-[#111111]">
                {resetInfo ? resetInfo.countdownLabel : "Menghitung…"}
              </p>
              <p className="mt-1 text-xs font-semibold text-[#3F3F46]">
                Kuota harian Google AI Studio direset setiap pukul{" "}
                <strong>00:00 Waktu Pasifik (PT)</strong> (sekitar{" "}
                <strong>{resetInfo ? resetInfo.wibTimeLabel : "15:00 WIB"}</strong>). Siklus aktif:{" "}
                <code className="font-mono font-bold">
                  {resetInfo ? resetInfo.ptDateLabel : stats.dayKeyPt || "—"}
                </code>
                .
              </p>
            </div>
          </div>

          {/* Bento Card 3: Token & OCR Lokal Cadangan */}
          <div className="nb-card space-y-2.5 bg-[#D9F99D] p-4">
            <span className="nb-pill">
              <Cpu className="h-3 w-3" aria-hidden="true" />
              RINCIAN TOKEN &amp; OCR LOKAL
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border-2 border-[#111111] bg-white p-2.5">
                <span className="nb-micro block text-[10px] text-[#3F3F46]">
                  TOKEN HARI INI
                </span>
                <span className="mt-0.5 block font-mono text-base font-black text-[#111111]">
                  {stats.totalTokensToday.toLocaleString("id-ID")}
                </span>
                <span className="text-[11px] font-semibold text-[#3F3F46]">
                  In: {stats.promptTokensToday.toLocaleString("id-ID")} · Out:{" "}
                  {stats.outputTokensToday.toLocaleString("id-ID")}
                </span>
              </div>

              <div className="rounded-xl border-2 border-[#111111] bg-white p-2.5">
                <span className="nb-micro block text-[10px] text-[#3F3F46]">
                  OCR LOKAL (GRATIS)
                </span>
                <span className="mt-0.5 block font-mono text-base font-black text-[#111111]">
                  {stats.localOcrToday} kali
                </span>
                <span className="text-[11px] font-semibold text-[#3F3F46]">
                  Tanpa kuota API
                </span>
              </div>
            </div>

            <div className="rounded-xl border-2 border-[#111111] bg-white px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#3F3F46]">Model Terakhir:</span>
                <span className="font-mono font-extrabold text-[#111111]">
                  {stats.lastModelUsed || "Belum ada"}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="font-bold text-[#3F3F46]">Total Token Akumulasi:</span>
                <span className="font-mono font-extrabold text-[#111111]">
                  {stats.totalTokensAllTime.toLocaleString("id-ID")}
                </span>
              </div>
            </div>
          </div>

          {/* Bento Card 4: Log Terakhir & Dashboard Resmi */}
          <div className="nb-card space-y-3 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="nb-pill">AKTIVITAS TERBARU</span>
              <a
                href="https://aistudio.google.com/usage"
                target="_blank"
                rel="noopener noreferrer"
                className="nb-btn-sm inline-flex min-h-8 items-center gap-1 bg-[#FBCFE8] px-2.5 py-1 text-[11px] text-[#111111]"
              >
                Cek Kuota Resmi AI Studio
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>

            {stats.recentLogs.length === 0 ? (
              <p className="rounded-xl border-2 border-dashed border-[#111111]/40 p-3 text-center text-xs font-semibold text-[#3F3F46]">
                Belum ada riwayat pemakaian AI/OCR di sesi browser ini.
              </p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {stats.recentLogs.slice(0, 6).map((log) => (
                  <li
                    key={log.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[#111111] bg-[#F6F5F0] px-2.5 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] font-extrabold text-[#111111]">
                        {log.engine === "gemini" ? "Gemini" : "OCR Lokal"} ·{" "}
                        {log.model}
                      </p>
                      <p className="text-[10px] font-semibold text-[#3F3F46]">
                        {new Date(log.timestamp).toLocaleTimeString("id-ID")} ·{" "}
                        {log.totalTokens > 0
                          ? `${log.totalTokens} token`
                          : "Gratis"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border border-[#111111] px-2 py-0.5 font-mono text-[10px] font-black ${
                        log.ok ? "bg-[#D9F99D]" : "bg-[#FECACA]"
                      }`}
                    >
                      {log.ok ? `${log.status} OK` : `${log.status}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={onResetLocalCounters}
              className="nb-btn-sm inline-flex min-h-9 w-full items-center justify-center gap-1.5 bg-[#F6F5F0] px-3 py-1.5 text-xs text-[#111111]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset Catatan Pemakaian Lokal
            </button>

            <p className="text-[11px] font-medium text-[#3F3F46]">
              Catatan: Google AI Studio tidak menyediakan endpoint API publik untuk
              sisa kuota cloud secara langsung, sehingga hitungan di atas dilacak
              akurat per request di aplikasi dan disinkronkan dengan jadwal reset
              00:00 Pacific Time Google.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
