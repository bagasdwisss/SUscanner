const KIOSK_STORAGE_KEY = "su_scanner_kiosk_state_v1";
const KIOSK_SESSION_UNLOCK_KEY = "su_scanner_kiosk_unlocked_until";
const MAX_AUDIT_LOGS = 200;

export interface KioskAuditEntry {
  id: string;
  timestamp: number;
  operatorName: string;
  action: string;
  detail: string;
}

export interface KioskLockState {
  pinEnabled: boolean;
  pinHash: string;
  salt: string;
  operatorName: string;
  kantahName: string;
  auditLogs: KioskAuditEntry[];
}

export function createInitialKioskState(): KioskLockState {
  return {
    pinEnabled: false,
    pinHash: "",
    salt: "",
    operatorName: "Operator Meja 1",
    kantahName: "Kantah Kota Medan",
    auditLogs: [],
  };
}

/**
 * Deterministic portable SHA-256 hex digest using Web Crypto when available,
 * with a pure FNV/mixed fallback so PIN locking works even on plain HTTP LAN contexts.
 */
export async function hashKioskPin(pin: string, salt: string): Promise<string> {
  const payload = `su-kiosk::${salt}::${pin.trim()}`;
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.subtle !== "undefined" &&
    typeof TextEncoder !== "undefined"
  ) {
    try {
      const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(payload),
      );
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      // Fallback below
    }
  }

  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ (ch + i), 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

export function loadKioskState(): KioskLockState {
  if (typeof window === "undefined") return createInitialKioskState();
  try {
    const raw = localStorage.getItem(KIOSK_STORAGE_KEY);
    if (!raw) return createInitialKioskState();
    const parsed = JSON.parse(raw) as Partial<KioskLockState>;
    return {
      ...createInitialKioskState(),
      ...parsed,
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
    };
  } catch {
    return createInitialKioskState();
  }
}

export function saveKioskState(state: KioskLockState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KIOSK_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

export function isAdminSessionUnlocked(state: KioskLockState): boolean {
  if (!state.pinEnabled) return true;
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(KIOSK_SESSION_UNLOCK_KEY);
    if (!raw) return false;
    return Number(raw) > Date.now();
  } catch {
    return false;
  }
}

export function setAdminSessionUnlocked(minutes = 30): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      KIOSK_SESSION_UNLOCK_KEY,
      String(Date.now() + minutes * 60_000),
    );
  } catch {
    // Ignore
  }
}

export function lockAdminSessionNow(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KIOSK_SESSION_UNLOCK_KEY);
  } catch {
    // Ignore
  }
}

export async function enableKioskPin(
  state: KioskLockState,
  pin: string,
): Promise<KioskLockState> {
  const clean = pin.trim();
  if (clean.length < 4) {
    throw new Error("PIN Admin minimal 4 digit/karakter.");
  }
  const salt = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const pinHash = await hashKioskPin(clean, salt);
  const next: KioskLockState = {
    ...state,
    pinEnabled: true,
    salt,
    pinHash,
  };
  saveKioskState(next);
  setAdminSessionUnlocked(30);
  return appendKioskAudit(next, "Aktifkan Kunci Kiosk", "PIN Admin diaktifkan.");
}

export async function verifyKioskPin(
  state: KioskLockState,
  pin: string,
): Promise<boolean> {
  if (!state.pinEnabled || !state.pinHash) return true;
  const candidate = await hashKioskPin(pin, state.salt);
  const ok = candidate === state.pinHash;
  if (ok) {
    setAdminSessionUnlocked(30);
  }
  return ok;
}

export function disableKioskPin(state: KioskLockState): KioskLockState {
  const next: KioskLockState = {
    ...state,
    pinEnabled: false,
    pinHash: "",
    salt: "",
  };
  saveKioskState(next);
  lockAdminSessionNow();
  return appendKioskAudit(next, "Nonaktifkan Kunci Kiosk", "PIN Admin dilepas.");
}

export function appendKioskAudit(
  state: KioskLockState,
  action: string,
  detail: string,
): KioskLockState {
  const entry: KioskAuditEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    operatorName: state.operatorName || "Operator",
    action,
    detail,
  };
  const next: KioskLockState = {
    ...state,
    auditLogs: [entry, ...state.auditLogs].slice(0, MAX_AUDIT_LOGS),
  };
  saveKioskState(next);
  return next;
}
