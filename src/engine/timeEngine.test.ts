import { describe, expect, it } from "vitest";
import type { TaskBlock } from "@/types";
import { isScheduled } from "@/types";
import { calculatePauseImpact, getPlannedDayEnd } from "./timeEngine";

const at = (h: number, m = 0) =>
  new Date(2026, 10, 18, h, m, 0, 0).getTime();

function task(partial: Partial<TaskBlock> & { id: string; title: string }) {
  return {
    color: "#6366f1",
    status: "pending",
    pausedDuration: 0,
    flowExtensions: 0,
    ...partial,
  } as TaskBlock;
}

function day() {
  return [
    task({
      id: "a",
      title: "A",
      startTime: at(9),
      endTime: at(10),
      originalDuration: 60 * 60_000,
    }),
    task({
      id: "b",
      title: "B",
      startTime: at(10, 30),
      endTime: at(11, 30),
      originalDuration: 60 * 60_000,
    }),
    task({
      id: "c",
      title: "C",
      startTime: at(12),
      endTime: at(13),
      originalDuration: 60 * 60_000,
    }),
  ];
}

describe("getPlannedDayEnd", () => {
  it("en geç biten planlı görevi döndürür", () => {
    expect(getPlannedDayEnd(day())).toBe(at(13));
  });

  it("atlanan ve saatsiz görevleri yok sayar", () => {
    const tasks = [
      ...day(),
      task({ id: "d", title: "Todo", estimatedMinutes: 30 }),
      task({ id: "e", title: "Atlandı", startTime: at(15), endTime: at(16), status: "skipped" }),
    ];
    expect(getPlannedDayEnd(tasks)).toBe(at(13));
  });

  it("planlı görev yoksa yedeği döndürür", () => {
    expect(getPlannedDayEnd([], 1234)).toBe(1234);
  });
});

describe("calculatePauseImpact", () => {
  it("shift tüm görevleri duraklama kadar kaydırır", () => {
    const pause = 30 * 60_000;
    const impact = calculatePauseImpact(day(), "a", pause, "shift");
    expect(impact.newDayEndTime).toBe(at(13) + pause);
    expect(impact.affectedTasks.find((t) => t.id === "c")).toEqual({
      id: "c",
      newStart: at(12) + pause,
      newEnd: at(13) + pause,
    });
  });

  it("cut zaman çizelgesini değiştirmez", () => {
    const impact = calculatePauseImpact(day(), "a", 30 * 60_000, "cut");
    expect(impact.newDayEndTime).toBe(at(13));
    expect(impact.affectedTasks.find((t) => t.id === "b")).toEqual({
      id: "b",
      newStart: at(10, 30),
      newEnd: at(11, 30),
    });
  });

  it("balance önce plandaki boşlukları kullanır", () => {
    const impact = calculatePauseImpact(day(), "a", 30 * 60_000, "balance");
    expect(impact.bufferSegments).toEqual([
      { start: at(10), end: at(10, 30) },
    ]);
    // Boşluk yeterli olduğu için hiçbir görev kısalmadı.
    expect(impact.affectedTasks.find((t) => t.id === "c")).toEqual({
      id: "c",
      newStart: at(12),
      newEnd: at(13),
    });
    expect(impact.description).toContain(
      "30 dakika plandaki boşluklardan karşılandı",
    );
  });

  it("balance boşluk yetmezse kalan görevlerden kısar, 5 dk altına inmez", () => {
    const tasks = [
      task({
        id: "a",
        title: "A",
        startTime: at(9),
        endTime: at(10),
        originalDuration: 60 * 60_000,
      }),
      task({
        id: "b",
        title: "B",
        startTime: at(10),
        endTime: at(12),
        originalDuration: 120 * 60_000,
      }),
    ];
    const impact = calculatePauseImpact(tasks, "a", 60 * 60_000, "balance");
    const b = impact.affectedTasks.find((t) => t.id === "b")!;
    expect(b.newStart).toBe(at(10));
    // 120 dk görevden en fazla 115 dk kısalabilir; 60 dk istendi.
    expect(b.newEnd).toBe(at(12) - 60 * 60_000);
    expect(impact.description).toContain("bitişinden kısaltıldı");
  });
});

describe("isScheduled", () => {
  it("başlangıç ve bitiş yoksa saatsiz sayar", () => {
    expect(isScheduled(task({ id: "x", title: "X" }))).toBe(false);
  });

  it("bitiş başlangıçtan büyük değilse saatsiz sayar", () => {
    expect(
      isScheduled(task({ id: "y", title: "Y", startTime: at(9), endTime: at(9) })),
    ).toBe(false);
  });

  it("geçerli aralığı planlı sayar", () => {
    expect(
      isScheduled(
        task({ id: "z", title: "Z", startTime: at(9), endTime: at(10) }),
      ),
    ).toBe(true);
  });
});
