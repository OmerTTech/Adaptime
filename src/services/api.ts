const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string;
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
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "API hatası" }));
    throw new Error(error.error || `HTTP ${res.status}`);
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
    },
    token: string,
  ) =>
    apiFetch<unknown>("/api/routines", { method: "POST", body: data, token }),

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
    apiFetch<{ check: import("@/types").MentorCheck; throttled: boolean }>(
      "/api/accountability/check",
      { method: "POST", token },
    ),

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

  dailyLaunch: (token: string, refresh = false) =>
    apiFetch<{ launch: import("@/types").DailyLaunch }>(
      `/api/accountability/daily-launch${refresh ? "?refresh=1" : ""}`,
      { token },
    ),

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
