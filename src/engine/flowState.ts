import type { TaskBlock, FlowImpact, FlowMode } from "@/types";
import { isScheduled } from "@/types";

const MIN_TASK_MS = 5 * 60_000;

/**
 * Flow = "süre uzadı, planı gerçeğe uydur".
 *
 * - eatNext (Kes): süre sonraki görevlerin süresinden düşülür, gün aynı saatte biter.
 * - shift (Kaydır): tüm plan aynı süre kadar ileri kayar, gün geç biter.
 * - balance (Dengele): yarısı sonraki görevden kesilir, kalanı gün sonuna eklenir.
 */
export function calculateFlowImpact(
  tasks: TaskBlock[],
  activeTaskId: string,
  extraMinutes: number,
  mode: FlowMode,
): FlowImpact {
  const scheduledTasks = tasks.filter(isScheduled);
  const activeIndex = scheduledTasks.findIndex((t) => t.id === activeTaskId);
  if (activeIndex === -1) {
    return {
      mode,
      extraMinutes,
      newDayEndTime:
        scheduledTasks[scheduledTasks.length - 1]?.endTime ?? Date.now(),
      affectedTasks: [],
      description: "Aktif görev bulunamadı",
    };
  }

  const extraMs = Math.max(0, extraMinutes) * 60000;
  const active = scheduledTasks[activeIndex];
  const newActiveEnd = active.endTime + extraMs;

  const positions = scheduledTasks.map((t) => ({
    id: t.id,
    newStart: t.startTime,
    newEnd: t.endTime,
  }));
  positions[activeIndex].newEnd = newActiveEnd;

  if (mode === "shift") {
    // Aktif görev de dahil her şey ileri kayar; aktif görevin uzaması korunur.
    const shiftFrom = activeIndex + 1;
    for (let i = shiftFrom; i < positions.length; i += 1) {
      positions[i].newStart += extraMs;
      positions[i].newEnd += extraMs;
    }
    return {
      mode,
      extraMinutes,
      newDayEndTime:
        positions[positions.length - 1]?.newEnd ?? newActiveEnd,
      affectedTasks: positions,
      description: `${extraMinutes} dk eklendi. Sonraki tüm görevler ${extraMinutes} dk ileri kaydı; gün ${extraMinutes} dk geç biter.`,
    };
  }

  if (mode === "balance") {
    // Yarısı sonraki görevden kesilir, kalanı gün sonuna eklenir.
    let cutMs = 0;
    const nextIndex = activeIndex + 1;
    if (nextIndex < positions.length) {
      const next = scheduledTasks[nextIndex];
      const available = Math.max(0, next.endTime - next.startTime - MIN_TASK_MS);
      cutMs = Math.min(Math.floor(extraMs / 2), available);
      positions[nextIndex].newEnd = next.endTime - cutMs;
    }
    const remainder = extraMs - cutMs;
    for (let i = activeIndex + 2; i < positions.length; i += 1) {
      positions[i].newStart += remainder;
      positions[i].newEnd += remainder;
    }
    const cutMin = Math.round(cutMs / 60000);
    const restMin = Math.round(remainder / 60000);
    return {
      mode,
      extraMinutes,
      newDayEndTime:
        positions[positions.length - 1]?.newEnd ?? newActiveEnd,
      affectedTasks: positions,
      description: `Yarısı dengelendi: sonraki görevden ${cutMin} dk kesildi, kalan ${restMin} dk gün sonuna eklendi.`,
    };
  }

  // eatNext (Kes): sonraki görev(ler)in süresinden düş.
  let remaining = extraMs;
  for (let i = activeIndex + 1; i < positions.length && remaining > 0; i += 1) {
    const task = scheduledTasks[i];
    const available = Math.max(
      0,
      task.endTime - task.startTime - MIN_TASK_MS,
    );
    const cut = Math.min(remaining, available);
    positions[i].newEnd -= cut;
    remaining -= cut;
  }
  // Yetmezse artan süre gün sonuna eklenir (bitiş saati kayar).
  if (remaining > 0) {
    for (let i = activeIndex + 1; i < positions.length; i += 1) {
      positions[i].newStart += remaining;
      positions[i].newEnd += remaining;
    }
  }

  const cutMin = Math.round((extraMs - remaining) / 60000);
  return {
    mode,
    extraMinutes,
    newDayEndTime:
      positions[positions.length - 1]?.newEnd ?? newActiveEnd,
    affectedTasks: positions,
    description:
      remaining > 0
        ? `${cutMin} dk sonraki görevlerden kesildi; kalan ${Math.round(remaining / 60000)} dk gün sonuna eklendi.`
        : `${extraMinutes} dk sonraki görevlerden kesildi; gün aynı saatte bitiyor.`,
  };
}

export function applyFlowImpact(
  tasks: TaskBlock[],
  impact: FlowImpact,
): TaskBlock[] {
  return tasks.map((task) => {
    const affected = impact.affectedTasks.find((a) => a.id === task.id);
    if (!affected) return task;
    return {
      ...task,
      startTime: affected.newStart,
      endTime: affected.newEnd,
    };
  });
}
