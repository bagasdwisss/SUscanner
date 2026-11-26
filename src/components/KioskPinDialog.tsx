"use client";

import { useState } from "react";
import { Lock, LockOpen, ShieldCheck, UserCheck } from "lucide-react";
import { AppDialog } from "./AppDialog";
import {
  disableKioskPin,
  enableKioskPin,
  lockAdminSessionNow,
  saveKioskState,
  verifyKioskPin,
  type KioskLockState,
} from "@/lib/kiosk-lock";

interface KioskPinDialogProps {
  open: boolean;
  onClose: () => void;
  state: KioskLockState;
  unlocked: boolean;
  onUpdateState: (next: KioskLockState, unlocked: boolean) => void;
  onNotify: (kind: "success" | "error", text: string) => void;
}

export function KioskPinDialog({
  open,
  onClose,
  state,
  unlocked,
  onUpdateState,
  onNotify,
}: KioskPinDialogProps) {
  const [operatorDraft, setOperatorDraft] = useState(state.operatorName);
  const [kantahDraft, setKantahDraft] = useState(state.kantahName);
  const [pinInput, setPinInput] = useState("");
  const [confirmPinInput, setConfirmPinInput] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const next: KioskLockState = {
      ...state,
      operatorName: operatorDraft.trim() || "Operator Meja 1",
      kantahName: kantahDraft.trim() || "Kantah Kota Medan",
    };
    saveKioskState(next);
    onUpdateState(next, unlocked);
    onNotify("success", "Identitas operator & Kantah disimpan.");
  };

  const handleEnablePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput.trim().length < 4) {
      onNotify("error", "PIN Admin minimal 4 digit/karakter.");
      return;
    }
    if (pinInput !== confirmPinInput) {
      onNotify("error", "Konfirmasi PIN tidak cocok.");
      return;
    }
    setIsBusy(true);
    try {
      const next = await enableKioskPin(state, pinInput);
      onUpdateState(next, true);
      setPinInput("");
      setConfirmPinInput("");
      onNotify("success", "Mode Kiosk PIN Admin diaktifkan.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBusy(true);
    try {
      const ok = await verifyKioskPin(state, pinInput);
      if (!ok) {
        onNotify("error", "PIN Admin salah.");
        return;
      }
      setPinInput("");
      onUpdateState(state, true);
      onNotify("success", "Akses Admin terbuka selama 30 menit.");
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Profil Operator & Mode Kiosk PIN Admin"
      subtitle="Atur nama petugas untuk laporan Google Sheets/Excel serta kunci perubahan konfigurasi sensitif di komputer kerja bersama."
      maxWidthClass="max-w-xl"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="nb-btn-sm wollo-cta-dark inline-flex min-h-10 items-center px-4 py-2 text-xs"
        >
          Tutup
        </button>
      }
    >
      <div className="space-y-4 text-sm">
        {/* Operator Tagging */}
        <form
          onSubmit={handleSaveProfile}
          className="nb-card space-y-3 bg-white p-4"
        >
          <span className="nb-pill">
            <UserCheck className="h-3.5 w-3.5 text-[#5E17EB]" />
            Identitas Operator &amp; Kantor
          </span>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="nb-micro mb-1 block text-[#4B5563]">
                Nama Operator / Meja
              </label>
              <input
                type="text"
                value={operatorDraft}
                onChange={(e) => setOperatorDraft(e.target.value)}
                placeholder="Misal: Meja 1 - Budi"
                className="su-control w-full rounded-xl px-3 py-1.5 text-xs font-bold"
              />
            </div>
            <div>
              <label className="nb-micro mb-1 block text-[#4B5563]">
                Kantor Pertanahan
              </label>
              <input
                type="text"
                value={kantahDraft}
                onChange={(e) => setKantahDraft(e.target.value)}
                placeholder="Kantah Kota Medan"
                className="su-control w-full rounded-xl px-3 py-1.5 text-xs font-bold"
              />
            </div>
          </div>
          <button
            type="submit"
            className="nb-btn-sm wollo-cta-primary inline-flex min-h-9 items-center px-4 text-xs"
          >
            Simpan Identitas Operator
          </button>
        </form>

        {/* Kiosk Lock Section */}
        <div className="nb-card space-y-3 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="nb-pill">
              <ShieldCheck className="h-3.5 w-3.5 text-[#5E17EB]" />
              Kunci Pengaturan Kiosk
            </span>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                !state.pinEnabled
                  ? "border-[#E5E7EB] bg-[#F6F7F9] text-[#4B5563]"
                  : unlocked
                    ? "border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]"
                    : "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]"
              }`}
            >
              {!state.pinEnabled
                ? "PIN Belum Aktif"
                : unlocked
                  ? "Admin Terbuka"
                  : "Mode Operator (Terkunci)"}
            </span>
          </div>

          <p className="text-xs font-medium text-[#4B5563]">
            Ketika aktif dan terkunci, operator tetap bebas scan/unduh/upload PDF,
            tetapi perubahan URL/Folder Drive, reset kuota AI, dan hapus riwayat
            membutuhkan PIN Admin.
          </p>

          {state.pinEnabled && !unlocked ? (
            <form onSubmit={(e) => void handleUnlock(e)} className="flex gap-2">
              <input
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Masukkan PIN Admin"
                className="su-control min-h-10 flex-1 rounded-xl px-3 font-mono text-sm font-bold"
              />
              <button
                type="submit"
                disabled={isBusy}
                className="nb-btn-sm wollo-cta-primary inline-flex min-h-10 items-center gap-1.5 px-4 text-xs"
              >
                <LockOpen className="h-4 w-4" />
                Buka Kunci
              </button>
            </form>
          ) : state.pinEnabled && unlocked ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  lockAdminSessionNow();
                  onUpdateState(state, false);
                  onNotify("success", "Sesi dikembalikan ke Mode Operator terkunci.");
                }}
                className="nb-btn-sm wollo-cta-dark inline-flex min-h-10 items-center gap-1.5 px-4 text-xs"
              >
                <Lock className="h-4 w-4" />
                Kunci Sekarang (Mode Operator)
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = disableKioskPin(state);
                  onUpdateState(next, true);
                  onNotify("success", "Kunci PIN Admin telah dinonaktifkan.");
                }}
                className="nb-btn-sm inline-flex min-h-10 items-center bg-[#FFF1F2] px-4 text-xs text-[#9F1239]"
              >
                Lepas PIN Admin
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => void handleEnablePin(e)}
              className="space-y-2.5"
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="password"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  placeholder="Buat PIN baru (min 4 karakter)"
                  className="su-control min-h-10 rounded-xl px-3 font-mono text-xs font-bold"
                />
                <input
                  type="password"
                  value={confirmPinInput}
                  onChange={(e) => setConfirmPinInput(e.target.value)}
                  placeholder="Ulangi PIN baru"
                  className="su-control min-h-10 rounded-xl px-3 font-mono text-xs font-bold"
                />
              </div>
              <button
                type="submit"
                disabled={isBusy}
                className="nb-btn-sm wollo-cta-dark inline-flex min-h-10 items-center gap-1.5 px-4 text-xs"
              >
                <Lock className="h-4 w-4" />
                Aktifkan PIN Kiosk Admin
              </button>
            </form>
          )}
        </div>
      </div>
    </AppDialog>
  );
}
