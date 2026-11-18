export const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:3001";

interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

/** HTTP durum kodunu taşıyan hata; 409 çakışması buna göre ele alınır. */
export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export async function apiFetch<T>(
  endpoint: string,
  options: ApiOptions = {},
): Promise<T> {
  const { method = "GET", body, token } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    // Durum sorguları tarayıcı önbelleğinden gelmesin; yeni mentor mesajı
    // üretildiğinde ekran hemen güncellensin.
    cache: method === "GET" ? "no-store" : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "API hatası" }));
    throw new ApiError(error.error || `HTTP ${res.status}`, res.status, error);
  }

  return res.json();
}

// Auth
export const authApi = {
  googleLogin: (data: { idToken: string }) =>
    apiFetch<{
      token: string;
      user: { id: string; email: string; name: string; avatar?: string };
    }>("/api/auth/google", { method: "POST", body: data }),

  emailLogin: (data: { idToken: string; name?: string }) =>
    apiFetch<{
      token: string;
      user: { id: string; email: string; name: string };
    }>("/api/auth/email", { method: "POST", body: data }),

  getMe: (token: string) =>
    apiFetch<{ id: string; email: string; name: string; avatar?: string }>(
      "/api/auth/me",
      { token },
    ),
};

// Routines
export interface RoutineTaskDTO {
  _id: string;
  title: string;
  startTime?: number;
  endTime?: number;
  originalDuration?: number;
  estimatedMinutes?: number;
  color: string;
  status: string;
  startedAt?: number;
  pausedAt?: number;
  pausedDuration: number;
  flowExtensions: number;
}

export interface RoutineDTO {
  _id: string;
  date: string;
  tasks: RoutineTaskDTO[];
  dayEndTime: number;
  streak: number;
  /** Eşzamanlı kayıt çakışmalarını yakalamak için sürüm numarası. */
  revision?: number;
}

