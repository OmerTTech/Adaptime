import type { TaskBlock, EarlyFinishImpact, EarlyFinishMode } from "@/types";

export function calculateEarlyFinishImpact(
  tasks: TaskBlock[],
  completedTaskId: string,
  mode: EarlyFinishMode,
): EarlyFinishImpact {
  const completedIndex = tasks.findIndex((t) => t.id === completedTaskId);
  if (completedIndex === -1) {
    return {
      mode,
      savedMinutes: 0,
      newDayEndTime: tasks[tasks.length - 1]?.endTime ?? Date.now(),
      description: "Görev bulunamadı",
    };
  }

  const completed = tasks[completedIndex];
  const savedMs = completed.endTime - Date.now();
  const savedMinutes = Math.max(0, Math.round(savedMs / 60000));

  if (mode === "pullForward") {
    const newDayEndTime = tasks[tasks.length - 1].endTime - savedMs;
    return {
      mode: "pullForward",
      savedMinutes,
      newDayEndTime,
      description: `Kalan ${savedMinutes} dakika, sonraki görevlere çekildi. Gün ${new Date(newDayEndTime).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", hour12: false })}'da bitecek.`,
    };
  }

  return {
    mode: "extendBreak",
    savedMinutes,
    newDayEndTime: tasks[tasks.length - 1].endTime,
    description: `Kalan ${savedMinutes} dakika dinlenme sürenize eklendi.`,
  };
}

export function applyEarlyFinishImpact(
  tasks: TaskBlock[],
  impact: EarlyFinishImpact,
): TaskBlock[] {
  if (impact.mode !== "pullForward") return tasks;

  return tasks.map((t) => ({
    ...t,
    startTime: t.startTime - impact.savedMinutes * 60000,
    endTime: t.endTime - impact.savedMinutes * 60000,
  }));
}
