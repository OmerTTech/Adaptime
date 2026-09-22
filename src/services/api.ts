const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

async function apiFetch<T>(
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
    }>("/api/generate-routine", { method: "POST", body: { prompt }, token }),
};
