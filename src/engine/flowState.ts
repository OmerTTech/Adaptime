import type { TaskBlock, FlowImpact, FlowMode } from "@/types";
import { isScheduled } from "@/types";

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
      newDayEndTime: scheduledTasks[scheduledTasks.length - 1]?.endTime ?? Date.now(),
      affectedTasks: [],
      description: "Aktif görev bulunamadı",
    };
  }

  const extraMs = extraMinutes * 60000;

  if (mode === "shift") {
    const affected = scheduledTasks.map((t) => ({
      id: t.id,
      newStart: t.startTime! + extraMs,
      newEnd: t.endTime! + extraMs,
    }));

    const newDayEndTime = scheduledTasks[scheduledTasks.length - 1].endTime! + extraMs;

    return {
      mode: "shift",
      extraMinutes,
      newDayEndTime,
      affectedTasks: affected,
      description: `Flow State: ${extraMinutes} dakika eklendi. Tüm görevler ileri kaydırıldı.`,
    };
  }

  const active = scheduledTasks[activeIndex];
  const newActiveEnd = active.endTime! + extraMs;

  const affected = scheduledTasks.map((t, i) => {
    if (i === activeIndex) {
      return { id: t.id, newStart: t.startTime!, newEnd: newActiveEnd };
    }
    if (i === activeIndex + 1) {
      return { id: t.id, newStart: t.startTime! + extraMs, newEnd: t.endTime! };
    }
    return { id: t.id, newStart: t.startTime!, newEnd: t.endTime! };
  });

  const newDayEndTime = scheduledTasks[scheduledTasks.length - 1].endTime!;

  return {
    mode: "eatNext",
    extraMinutes,
    newDayEndTime,
    affectedTasks: affected,
    description: `Flow State: ${extraMinutes} dakika eklendi. Sonraki görevden düşüldü.`,
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