export const routineApi = {
  get: (date: string, token: string) =>
    apiFetch<RoutineDTO | null>(`/api/routines/${date}`, { token }),

  save: (
    data: {
      date: string;
      tasks: unknown[];
      dayEndTime: number;
      streak: number;
      /** İstemcinin bildiği son sürüm; eşleşmezse sunucu 409 döner. */
      baseRevision?: number;
    },
    token: string,
  ) =>
    apiFetch<{ revision?: number } | null>("/api/routines", {
      method: "POST",
      body: data,
      token,
    }),

  appendTask: (date: string, task: unknown, token: string) =>
    apiFetch<{ ok: boolean; date: string }>(
      `/api/routines/${date}/append-task`,
      { method: "POST", body: { task }, token },
    ),

  missedRepeats: (token: string) =>
    apiFetch<{
      missed: Array<{
        date: string;
        taskId: string;
        title: string;
        color: string;
        repeat: string;
        startTime: number | null;
        endTime: number | null;
        originalDuration: number | null;
      }>;
    }>("/api/routines/missed-repeats", { token }),

  handleMissed: (
    date: string,
    taskId: string,
    action: "move" | "skip" | "delete",
    token: string,
  ) =>
    apiFetch<{ ok: boolean }>(`/api/routines/${date}/missed-action`, {
      method: "POST",
      body: { taskId, action },
      token,
    }),

  unfinished: (token: string, date?: string) =>
    apiFetch<{
      date: string;
      tasks: Array<{
        date: string;
        taskId: string;
        title: string;
        color: string;
        status: string;
        priority: string;
        category: string;
        startTime: number | null;
        endTime: number | null;
        estimatedMinutes: number | null;
        subtaskCount: number;
      }>;
    }>(`/api/routines/unfinished${date ? `?date=${date}` : ""}`, { token }),

  carryAll: (
    date: string,
    action: "move" | "skip",
    token: string,
    targetDate?: string,
  ) =>
    apiFetch<{ ok: boolean; moved?: number; skipped?: number }>(
      `/api/routines/${date}/carry-all`,
      {
        method: "POST",
        body: targetDate ? { action, targetDate } : { action },
        token,
      },
    ),

  archive: (token: string, limit = 20) =>
    apiFetch<{
      items: Array<{
        id: string;
        dateKey: string;
        removedAt: number;
        title: string;
        color: string;
      }>;
    }>(`/api/routines/archive?limit=${limit}`, { token }),

  restoreArchived: (id: string, token: string) =>
    apiFetch<{ ok: boolean }>(`/api/routines/archive/${id}/restore`, {
      method: "POST",
      token,
    }),

  horizon: (token: string, days = 7) =>
    apiFetch<{
      days: Array<{
        date: string;
        tasks: Array<{
          title: string;
          color: string;
          status: string;
          startTime: number | null;
          endTime: number | null;
          estimatedMinutes: number | null;
        }>;
      }>;
    }>(`/api/routines/horizon?days=${days}`, { token }),

  dayFull: (date: string, token: string) =>
    apiFetch<{
      date: string;
      dayEndTime: number;
      streak: number;
      isToday: boolean;
      tasks: Array<{
        id: string;
        title: string;
        color: string;
        status: string;
        startTime: number | null;
        endTime: number | null;
        estimatedMinutes: number | null;
        priority: string;
        category: string;
        repeat: string | null;
        sourceDate?: string;
        subtaskCount?: number;
        virtual: boolean;
      }>;
    }>(`/api/routines/day-full?date=${date}`, { token }),

  calendarMonth: (anchor: string, token: string) =>
    apiFetch<{
      view: "month";
      year: number;
      month: number;
      today: string;
      days: Array<{
        date: string;
        planned: number;
        done: number;
        open: number;
        repeats: number;
        total: number;
      }>;
    }>(`/api/routines/calendar?view=month&anchor=${anchor}`, { token }),

  calendarYear: (year: number, token: string) =>
    apiFetch<{
      view: "year";
      year: number;
      today: string;
      months: Array<{
        month: number;
        planned: number;
        done: number;
        open: number;
        total: number;
      }>;
    }>(`/api/routines/calendar?view=year&anchor=${year}-01-01`, { token }),

  taskUpdate: (
    date: string,
    taskId: string,
    patch: {
      status?: string;
      title?: string;
      startTime?: number | null;
      endTime?: number | null;
      estimatedMinutes?: number | null;
      /** Verilirse görev bu güne taşınır. */
      date?: string;
    },
    token: string,
  ) =>
    apiFetch<{ ok: boolean; movedTo?: string }>(
      `/api/routines/${date}/task-update`,
      { method: "POST", body: { taskId, patch }, token },
    ),

  taskDuplicate: (date: string, taskId: string, token: string) =>
    apiFetch<{ ok: boolean }>(`/api/routines/${date}/task-duplicate`, {
      method: "POST",
      body: { taskId },
      token,
    }),

  taskDelete: (date: string, taskId: string, token: string) =>
    apiFetch<{ ok: boolean }>(`/api/routines/${date}/task-delete`, {
      method: "POST",
      body: { taskId },
      token,
    }),

  getStreak: (token: string) =>
    apiFetch<{
      currentStreak: number;
      completedDates: string[];
      todayIsCompleted: boolean;
    }>("/api/routines/streak", { token }),

  getHistory: (token: string, limit = 30) =>
    apiFetch<RoutineDTO[]>(`/api/routines/history?limit=${limit}`, {
      token,
    }),

  deleteAll: (token: string) =>
    apiFetch<{ success: boolean }>("/api/routines", {
      method: "DELETE",
      token,
    }),
};

// Günlük otomatik yedekler (sunucu, son 7 gün)
export const backupApi = {
  list: (token: string) =>
    apiFetch<{
      items: Array<{
        id: string;
        dateKey: string;
        createdAt: string;
        days: number;
        tasks: number;
      }>;
    }>("/api/backups", { token }),

  restore: (id: string, token: string) =>
    apiFetch<{ ok: boolean; restored: number }>(`/api/backups/${id}/restore`, {
      method: "POST",
      token,
    }),
};

// Web Push
export const pushApi = {
  key: () =>
    apiFetch<{ publicKey: string | null; enabled: boolean }>("/api/push/key"),

  subscribe: (subscription: PushSubscriptionJSON, token: string) =>
    apiFetch<{ ok: boolean; enabled: boolean }>("/api/push/subscribe", {
      method: "POST",
      body: { subscription },
      token,
    }),

  unsubscribe: (endpoint: string | undefined, token: string) =>
    apiFetch<{ ok: boolean }>("/api/push/unsubscribe", {
      method: "POST",
      body: endpoint ? { endpoint } : {},
      token,
    }),

  status: (token: string) =>
    apiFetch<{ subscribed: number; enabled: boolean }>("/api/push/status", {
      token,
    }),

  test: (token: string) =>
    apiFetch<{ ok: boolean; sent: number; total: number }>("/api/push/test", {
      method: "POST",
      token,
    }),

  /** Odak sayacı açıkken "uygulama görünür" sinyali. */
  focusPing: (token: string) =>
    apiFetch<{ ok: boolean }>("/api/push/focus-ping", {
      method: "POST",
      token,
    }),
};

// AI
export const aiApi = {
  generateRoutine: (prompt: string, token?: string) =>
    apiFetch<{
      tasks: Array<{ title: string; startHHMM: string; endHHMM: string }>;
      source?: "ai" | "demo" | "fallback";
    }>("/api/generate-routine", { method: "POST", body: { prompt }, token }),
};

