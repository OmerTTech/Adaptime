import { describe, expect, it } from "vitest";
import type { DayRoutine, TaskBlock } from "@/types";
import { estimateAccuracy, suggestionFor } from "./estimates";

const at = (h: number, m = 0) =>
  new Date(2026, 10, 17, h, m, 0, 0).getTime();

function completed(
  id: string,
  startHour: number,
  actualMinutes: number,
  category: TaskBlock["category"] = "work",
): TaskBlock {
  const start = at(startHour);
  return {
    id,
    title: id,
    color: "#6366f1",
    status: "completed",
    pausedDuration: 0,
    flowExtensions: 0,
    category,
    startTime: start,
    endTime: start + 60 * 60_000,
    originalDuration: 60 * 60_000,
    startedAt: start,
    completedAt: start + actualMinutes * 60_000,
  };
}

function history(tasks: TaskBlock[]): DayRoutine[] {
  return [{ id: "d1", date: "2026-11-17", tasks, dayEndTime: 0, streak: 0 }];
}

describe("estimateAccuracy", () => {
  it("tamamlanan görevlerin gerçek/planlanan oranını kategoriler", () => {
    const result = estimateAccuracy(
      history([completed("a", 9, 90), completed("b", 11, 90)]),
    );
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("work");
    expect(result[0].ratio).toBeCloseTo(1.5, 5);
    expect(result[0].samples).toBe(2);
  });

  it("uç oranları (0.15 altı / 4 üstü) yok sayar", () => {
    const result = estimateAccuracy(
      history([completed("a", 9, 600), completed("b", 11, 600)]),
    );
    expect(result).toHaveLength(0);
  });

  it("tek örnekli kategoriyi listelemez", () => {
    expect(estimateAccuracy(history([completed("a", 9, 90)]))).toHaveLength(0);
  });
});

describe("suggestionFor", () => {
  it("geçmiş orana göre yuvarlanmış süre önerir", () => {
    const suggestion = suggestionFor(
      "work",
      60,
      history([completed("a", 9, 90), completed("b", 11, 90)]),
    );
    expect(suggestion?.suggestedMinutes).toBe(90);
    expect(suggestion?.samples).toBe(2);
  });

  it("fark 5 dakikadan azsa öneri vermez", () => {
    expect(
      suggestionFor(
        "work",
        60,
        history([completed("a", 9, 60), completed("b", 11, 60)]),
      ),
    ).toBeNull();
  });

  it("yeterli örnek yoksa öneri vermez", () => {
    expect(suggestionFor("work", 60, history([completed("a", 9, 90)]))).toBeNull();
  });
});
