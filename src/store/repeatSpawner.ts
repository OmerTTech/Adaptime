import { routineApi } from "@/services/api";
import type { TaskBlock } from "@/types";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function dateKeyOf(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Tekrarlayan görevin bir sonraki başlangıç zamanı. */
export function nextOccurrenceStart(
  task: TaskBlock,
  completedAt: number,
): number | null {
  if (!task.repeat) return null;
  const duration = task.originalDuration ?? 30 * MINUTE;
  const base = task.startTime ?? completedAt;

  switch (task.repeat) {
    case "hourly": {
      // Bir sonraki tam saatte başlasın.
      const next = Math.ceil((Math.max(completedAt, base + duration) + MINUTE) / (60 * MINUTE)) * 60 * MINUTE;
      return next;
    }
    case "daily":
      return base + DAY;
    case "weekly":
      return base + 7 * DAY;
    case "monthly": {
      const d = new Date(base);
      d.setMonth(d.getMonth() + 1);
      return d.getTime();
    }
    case "custom": {
      const days = task.repeatDays ?? [];
      if (days.length === 0) return null;
      const next = new Date(base);
      for (let i = 1; i <= 8; i += 1) {
        next.setDate(next.getDate() + 1);
        if (days.includes(next.getDay())) return next.getTime();
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Tamamlanan tekrarlayan görevin bir sonraki örneğini hedef günün
 * rutinine ekler (sunucuda gün yoksa oluşturulur).
 */
export async function spawnNextOccurrence(
  task: TaskBlock,
  token: string,
): Promise<boolean> {
  const nextStart = nextOccurrenceStart(task, Date.now());
  if (!nextStart) return false;
  const duration = task.originalDuration ?? 30 * MINUTE;
  const shift = task.startTime ? nextStart - task.startTime : 0;

  const clone = {
    title: task.title,
    color: task.color,
    status: "pending",
    startTime: nextStart,
    endTime: nextStart + duration,
    originalDuration: duration,
    pausedDuration: 0,
    flowExtensions: 0,
    estimatedMinutes: task.estimatedMinutes,
    priority: task.priority ?? "medium",
    category: task.category ?? "work",
    createdAtClient: Date.now(),
    progress: 0,
    delayCount: 0,
    repeat: task.repeat,
    repeatDays: task.repeatDays,
    parallel: task.parallel,
    ...(task.description ? { description: task.description } : {}),
    ...(task.deadline ? { deadline: task.deadline + shift } : {}),
    subtasks: (task.subtasks ?? []).map((s) => ({
      title: s.title,
      done: false,
    })),
  };

  await routineApi.appendTask(dateKeyOf(nextStart), clone, token);
  return true;
}
