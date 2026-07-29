import type { TaskBlock, PauseImpact, PauseMode } from "@/types";

export function calculatePauseImpact(
  tasks: TaskBlock[],
  activeTaskId: string,
  pauseDuration: number,
  mode: PauseMode,
): PauseImpact {
  const activeIndex = tasks.findIndex((t) => t.id === activeTaskId);
  if (activeIndex === -1) {
    return {
      mode,
      newDayEndTime: tasks[tasks.length - 1]?.endTime ?? Date.now(),
      affectedTasks: [],
      description: "Aktif görev bulunamadı",
    };
  }

  switch (mode) {
    case "shift":
      return calculateShift(tasks, activeIndex, pauseDuration);
    case "cut":
      return calculateCut(tasks, activeIndex, pauseDuration);
    case "balance":
      return calculateBalance(tasks, activeIndex, pauseDuration);
  }
}

function calculateShift(
  tasks: TaskBlock[],
  _activeIndex: number,
  pauseDuration: number,
): PauseImpact {
  const affected = tasks.map((t) => ({
    id: t.id,
    newStart: t.startTime + pauseDuration,
    newEnd: t.endTime + pauseDuration,
  }));

  const newDayEndTime = tasks[tasks.length - 1].endTime + pauseDuration;

  return {
    mode: "shift",
    newDayEndTime,
    affectedTasks: affected,
    description: `Tüm görevler ${Math.round(pauseDuration / 60000)} dakika ileri kaydırıldı. Gün ${new Date(newDayEndTime).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", hour12: false })}'da bitecek.`,
  };
}

function calculateCut(
  tasks: TaskBlock[],
  _activeIndex: number,
  pauseDuration: number,
): PauseImpact {
  const affected = tasks.map((t) => ({
    id: t.id,
    newStart: t.startTime,
    newEnd: t.endTime,
  }));

  const newDayEndTime = tasks[tasks.length - 1].endTime;

  return {
    mode: "cut",
    newDayEndTime,
    affectedTasks: affected,
    description: `Kaybedilen ${Math.round(pauseDuration / 60000)} dakika kesildi. Zaman çizelgesi değişmedi.`,
  };
}

function calculateBalance(
  tasks: TaskBlock[],
  activeIndex: number,
  pauseDuration: number,
): PauseImpact {
  const remaining = tasks.length - activeIndex - 1;
  if (remaining === 0) {
    return calculateCut(tasks, activeIndex, pauseDuration);
  }

  const perTask = Math.floor(pauseDuration / remaining);
  let cumulativeOffset = 0;

  const affected = tasks.map((t, i) => {
    if (i <= activeIndex) {
      return { id: t.id, newStart: t.startTime, newEnd: t.endTime };
    }
    cumulativeOffset += perTask;
    return {
      id: t.id,
      newStart: t.startTime + cumulativeOffset,
      newEnd: t.endTime + cumulativeOffset,
    };
  });

  const lastTask = tasks[tasks.length - 1];
  const newDayEndTime = lastTask.endTime + cumulativeOffset;

  return {
    mode: "balance",
    newDayEndTime,
    affectedTasks: affected,
    description: `Kaybedilen ${Math.round(pauseDuration / 60000)} dakika, kalan ${remaining} görev arasına eşit dağıtıldı.`,
  };
}

export function applyPauseImpact(
  tasks: TaskBlock[],
  impact: PauseImpact,
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