// AI Accountability
export const accountabilityApi = {
  getState: (token: string, date?: string) =>
    apiFetch<import("@/types").AccountabilityState>(
      `/api/accountability/state${date ? `?date=${date}` : ""}`,
      { token },
    ),

  getSettings: (token: string) =>
    apiFetch<import("@/types").MentorSettings>(
      "/api/accountability/settings",
      { token },
    ),

  updateSettings: (
    patch: Partial<import("@/types").MentorSettings>,
    token: string,
  ) =>
    apiFetch<{
      settings: import("@/types").MentorSettings;
      nextCheckAt: number | null;
    }>("/api/accountability/settings", { method: "PUT", body: patch, token }),

  requestCheck: (token: string) =>
    apiFetch<{
      check: import("@/types").MentorCheck;
      throttled: boolean;
      retryAfterMs?: number;
    }>("/api/accountability/check", { method: "POST", token }),

  respond: (
    data: {
      checkId?: string;
      action: import("@/types").MentorAction;
      note?: string;
      minutes?: number;
      taskId?: string;
    },
    token: string,
  ) =>
    apiFetch<{
      check: import("@/types").MentorCheck | null;
      reply: string;
      replySource: "ai" | "fallback";
      activityKind: import("@/types").ActivityKind;
      task: {
        id: string;
        title: string;
        status: string;
        completedAt?: number | null;
      } | null;
      followUpAt: number | null;
    }>("/api/accountability/respond", { method: "POST", body: data, token }),

  logActivity: (
    data: {
      kind: import("@/types").ActivityKind;
      taskId?: string;
      taskTitle?: string;
      note?: string;
    },
    token: string,
  ) =>
    apiFetch<unknown>("/api/accountability/activity", {
      method: "POST",
      body: data,
      token,
    }),

  subtasks: (
    data: { title: string; description: string },
    token: string,
  ) =>
    apiFetch<{ items: string[]; source: "ai" | "fallback" }>(
      "/api/accountability/subtasks",
      { method: "POST", body: data, token },
    ),

  dailyLaunch: (token: string, refresh = false, count = 3) => {
    const params = new URLSearchParams({ count: String(count) });
    if (refresh) params.set("refresh", "1");
    return apiFetch<{ launch: import("@/types").DailyLaunch }>(
      `/api/accountability/daily-launch?${params.toString()}`,
      { token },
    );
  },

  firstSteps: (
    data: {
      taskId: string;
      title?: string;
      notes?: string | null;
      minutes?: number;
    },
    token: string,
  ) =>
    apiFetch<{ steps: string[]; source: "ai" | "fallback"; minutes?: number }>(
      "/api/accountability/first-steps",
      { method: "POST", body: data, token },
    ),

  saveFocusSession: (
    data: {
      mode: "focus" | "short_break" | "long_break";
      plannedMinutes: number;
      actualMinutes: number;
      completed: boolean;
      taskId?: string | null;
      taskTitle?: string | null;
      startedAt: number;
      endedAt?: number;
    },
    token: string,
  ) =>
    apiFetch<{ session: import("@/types").FocusSessionRecord }>(
      "/api/accountability/focus-sessions",
      { method: "POST", body: data, token },
    ),

  aiStatus: (token: string) =>
    apiFetch<import("@/types").AiStatus>("/api/accountability/ai-status", {
      token,
    }),
};

// Diary (günlük)
export const diaryApi = {
  list: (token: string, limit = 30) =>
    apiFetch<import("@/types").DiaryEntry[]>(`/api/diary?limit=${limit}`, {
      token,
    }),

  get: (date: string, token: string) =>
    apiFetch<import("@/types").DiaryEntry | null>(`/api/diary/${date}`, {
      token,
    }),

  save: (date: string, entry: import("@/types").DiaryEntry, token: string) =>
    apiFetch<import("@/types").DiaryEntry>(`/api/diary/${date}`, {
      method: "PUT",
      body: entry,
      token,
    }),

  remove: (date: string, token: string) =>
    apiFetch<{ success: boolean }>(`/api/diary/${date}`, {
      method: "DELETE",
      token,
    }),

  suggestTasks: (date: string, token: string) =>
    apiFetch<{
      suggestions: import("@/types").TaskSuggestion[];
      source: "ai" | "fallback";
    }>(`/api/diary/${date}/suggest-tasks`, { method: "POST", token }),

  reflect: (date: string, token: string) =>
    apiFetch<{ message: string; source: "ai" | "fallback" }>(
      `/api/diary/${date}/reflect`,
      { method: "POST", token },
    ),
};
