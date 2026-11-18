import type { Page } from "@playwright/test";

/** Testler için günün tarihi (YYYY-MM-DD). */
export function todayKey(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

interface FakeTask {
  _id: string;
  title: string;
  status: string;
  color: string;
  pausedDuration: number;
  flowExtensions: number;
}

const settings = {
  enabled: false,
  timezone: "Europe/Istanbul",
  hours: [] as number[],
  tone: "direct" as const,
  snoozeMinutes: 15,
  maxSentences: 8,
  aiEnabled: false,
  restUntil: null,
  restReason: null,
  summaries: { morning: true, evening: true, weekly: true },
};

const aiStatus = {
  model: "test",
  configuredKeys: 0,
  availableKeys: 0,
  blockedUntil: null,
  keys: [],
};

/**
 * Gerçek backend yerine geçen sahte API: günün planını bellekte tutar,
 * POST /api/routines ile gelen görevleri kaydeder. Böylece testler Mongo,
 * JWT veya harici servis gerektirmez.
 */
export async function setupFakeApi(page: Page) {
  const routine = {
    _id: "routine-test",
    date: todayKey(),
    tasks: [] as FakeTask[],
    dayEndTime: 0,
    streak: 0,
    revision: 0,
  };
  const saves: { tasks?: { title: string; status: string }[] }[] = [];
  const summary = {
    dateKey: routine.date,
    planned: 0,
    completed: 0,
    overdue: 0,
    delayed: 0,
    activeTaskTitle: null,
    nextDeadline: null,
    plannedMinutes: 0,
    focusMinutes: 0,
    restMinutes: 0,
    completedFocusSessions: 0,
    checksSent: 0,
    checksAnswered: 0,
    activities: 0,
    workingMinutes: 0,
    otherMinutes: 0,
    freeMinutes: 0,
    completionRate: 0,
    deadlineSuccessRate: 0,
  };

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (path === "/api/auth/me") {
      return json({ id: "u1", email: "smoke@example.com", name: "Test Kullanıcı" });
    }
    if (path === "/api/routines/streak") {
      return json({ currentStreak: 0, completedDates: [], todayIsCompleted: false });
    }
    if (path === "/api/routines/history") return json([]);
    if (path === "/api/routines/missed-repeats") return json({ missed: [] });
    if (path === "/api/routines/unfinished") {
      return json({ date: routine.date, tasks: [] });
    }
    if (path === "/api/routines/archive") return json({ items: [] });
    if (path === "/api/accountability/state") {
      return json({
        dateKey: routine.date,
        settings,
        pending: [],
        checks: [],
        activities: [],
        summary,
        nextCheckAt: null,
        serverTime: Date.now(),
        ai: aiStatus,
        hasRoutine: true,
      });
    }
    if (path === "/api/accountability/settings") return json(settings);
    if (path === "/api/accountability/ai-status") return json(aiStatus);
    if (path === "/api/push/status") return json({ subscribed: 0, enabled: false });
    // Günlük listesi dizi, tek gün ise null döner (DiaryCard buna göre çizer).
    if (path === "/api/diary") return json([]);
    if (path.startsWith("/api/diary/")) return json(null);

    if (request.method() === "POST" && path === "/api/routines") {
      const body = JSON.parse(request.postData() || "{}");
      saves.push(body);
      routine.tasks = body.tasks ?? [];
      routine.revision += 1;
      return json(routine);
    }
    if (request.method() === "GET" && path === `/api/routines/${routine.date}`) {
      return json(routine);
    }

    return json({});
  });

  return { routine, saves };
}

/** AuthContext token'ı localStorage'dan okur. */
export async function seedLogin(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("adaptime-token", "smoke-token");
  });
}
