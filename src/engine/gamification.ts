import { isScheduled, type DayRoutine, type TaskBlock } from "@/types";
import { actualWorkMinutes } from "./estimates";

/**
 * Sakin oyunlaştırma: kaybetme cezası yok, puan yalnızca gerçek işten gelir.
 * Veriler son 30 günlük geçmişten ve bugünün planından hesaplanır.
 */

export interface LevelInfo {
  index: number;
  name: string;
  nextName: string | null;
  start: number;
  next: number | null;
  progress: number;
}

export interface GamificationBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Rozetin ilk kazanıldığı gün (YYYY-MM-DD). */
  earnedAt: string;
}

export interface Gamification {
  xp: number;
  weekXp: number;
  totalCompleted: number;
  weekCompleted: number;
  level: LevelInfo;
  badges: GamificationBadge[];
  weekBadges: GamificationBadge[];
}

const LEVELS = [
  { name: "Başlangıç", min: 0 },
  { name: "Düzen", min: 100 },
  { name: "Ritim", min: 300 },
  { name: "Odak", min: 700 },
  { name: "Ustalık", min: 1500 },
];

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function levelFor(xp: number): LevelInfo {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].min) index = i;
  }
  const current = LEVELS[index];
  const next = LEVELS[index + 1] ?? null;
  const span = next ? next.min - current.min : 1;
  return {
    index: index + 1,
    name: current.name,
    nextName: next?.name ?? null,
    start: current.min,
    next: next?.min ?? null,
    progress: next
      ? Math.min(100, Math.round(((xp - current.min) / span) * 100))
      : 100,
  };
}

/** Geçmiş + bugün; aynı tarih varsa bugünün canlı planı kazanır. */
function collectDays(
  history: DayRoutine[],
  current: DayRoutine | null,
): DayRoutine[] {
  const byDate = new Map<string, DayRoutine>();
  for (const day of history) byDate.set(day.date, day);
  if (current) byDate.set(current.date, current);
  return [...byDate.values()];
}

function isDone(task: TaskBlock): boolean {
  return task.status === "completed";
}

function taskWorkMinutes(task: TaskBlock): number {
  if (task.startedAt || task.completedAt) return actualWorkMinutes(task);
  if (isScheduled(task)) {
    return Math.max(0, (task.endTime! - task.startTime!) / 60_000);
  }
  return task.estimatedMinutes ?? 0;
}

function dayXp(day: DayRoutine): number {
  const done = day.tasks.filter(isDone);
  const scheduled = done.filter(isScheduled).length;
  let xp = done.length * 10 + scheduled * 5;
  if (done.length >= 3) xp += 20;
  return xp;
}

interface BadgeRule {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Koşul sağlanıyorsa kanıtın tarihi (YYYY-MM-DD), yoksa null. */
  find: (days: DayRoutine[], streak: number, today: string) => string | null;
}

const BADGE_RULES: BadgeRule[] = [
  {
    id: "first-task",
    name: "İlk Adım",
    description: "İlk görevini tamamladın.",
    icon: "🌱",
    find: (days) => {
      for (const day of days) {
        if (day.tasks.some(isDone)) return day.date;
      }
      return null;
    },
  },
  {
    id: "focus-25",
    name: "25 Dakika",
    description: "Tek görevde 25 dakikadan fazla çalıştın.",
    icon: "⏳",
    find: (days) => {
      for (const day of days) {
        if (day.tasks.some((t) => isDone(t) && taskWorkMinutes(t) >= 25)) {
          return day.date;
        }
      }
      return null;
    },
  },
  {
    id: "streak-3",
    name: "3 Gün Seri",
    description: "Üç gün üst üste görev tamamladın.",
    icon: "🔥",
    // Rozet, mevcut seride eşiğin ilk aşıldığı gün kazanılmış sayılır.
    find: (_days, streak, today) =>
      streak >= 3 ? addDays(today, -(streak - 3)) : null,
  },
  {
    id: "streak-7",
    name: "7 Gün Seri",
    description: "Bir hafta boyunca seriyi korudun.",
    icon: "🏅",
    find: (_days, streak, today) =>
      streak >= 7 ? addDays(today, -(streak - 7)) : null,
  },
  {
    id: "fifty-tasks",
    name: "50 Görev",
    description: "Toplam elli görev tamamladın.",
    icon: "📚",
    find: (days) => {
      let total = 0;
      for (const day of days) {
        total += day.tasks.filter(isDone).length;
        if (total >= 50) return day.date;
      }
      return null;
    },
  },
  {
    id: "early-finish",
    name: "Erken Bitiş",
    description: "Planlanan bitişten önce bir görev bitirdin.",
    icon: "⚡",
    find: (days) => {
      for (const day of days) {
        const hit = day.tasks.some(
          (t) =>
            isDone(t) &&
            isScheduled(t) &&
            typeof t.completedAt === "number" &&
            t.completedAt < t.endTime!,
        );
        if (hit) return day.date;
      }
      return null;
    },
  },
  {
    id: "morning-bird",
    name: "Sabah Kuşu",
    description: "10:00'dan önce planlı bir görev tamamladın.",
    icon: "🌅",
    find: (days) => {
      for (const day of days) {
        const hit = day.tasks.some((t) => {
          if (!isDone(t)) return false;
          const at = t.completedAt ?? (isScheduled(t) ? t.startTime : undefined);
          if (!at) return false;
          return new Date(at).getHours() < 10;
        });
        if (hit) return day.date;
      }
      return null;
    },
  },
  {
    id: "split-master",
    name: "Böl ve Yönet",
    description: "Üç veya daha fazla adıma böldüğün bir görevi bitirdin.",
    icon: "🧩",
    find: (days) => {
      for (const day of days) {
        const hit = day.tasks.some(
          (t) =>
            isDone(t) &&
            (t.subtasks?.length ?? 0) >= 3 &&
            (t.subtasks ?? []).every((s) => s.done),
        );
        if (hit) return day.date;
      }
      return null;
    },
  },
];

export function computeGamification(
  history: DayRoutine[],
  current: DayRoutine | null,
  streak: number,
  today: string,
): Gamification {
  const days = collectDays(history, current);
  const weekStart = addDays(today, -6);

  const xp = days.reduce((sum, day) => sum + dayXp(day), 0);
  const weekXp = days
    .filter((day) => day.date >= weekStart)
    .reduce((sum, day) => sum + dayXp(day), 0);

  const allDone = days.flatMap((day) => day.tasks.filter(isDone));
  const weekDone = days
    .filter((day) => day.date >= weekStart)
    .flatMap((day) => day.tasks.filter(isDone));

  const badges: GamificationBadge[] = [];
  for (const rule of BADGE_RULES) {
    const earnedAt = rule.find(days, streak, today);
    if (!earnedAt) continue;
    badges.push({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      icon: rule.icon,
      earnedAt,
    });
  }

  return {
    xp,
    weekXp,
    totalCompleted: allDone.length,
    weekCompleted: weekDone.length,
    level: levelFor(xp),
    badges,
    weekBadges: badges.filter((badge) => badge.earnedAt >= weekStart),
  };
}
