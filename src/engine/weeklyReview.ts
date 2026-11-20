import { isScheduled, type DayRoutine } from "@/types";
import { getTodayString } from "@/utils";

export interface WeeklyReview {
  days: number;
  activeDays: number;
  planned: number;
  completed: number;
  completionRate: number;
  focusMinutes: number;
  bestDay: { date: string; completed: number } | null;
  stuckDay: { date: string; completed: number; total: number } | null;
  carriedOver: number;
  suggestions: string[];
}

function minutesFor(task: DayRoutine["tasks"][number]): number {
  if (task.status !== "completed") return 0;
  const adjust = task.timeAdjustMinutes ?? 0;
  if (isScheduled(task)) {
    return Math.max(
      0,
      (task.endTime! - task.startTime! - task.pausedDuration) / 60000 - adjust,
    );
  }
  return Math.max(0, (task.estimatedMinutes ?? 0) - adjust);
}

function dayAverage(routine: DayRoutine | undefined): number | null {
  if (!routine) return null;
  const tasks = routine.tasks.filter((t) => t.status !== "skipped");
  if (tasks.length === 0) return null;
  const done = tasks.filter((t) => t.status === "completed").length;
  return done / tasks.length;
}

/**
 * Son 7 günün plan/gerçek karşılaştırması. Sunucuya gitmez; mevcut geçmişten
 * hesaplanır. Öneriler suçlayıcı değil, tek adımlıdır.
 */
export function buildWeeklyReview(
  history: DayRoutine[],
  current: DayRoutine | null | undefined,
  today: string = getTodayString(),
): WeeklyReview {
  const days = 7;
  const byDate = new Map<string, DayRoutine>();
  history.forEach((r) => byDate.set(r.date, r));
  if (current) byDate.set(current.date, current);

  let planned = 0;
  let completed = 0;
  let focusMinutes = 0;
  let activeDays = 0;
  let carriedOver = 0;
  let bestDay: WeeklyReview["bestDay"] = null;
  let stuckDay: WeeklyReview["stuckDay"] = null;

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - i);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const routine = byDate.get(date);
    if (!routine) continue;

    const tasks = routine.tasks.filter((t) => t.status !== "skipped");
    const done = tasks.filter((t) => t.status === "completed").length;
    planned += tasks.length;
    completed += done;
    activeDays += tasks.length > 0 ? 1 : 0;
    focusMinutes += tasks.reduce((acc, t) => acc + minutesFor(t), 0);
    carriedOver += tasks.filter(
      (t) => t.status !== "completed" && (t.carryCount ?? 0) > 0,
    ).length;

    if (done > 0 && (!bestDay || done > bestDay.completed)) {
      bestDay = { date, completed: done };
    }
    const avg = dayAverage(routine);
    if (avg !== null && avg < 1) {
      if (
        !stuckDay ||
        avg < stuckDay.completed / Math.max(1, stuckDay.total)
      ) {
        stuckDay = { date, completed: done, total: tasks.length };
      }
    }
  }

  const completionRate =
    planned > 0 ? Math.round((completed / planned) * 100) : 0;
  const roundFocus = Math.round(focusMinutes);

  const suggestions: string[] = [];
  if (planned === 0) {
    suggestions.push("Bu hafta plan boş. Tek bir küçük görevle başla.");
  } else if (completionRate < 40) {
    suggestions.push(
      `Haftaya günde en fazla 3 görev koy; %${completionRate} yerine biten iş sayısını büyüt.`,
    );
  } else if (completionRate >= 75) {
    suggestions.push(
      "Tamamlama yüksek. Yeni görev eklemek yerine bir görevi büyüt ya da süresini uzat.",
    );
  } else {
    suggestions.push(
      "Aynı sayıda görevle devam et; önce yarım kalanı bitir, yenisini sonra ekle.",
    );
  }

  if (roundFocus < 120) {
    suggestions.push(
      `Bu hafta ${roundFocus} dk odak. Haftaya iki pomodoro (2×25 dk) eklemek yeterli.`,
    );
  } else {
    suggestions.push(
      `${Math.floor(roundFocus / 60)} sa ${roundFocus % 60} dk odak iyi bir taban; aynı saatlerde koru.`,
    );
  }

  if (carriedOver > 0) {
    suggestions.push(
      `${carriedOver} görev günlerce devrediyor. En uzun süredir taşınanı ikiye böl ya da sil.`,
    );
  } else if (bestDay) {
    const label = new Date(`${bestDay.date}T12:00:00`).toLocaleDateString(
      "tr-TR",
      { weekday: "long" },
    );
    suggestions.push(
      `En verimli günün ${label} (${bestDay.completed} görev). Zor işi haftaya o güne koy.`,
    );
  } else {
    suggestions.push("Haftaya tek bir görev hedefi koy ve onu bitir.");
  }

  return {
    days,
    activeDays,
    planned,
    completed,
    completionRate,
    focusMinutes: roundFocus,
    bestDay,
    stuckDay,
    carriedOver,
    suggestions: suggestions.slice(0, 3),
  };
}
