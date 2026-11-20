import { useEffect, useState } from "react";
import type { TaskBlock } from "@/types";
import { playSound } from "@/services/sound";
import { Wind } from "lucide-react";

/**
 * 2.6 — Başlangıç ritüeli: 10 saniyelik nefes + tek cümle hedef.
 * Büyük görevi başlatmayı kolaylaştırır; hedef `firstAction`a yazılır.
 */
export default function StartRitualModal({
  task,
  onStart,
  onClose,
}: {
  task: TaskBlock;
  onStart: (goal: string) => void;
  onClose: () => void;
}) {
  const [seconds, setSeconds] = useState(10);
  const [goal, setGoal] = useState(task.firstAction ?? "");

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  const start = () => {
    playSound("focusStart");
    onStart(goal.trim());
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center px-3">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 text-center">
        <div className="mx-auto w-20 h-20 rounded-full border-2 border-primary/30 flex items-center justify-center relative">
          <div
            className="absolute inset-0 rounded-full border-2 border-primary transition-all duration-1000"
            style={{
              transform: `scale(${0.6 + (10 - seconds) * 0.04})`,
              opacity: seconds === 0 ? 0.9 : 0.4,
            }}
          />
          <span className="text-2xl font-bold text-primary tabular-nums">
            {seconds}
          </span>
        </div>
        <p className="text-xs text-text-muted mt-3 flex items-center justify-center gap-1.5">
          <Wind size={12} />
          {seconds > 6 ? "Nefes al…" : seconds > 3 ? "Tut…" : seconds > 0 ? "Ver…" : "Hazırsın."}
        </p>
        <h3 className="text-sm font-semibold text-text mt-3 break-words">
          {task.title}
        </h3>
        <p className="text-[11px] text-text-muted mt-1">
          İlk 2 dakikada ne yapacaksın? Tek cümle yeter.
        </p>
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="Örn: ilk paragrafı yaz"
          className="mt-2 w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <div className="flex gap-2 mt-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-border text-text-muted text-xs hover:text-text transition-colors"
          >
            Vazgeç
          </button>
          <button
            onClick={start}
            className="flex-1 py-2 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            {seconds > 0 ? "Nefesi atla, başla" : "Başla"}
          </button>
        </div>
      </div>
    </div>
  );
}
