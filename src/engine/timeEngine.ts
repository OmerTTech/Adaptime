import type { TaskBlock, PauseImpact, PauseMode, ScheduledTask } from "@/types";
import { isScheduled } from "@/types";

/**
 * Planın gerçek bitişi: saatli ve atlanmamış görevlerin en geç bitişi.
 * `routine.dayEndTime` görev silindiğinde eski değerde kalabildiği için
 * hesaplarda bu fonksiyon kullanılır.
 */
export function getPlannedDayEnd(tasks: TaskBlock[], fallback = 0): number {
  const ends = tasks
    .filter((t) => isScheduled(t) && t.status !== "skipped")
    .map((t) => t.endTime!)
    .filter((v) => typeof v === "number");
  return ends.length > 0 ? Math.max(...ends) : fallback;
}

export function calculatePauseImpact(
  tasks: TaskBlock[],
  activeTaskId: string,
  pauseDuration: number,
  mode: PauseMode,
): PauseImpact {
  const scheduledTasks = tasks.filter(isScheduled);
  const activeIndex = scheduledTasks.findIndex((t) => t.id === activeTaskId);
  if (activeIndex === -1) {
    return {
      mode,
      newDayEndTime: getPlannedDayEnd(scheduledTasks, Date.now()),
      affectedTasks: [],
      description: "Aktif görev bulunamadı",
    };
  }

  switch (mode) {
    case "shift":
      return calculateShift(scheduledTasks, activeIndex, pauseDuration);
    case "cut":
      return calculateCut(scheduledTasks, activeIndex, pauseDuration);
    case "balance":
      return calculateBalance(scheduledTasks, activeIndex, pauseDuration);
  }
}

function calculateShift(
  tasks: ScheduledTask[],
  _activeIndex: number,
  pauseDuration: number,
): PauseImpact {
  const affected = tasks.map((t) => ({
    id: t.id,
    newStart: t.startTime + pauseDuration,
    newEnd: t.endTime + pauseDuration,
  }));

  const newDayEndTime = getPlannedDayEnd(tasks) + pauseDuration;

  return {
    mode: "shift",
    newDayEndTime,
    affectedTasks: affected,
    description: `Tüm görevler ${Math.round(pauseDuration / 60000)} dakika ileri kaydırıldı. Gün bitişi: ${new Date(newDayEndTime).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", hour12: false })}.`,
  };
}

function calculateCut(
  tasks: ScheduledTask[],
  _activeIndex: number,
  pauseDuration: number,
): PauseImpact {
  const affected = tasks.map((t) => ({
    id: t.id,
    newStart: t.startTime,
    newEnd: t.endTime,
  }));

  const newDayEndTime = getPlannedDayEnd(tasks);

  return {
    mode: "cut",
    newDayEndTime,
    affectedTasks: affected,
    description: `Kaybedilen ${Math.round(pauseDuration / 60000)} dakika kesildi. Zaman çizelgesi değişmedi.`,
  };
}

const MIN_TASK_MINUTES = 5;

function calculateBalance(
  tasks: ScheduledTask[],
  activeIndex: number,
  pauseDuration: number,
): PauseImpact {
  const remaining = tasks.length - activeIndex - 1;
  if (remaining === 0) {
    return calculateCut(tasks, activeIndex, pauseDuration);
  }

  const lostMinutes = Math.round(pauseDuration / 60000);

  // 1) Önce plandaki boşlukları kullan: duraklama sırasında geçen süre
  //    bitişik görevler arasındaki tamponu yiyorsa hiçbir görev kısalmaz.
  let cursorEnd = tasks[activeIndex].endTime;
  let need = lostMinutes;
  const bufferSegments: { start: number; end: number }[] = [];
  for (let i = activeIndex + 1; i < tasks.length && need > 0; i++) {
    const gap = Math.round((tasks[i].startTime - cursorEnd) / 60000);
    if (gap > 0) {
      const use = Math.min(gap, need);
      bufferSegments.push({
        start: cursorEnd,
        end: cursorEnd + use * 60000,
      });
      need -= use;
    }
    cursorEnd = Math.max(cursorEnd, tasks[i].endTime);
  }
  const fromBuffer = lostMinutes - need;
  const leftover = need;

  // 2) Yetmeyen kısmı kalan görevlerden sağdan (bitişten) kıs.
  //    Her görevden en fazla süresi - 5 dk kadar kısaltılabilir.
  const capacity = tasks
    .slice(activeIndex + 1)
    .map((t) => Math.max(0, Math.round((t.endTime - t.startTime) / 60000) - MIN_TASK_MINUTES));
  const totalCapacity = capacity.reduce((a, b) => a + b, 0);
  const distributable = Math.min(leftover, totalCapacity);

  // Dakikaları kalan görevlere mümkün olduğunca eşit böl.
  const base = Math.floor(distributable / remaining);
  const remainder = distributable - base * remaining;
  const trims = capacity.map((cap, i) =>
    Math.min(cap, base + (i < remainder ? 1 : 0)),
  );
  const actualMinutes = trims.reduce((a, b) => a + b, 0);

  // Başlangıçlar sabit: erteleme alanı açılmaz. Bitişler öne alınır.
  const affected = tasks.map((t, i) => {
    if (i <= activeIndex) {
      return { id: t.id, newStart: t.startTime, newEnd: t.endTime };
    }
    const trim = trims[i - activeIndex - 1] ?? 0;
    return {
      id: t.id,
      newStart: t.startTime,
      newEnd: t.endTime - trim * 60000,
    };
  });

  const newDayEndTime = getPlannedDayEnd(tasks);
  const shortfall = leftover - actualMinutes;
  const endLabel = new Date(newDayEndTime).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts: string[] = [];
  if (fromBuffer > 0) {
    parts.push(`${fromBuffer} dakika plandaki boşluklardan karşılandı`);
  }
  if (actualMinutes > 0) {
    parts.push(
      `${actualMinutes} dakika kalan ${remaining} görevin bitişinden kısaltıldı`,
    );
  }
  if (parts.length === 0) parts.push("Zaman çizelgesi değişmedi");

  return {
    mode: "balance",
    newDayEndTime,
    affectedTasks: affected,
    bufferSegments,
    description:
      `${parts.join(", ")}. Gün bitişi: ${endLabel}.` +
      (shortfall > 0
        ? ` Görevler 5 dakikanın altına inmesin diye ${shortfall} dakika kesildi.`
        : ""),
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
