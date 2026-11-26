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
  isAdminUnlocked?: boolean;
  onRequirePinUnlock?: () => void;
}

export function AiUsageSidebar({
  open,
  onClose,
  stats,
  onUpdateDailyLimit,
  onResetLocalCounters,
  isAdminUnlocked = true,
  onRequirePinUnlock,
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
    if (!isAdminUnlocked) {
      onRequirePinUnlock?.();
      return;
    }
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
        className="fixed inset-0 bg-[#111114]/45 backdrop-blur-xs"
      />

      {/* Dedicated Right Side Bar Panel */}
      <aside
        role="region"
        aria-labelledby={headingId}
        className="relative z-10 flex h-dvh w-full max-w-md flex-col border-l border-[#E5E7EB] bg-[#F9FAFB] shadow-[-16px_0_36px_rgba(17,17,20,0.14)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] bg-white px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#DDD6FE] bg-[#F5F3FF] text-[#5E17EB]">
              <Activity className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id={headingId}
                className="text-base font-bold tracking-tight text-[#111114]"
              >
                Sidebar Usage AI &amp; Kuota
              </h2>
              <p className="text-[11px] font-medium text-[#4B5563]">
                Pemantauan request, token &amp; jadwal reset harian
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Sidebar Usage AI"
            className="nb-btn-sm inline-flex min-h-9 min-w-9 items-center justify-center bg-[#F6F7F9] text-[#111114] hover:bg-[#E5E7EB]"
          >
            <X className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 [overscroll-behavior:contain]">
          {/* Card 1: Kuota & Terpakai */}
          <div className="nb-card space-y-3 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="nb-pill border-[#DDD6FE] bg-[#F5F3FF] text-[#4C0FD1]">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                KUOTA AI HARIAN
              </span>
              <span className="rounded-full border border-[#E5E7EB] bg-[#F6F7F9] px-2.5 py-0.5 font-mono text-xs font-bold text-[#111114]">
                {pct}% Terpakai
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] p-2.5">
                <span className="nb-micro block text-[10px] text-[#4B5563]">
                  TOTAL KUOTA
                </span>
                <span className="mt-0.5 block font-mono text-xl font-extrabold text-[#111114]">
                  {limit}
                </span>
              </div>
              <div className="rounded-xl border border-[#DDD6FE] bg-[#F5F3FF] p-2.5">
                <span className="nb-micro block text-[10px] text-[#4C0FD1]">
                  DIGUNAKAN
                </span>
                <span className="mt-0.5 block font-mono text-xl font-extrabold text-[#4C0FD1]">
                  {used}
                </span>
              </div>
              <div className="rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] p-2.5">
                <span className="nb-micro block text-[10px] text-[#065F46]">
                  SISA KUOTA
                </span>
                <span className="mt-0.5 block font-mono text-xl font-extrabold text-[#065F46]">
                  {remaining}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <progress
                aria-label="Persentase pemakaian kuota AI harian"
                value={used}
                max={limit}
                className="su-progress h-2.5 w-full"
              />
              <div className="flex items-center justify-between text-[11px] font-medium text-[#4B5563]">
                <span>Sukses Gemini: {stats.successToday}</span>
                <span>Gagal/Limit: {stats.failedToday}</span>
                <span>Total Sesi: {stats.totalRequestsAllTime}</span>
              </div>
            </div>

            {/* Target Limit Customizer */}
            <form
              onSubmit={handleSaveLimit}
              className="flex items-end gap-2 rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] p-2.5"
            >
              <div className="flex-1">
                <label
                  htmlFor={limitInputId}
                  className="nb-micro block text-[10px] text-[#4B5563]"
                >
                  Atur Batas Kuota Harian (sesuai tier Google AI Anda)
                </label>
                <input
                  id={limitInputId}
                  type="text"
                  inputMode="numeric"
                  value={limitDraft}
                  onChange={(e) => setLimitDraft(e.target.value.replace(/\D/g, ""))}
                  className="mt-1 w-full rounded-lg border border-[#D1D5DB] bg-white px-2.5 py-1 font-mono text-xs font-bold text-[#111114]"
                />
              </div>
              <button
                type="submit"
                className="nb-btn-sm wollo-cta-primary min-h-9 px-3.5 py-1.5 text-xs"
              >
                Simpan
              </button>
            </form>
          </div>

          {/* Card 2: Jadwal Reset Harian */}
          <div className="nb-card space-y-2.5 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="nb-pill">
                <Clock className="h-3 w-3 text-[#5E17EB]" aria-hidden="true" />
                WAKTU RESET KUOTA
              </span>
              <span className="rounded-full border border-[#E5E7EB] bg-[#F6F7F9] px-2.5 py-0.5 font-mono text-xs font-bold text-[#111114]">
                {resetInfo ? resetInfo.wibTimeLabel : "15:00 WIB"}
              </span>
            </div>

            <div className="rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] p-3">
              <p className="nb-micro text-[10px] text-[#4B5563]">
                RESET BERIKUTNYA DALAM
              </p>
              <p className="mt-0.5 font-mono text-2xl font-extrabold text-[#111114]">
                {resetInfo ? resetInfo.countdownLabel : "Menghitung…"}
              </p>
              <p className="mt-1 text-xs font-medium text-[#4B5563]">
                Kuota harian Google AI Studio direset setiap pukul{" "}
                <strong className="text-[#111114]">00:00 Waktu Pasifik (PT)</strong> (sekitar{" "}
                <strong className="text-[#111114]">{resetInfo ? resetInfo.wibTimeLabel : "15:00 WIB"}</strong>). Siklus aktif:{" "}
                <code className="font-mono font-bold text-[#111114]">
                  {resetInfo ? resetInfo.ptDateLabel : stats.dayKeyPt || "—"}
                </code>
                .
              </p>
            </div>
          </div>

          {/* Card 3: Token & OCR Lokal Cadangan */}
          <div className="nb-card space-y-2.5 bg-white p-4">
            <span className="nb-pill">
              <Cpu className="h-3 w-3 text-[#5E17EB]" aria-hidden="true" />
              RINCIAN TOKEN &amp; OCR LOKAL
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] p-2.5">
                <span className="nb-micro block text-[10px] text-[#4B5563]">
                  TOKEN HARI INI
                </span>
                <span className="mt-0.5 block font-mono text-base font-extrabold text-[#111114]">
                  {stats.totalTokensToday.toLocaleString("id-ID")}
                </span>
                <span className="text-[11px] font-medium text-[#4B5563]">
                  In: {stats.promptTokensToday.toLocaleString("id-ID")} · Out:{" "}
                  {stats.outputTokensToday.toLocaleString("id-ID")}
                </span>
              </div>

              <div className="rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] p-2.5">
                <span className="nb-micro block text-[10px] text-[#4B5563]">
                  OCR LOKAL (GRATIS)
                </span>
                <span className="mt-0.5 block font-mono text-base font-extrabold text-[#111114]">
                  {stats.localOcrToday} kali
                </span>
                <span className="text-[11px] font-medium text-[#4B5563]">
                  Tanpa kuota API
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[#4B5563]">Model Terakhir:</span>
                <span className="font-mono font-bold text-[#111114]">
                  {stats.lastModelUsed || "Belum ada"}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="font-medium text-[#4B5563]">Total Token Akumulasi:</span>
                <span className="font-mono font-bold text-[#111114]">
                  {stats.totalTokensAllTime.toLocaleString("id-ID")}
                </span>
              </div>
            </div>
          </div>

          {/* Card 4: Log Terakhir & Dashboard Resmi */}
          <div className="nb-card space-y-3 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="nb-pill">AKTIVITAS TERBARU</span>
              <a
                href="https://aistudio.google.com/usage"
                target="_blank"
                rel="noopener noreferrer"
                className="nb-btn-sm inline-flex min-h-8 items-center gap-1 bg-white px-2.5 py-1 text-[11px] text-[#5E17EB] hover:bg-[#F5F3FF]"
              >
                Cek Kuota Resmi AI Studio
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>

            {stats.recentLogs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#D1D5DB] p-3 text-center text-xs font-medium text-[#4B5563]">
                Belum ada riwayat pemakaian AI/OCR di sesi browser ini.
              </p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {stats.recentLogs.slice(0, 6).map((log) => (
                  <li
                    key={log.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[#E5E7EB] bg-[#F6F7F9] px-2.5 py-1.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] font-bold text-[#111114]">
                        {log.engine === "gemini" ? "Gemini" : "OCR Lokal"} ·{" "}
                        {log.model}
                      </p>
                      <p className="text-[10px] font-medium text-[#4B5563]">
                        {new Date(log.timestamp).toLocaleTimeString("id-ID")} ·{" "}
                        {log.totalTokens > 0
                          ? `${log.totalTokens} token`
                          : "Gratis"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold ${
                        log.ok
                          ? "border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]"
                          : "border-[#FECDD3] bg-[#FFF1F2] text-[#9F1239]"
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
              onClick={() => {
                if (!isAdminUnlocked) {
                  onRequirePinUnlock?.();
                  return;
                }
                onResetLocalCounters();
              }}
              className="nb-btn-sm inline-flex min-h-9 w-full items-center justify-center gap-1.5 bg-[#F6F7F9] px-3 py-1.5 text-xs text-[#4B5563] hover:bg-white hover:text-[#111114]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset Catatan Pemakaian Lokal
            </button>

            <p className="text-[11px] font-medium text-[#4B5563]">
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
