import { useState, useEffect } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { closePauseModal, setPendingPauseImpact } from "@/store/slices/uiSlice";
import { resumeTask } from "@/store/slices/routineSlice";
import { calculatePauseImpact } from "@/engine/timeEngine";
import { formatDuration } from "@/utils";
import { ArrowRight, Scissors, Scale, X } from "lucide-react";

const OPTIONS = [
  {
    mode: "shift" as const,
    label: "Kaydır",
    sublabel: "Herşeyi ileri al",
    icon: ArrowRight,
    color: "#6366f1",
    description:
      "Tüm görevler duraklama kadar ileri kaydırılır. Gün geç biter.",
  },
  {
    mode: "cut" as const,
    label: "Kes",
    sublabel: "Süreden düş",
    icon: Scissors,
    color: "#ef4444",
    description: "Aktif görevin süresinden düşülür. Diğer görevler değişmez.",
  },
  {
    mode: "balance" as const,
    label: "Dengele",
    sublabel: "Herkesten biraz",
    icon: Scale,
    color: "#22c55e",
    description:
      "Kayıp, kalan görevlere eşit dağıtılır. Gün aynı saatte biter.",
  },
] as const;

export default function PauseOptionsModal() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector((state) => state.ui.isPauseModalOpen);
  const pausedTaskId = useAppSelector((state) => state.ui.pausedTaskId);
  const tasks = useAppSelector(
    (state) => state.routine.currentRoutine?.tasks ?? [],
  );
  const dayEndTime = useAppSelector(
    (state) => state.routine.currentRoutine?.dayEndTime ?? 0,
  );

  const [livePauseDuration, setLivePauseDuration] = useState(0);

  useEffect(() => {
    if (!isOpen || !pausedTaskId) return;
    const task = tasks.find((t) => t.id === pausedTaskId);
    if (!task?.pausedAt) return;

    const update = () => setLivePauseDuration(Date.now() - task.pausedAt!);
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [isOpen, pausedTaskId, tasks]);

  if (!isOpen || !pausedTaskId) return null;

  const pausedTask = tasks.find((t) => t.id === pausedTaskId);
  if (!pausedTask) return null;

  const handleSelect = (mode: "shift" | "cut" | "balance") => {
    const impact = calculatePauseImpact(
      tasks,
      pausedTaskId,
      livePauseDuration,
      mode,
    );
    dispatch(setPendingPauseImpact(impact));
  };

  const handleBack = () => {
    if (pausedTaskId) dispatch(resumeTask(pausedTaskId));
    dispatch(closePauseModal());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-text">Duraklatıldı</h2>
            <p className="text-sm text-text-muted">
              <span style={{ color: pausedTask.color }} className="font-medium">
                {pausedTask.title}
              </span>{" "}
              durduruldu. Şimdi ne yapalım?
            </p>
          </div>
          <button
            onClick={handleBack}
            className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 p-3 rounded-xl bg-background border border-border">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">Duraklama süresi:</span>
            <span className="text-text font-bold tabular-nums">
              {formatDuration(livePauseDuration)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm mt-1">
            <span className="text-text-muted">Gün bitişi (şu an):</span>
            <span className="text-text font-medium tabular-nums">
              {new Date(dayEndTime).toLocaleTimeString("tr-TR", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {OPTIONS.map((opt) => {
            const impact = calculatePauseImpact(
              tasks,
              pausedTaskId,
              livePauseDuration,
              opt.mode,
            );
            const Icon = opt.icon;
            const newEndTime = new Date(
              impact.newDayEndTime,
            ).toLocaleTimeString("tr-TR", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            });
            const dayShifted = impact.newDayEndTime !== dayEndTime;

            return (
              <button
                key={opt.mode}
                onClick={() => handleSelect(opt.mode)}
                className="w-full text-left p-4 rounded-xl border border-border hover:border-opacity-50 transition-all group"
                style={{
                  ["--hover-color" as string]: opt.color,
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ backgroundColor: opt.color + "15" }}
                  >
                    <Icon size={20} style={{ color: opt.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-text text-sm">
                        {opt.label}
                      </span>
                      <span className="text-xs text-text-muted">
                        {opt.sublabel}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      {opt.description}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className="text-xs font-bold tabular-nums"
                        style={{ color: opt.color }}
                      >
                        Gün bitişi: {newEndTime}
                      </span>
                      {dayShifted && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/10 text-warning">
                          {impact.newDayEndTime > dayEndTime
                            ? "+gecikme"
                            : "-erken"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <button
          onClick={handleBack}
          className="w-full mt-4 py-2.5 rounded-xl border border-border text-text-muted hover:text-text hover:border-border/80 transition-all text-sm font-medium"
        >
          Geri Dön
        </button>
      </div>
    </div>
  );
}
