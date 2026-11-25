export const AI_USAGE_STORAGE_KEY = "su_scanner_ai_usage_v1";
export const DEFAULT_DAILY_AI_QUOTA = 250;

export interface AiUsageLogEntry {
  id: string;
  timestamp: number;
  engine: "gemini" | "local-ocr";
  model: string;
  status: number;
  ok: boolean;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AiUsageStats {
  dayKeyPt: string;
  dailyQuotaLimit: number;
  usedTodayRequests: number;
  totalRequestsAllTime: number;
  successToday: number;
  failedToday: number;
  localOcrToday: number;
  promptTokensToday: number;
  outputTokensToday: number;
  totalTokensToday: number;
  totalTokensAllTime: number;
  lastModelUsed: string | null;
  lastStatusCode: number | null;
  lastRequestAt: number | null;
  recentLogs: AiUsageLogEntry[];
}

function getPacificParts(now: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const pick = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value || "0");
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour") % 24,
    minute: pick("minute"),
    second: pick("second"),
  };
}

/**
 * Returns the YYYY-MM-DD key in Google AI Studio's quota timezone (America/Los_Angeles).
 */
export function getGoogleAiQuotaDayKey(now = new Date()): string {
  const p = getPacificParts(now);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/**
 * Computes the exact time remaining until 00:00 Pacific Time (when Google AI
 * Studio daily RPD quota resets) plus its local WIB (Asia/Jakarta) equivalent.
 */
export function computeNextAiQuotaReset(now = new Date()): {
  remainingMs: number;
  countdownLabel: string;
  wibTimeLabel: string;
  ptDateLabel: string;
} {
  const p = getPacificParts(now);
  const elapsedSecondsInPtDay = p.hour * 3600 + p.minute * 60 + p.second;
  const remainingSeconds = Math.max(60, 86400 - elapsedSecondsInPtDay);
  const remainingMs = remainingSeconds * 1000;
  const nextResetDate = new Date(now.getTime() + remainingMs);

  const hrs = Math.floor(remainingSeconds / 3600);
  const mins = Math.floor((remainingSeconds % 3600) / 60);

  const wibTimeLabel = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(nextResetDate);

  return {
    remainingMs,
    countdownLabel: `${hrs} jam ${mins} mnt`,
    wibTimeLabel: `${wibTimeLabel} WIB`,
    ptDateLabel: getGoogleAiQuotaDayKey(now),
  };
}

export function createInitialAiUsageStats(now?: Date): AiUsageStats {
  return {
    dayKeyPt: now ? getGoogleAiQuotaDayKey(now) : "",
    dailyQuotaLimit: DEFAULT_DAILY_AI_QUOTA,
    usedTodayRequests: 0,
    totalRequestsAllTime: 0,
    successToday: 0,
    failedToday: 0,
    localOcrToday: 0,
    promptTokensToday: 0,
    outputTokensToday: 0,
    totalTokensToday: 0,
    totalTokensAllTime: 0,
    lastModelUsed: null,
    lastStatusCode: null,
    lastRequestAt: null,
    recentLogs: [],
  };
}

/**
 * Ensures daily counters roll over cleanly when Pacific Time crosses midnight.
 */
export function normalizeStatsForCurrentDay(
  stats: AiUsageStats,
  now = new Date(),
): AiUsageStats {
  const currentDay = getGoogleAiQuotaDayKey(now);
  if (stats.dayKeyPt === currentDay) return stats;
  return {
    ...stats,
    dayKeyPt: currentDay,
    usedTodayRequests: 0,
    successToday: 0,
    failedToday: 0,
    localOcrToday: 0,
    promptTokensToday: 0,
    outputTokensToday: 0,
    totalTokensToday: 0,
  };
}

export function loadAiUsageStats(now = new Date()): AiUsageStats {
  try {
    const raw = localStorage.getItem(AI_USAGE_STORAGE_KEY);
    if (!raw) return createInitialAiUsageStats(now);
    const parsed = JSON.parse(raw) as Partial<AiUsageStats>;
    const merged: AiUsageStats = {
      ...createInitialAiUsageStats(now),
      ...parsed,
      recentLogs: Array.isArray(parsed.recentLogs) ? parsed.recentLogs : [],
    };
    return normalizeStatsForCurrentDay(merged, now);
  } catch {
    return createInitialAiUsageStats(now);
  }
}

export function saveAiUsageStats(stats: AiUsageStats): void {
  try {
    localStorage.setItem(AI_USAGE_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Ignore storage unavailability
  }
}

export function recordAiUsageEvent(
  prev: AiUsageStats,
  event: {
    engine: "gemini" | "local-ocr";
    model: string;
    status: number;
    ok: boolean;
    promptTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    now?: Date;
  },
): AiUsageStats {
  const now = event.now ?? new Date();
  const base = normalizeStatsForCurrentDay(prev, now);
  const promptTokens = Math.max(0, event.promptTokens ?? 0);
  const outputTokens = Math.max(0, event.outputTokens ?? 0);
  const totalTokens = Math.max(promptTokens + outputTokens, event.totalTokens ?? 0);

  const entry: AiUsageLogEntry = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: now.getTime(),
    engine: event.engine,
    model: event.model,
    status: event.status,
    ok: event.ok,
    promptTokens,
    outputTokens,
    totalTokens,
  };

  const isGemini = event.engine === "gemini";
  return {
    ...base,
    usedTodayRequests: base.usedTodayRequests + (isGemini ? 1 : 0),
    totalRequestsAllTime: base.totalRequestsAllTime + (isGemini ? 1 : 0),
    successToday: base.successToday + (isGemini && event.ok ? 1 : 0),
    failedToday: base.failedToday + (isGemini && !event.ok ? 1 : 0),
    localOcrToday: base.localOcrToday + (isGemini ? 0 : 1),
    promptTokensToday: base.promptTokensToday + promptTokens,
    outputTokensToday: base.outputTokensToday + outputTokens,
    totalTokensToday: base.totalTokensToday + totalTokens,
    totalTokensAllTime: base.totalTokensAllTime + totalTokens,
    lastModelUsed: event.model,
    lastStatusCode: event.status,
    lastRequestAt: now.getTime(),
    recentLogs: [entry, ...base.recentLogs].slice(0, 12),
  };
}
