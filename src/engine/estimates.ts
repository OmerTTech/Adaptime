import type { DayRoutine, TaskBlock, TaskCategory } from "@/types";

export interface CategoryEstimate {
  category: TaskCategory;
  samples: number;
  /** Gerçek süre / planlanan süre ortalaması (1 = tam isabet). */
  ratio: number;
  averageMinutes: number;
}

function plannedMinutes(task: TaskBlock): number {
  const planned =
    task.originalDuration ??
    (task.estimatedMinutes ? task.estimatedMinutes * 60_000 : 0);
  return planned > 0 ? planned / 60_000 : 0;
}

/**
 * Görevde gerçekten çalışılan dakika. Elle süre düzeltmesi
 * (`timeAdjustMinutes`) buradan düşülür; boşa giden zaman sayılmaz.
 */
export function actualWorkMinutes(task: TaskBlock): number {
  const start = task.startedAt ?? task.startTime;
  const end = task.completedAt ?? task.endTime;
  const adjust = task.timeAdjustMinutes ?? 0;
  if (start && end && end > start) {
    return Math.max(
      0,
      (end - start - (task.pausedDuration ?? 0)) / 60_000 - adjust,
    );
  }
  return Math.max(0, (task.estimatedMinutes ?? 0) - adjust);
}

function actualMinutes(task: TaskBlock): number {
  return actualWorkMinutes(task);
}

function ratioOf(task: TaskBlock): number | null {
  const planned = plannedMinutes(task);
  const actual = actualMinutes(task);
  if (!planned || !actual) return null;
  const ratio = actual / planned;
  return ratio > 0.15 && ratio < 4 ? ratio : null;
}

/**
 * Tamamlanmış görevlerden kategori başına "gerçek/planlanan" oranı.
 * 1'den büyük oran, tahminin sürekli kısa tutulduğunu gösterir.
 */
export function estimateAccuracy(history: DayRoutine[]): CategoryEstimate[] {
  const buckets = new Map<
    TaskCategory,
    { ratios: number[]; actuals: number[] }
  >();

  for (const day of history) {
    for (const task of day.tasks) {
      if (task.status !== "completed") continue;
      const ratio = ratioOf(task);
      if (ratio === null) continue;
      const key = task.category ?? "other";
      const bucket = buckets.get(key) ?? { ratios: [], actuals: [] };
      bucket.ratios.push(ratio);
      bucket.actuals.push(actualMinutes(task));
      buckets.set(key, bucket);
    }
  }

  return [...buckets.entries()]
    .filter(([, bucket]) => bucket.ratios.length >= 2)
    .map(([category, bucket]) => ({
      category,
      samples: bucket.ratios.length,
      ratio:
        bucket.ratios.reduce((acc, v) => acc + v, 0) / bucket.ratios.length,
      averageMinutes:
        bucket.actuals.reduce((acc, v) => acc + v, 0) / bucket.actuals.length,
    }))
    .sort((a, b) => b.samples - a.samples);
}

/**
 * Girilen tahmini süre için geçmişe dayalı öneri.
 * Fark 5 dakikadan azsa öneri döndürmez.
 */
export function suggestionFor(
  category: TaskCategory,
  estimatedMinutes: number,
  history: DayRoutine[],
): { suggestedMinutes: number; ratio: number; samples: number } | null {
  const ratios = history
    .flatMap((day) =>
      day.tasks.filter(
        (t) => t.status === "completed" && (t.category ?? "other") === category,
      ),
    )
    .map(ratioOf)
    .filter((r): r is number => r !== null);

  if (ratios.length < 2) return null;

  const ratio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const suggestedMinutes = Math.max(
    5,
    Math.round((estimatedMinutes * ratio) / 5) * 5,
  );
  if (Math.abs(suggestedMinutes - estimatedMinutes) < 5) return null;

  return { suggestedMinutes, ratio, samples: ratios.length };
}
