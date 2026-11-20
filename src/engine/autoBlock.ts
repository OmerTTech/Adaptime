import { PRIORITY_ORDER, isScheduled, type TaskBlock } from "@/types";

export interface BlockPlacement {
  taskId: string;
  title: string;
  startTime: number;
  endTime: number;
}

/**
 * 3.1 — Boşluklara otomatik yerleştirme. Saatsiz açık görevleri öncelik
 * sırasıyla bugünün boş aralıklarına koyar. Geçmişe veya gece yarısından
 * sonrasına taşmaz; sığmayan görev saatsiz kalır.
 */
export function planAutoBlock(
  tasks: TaskBlock[],
  now: number = Date.now(),
  dayEndHour = 23,
): BlockPlacement[] {
  const step = 15 * 60_000;
  const open = tasks.filter(
    (t) => t.status === "pending" || t.status === "paused",
  );
  const busy = open
    .filter(isScheduled)
    .map((t) => ({ s: t.startTime!, e: t.endTime! }))
    .sort((a, b) => a.s - b.s);

  const unscheduled = open
    .filter((t) => !isScheduled(t) && t.status !== "active")
    .sort(
      (a, b) =>
        PRIORITY_ORDER[a.priority ?? "medium"] -
          PRIORITY_ORDER[b.priority ?? "medium"] ||
        (a.estimatedMinutes ?? 30) - (b.estimatedMinutes ?? 30),
    );

  const limit = new Date(now);
  limit.setHours(dayEndHour, 0, 0, 0);
  let cursor = Math.ceil((now + 5 * 60_000) / step) * step;

  const placements: BlockPlacement[] = [];
  for (const task of unscheduled) {
    const minutes = Math.max(
      15,
      Math.round((task.estimatedMinutes ?? 30) / 5) * 5,
    );
    const duration = minutes * 60_000;
    let placed = false;

    for (let guard = 0; guard < 200 && !placed; guard++) {
      if (cursor + duration > limit.getTime()) break;
      const conflict = busy.find(
        (b) => cursor < b.e && cursor + duration > b.s,
      );
      if (!conflict) {
        placements.push({
          taskId: task.id,
          title: task.title,
          startTime: cursor,
          endTime: cursor + duration,
        });
        busy.push({ s: cursor, e: cursor + duration });
        busy.sort((a, b) => a.s - b.s);
        cursor += duration;
        placed = true;
        break;
      }
      cursor = Math.ceil(conflict.e / step) * step;
    }
  }

  return placements;
}
