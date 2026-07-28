import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { closeFlowModal, setPendingFlowImpact } from "@/store/slices/uiSlice";
import { calculateFlowImpact } from "@/engine/flowState";
import { Zap, ArrowRight, Scissors, X } from "lucide-react";

const FLOW_OPTIONS = [
  {
    mode: "shift" as const,
    label: "Kaydır",
    sublabel: "Herşeyi ileri al",
    icon: ArrowRight,
    color: "#f59e0b",
    description: "Tüm görevler +30 dakika ileri kaydırılır. Gün geç biter.",
  },
  {
    mode: "eatNext" as const,
    label: "Sonrakinden Düş",
    sublabel: "Zamanı çal",
    icon: Scissors,
    color: "#ef4444",
    description:
      "Sonraki görevin süresinden 30 dakika düşülür. Gün aynı saatte biter.",
  },
] as const;

const EXTRA_MINUTES_OPTIONS = [15, 30, 45, 60];

export default function FlowStateModal() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector((state) => state.ui.isFlowModalOpen);
  const flowTaskId = useAppSelector((state) => state.ui.flowTaskId);
  const tasks = useAppSelector(
    (state) => state.routine.currentRoutine?.tasks ?? [],
  );
  const dayEndTime = useAppSelector(
    (state) => state.routine.currentRoutine?.dayEndTime ?? 0,
  );

  if (!isOpen || !flowTaskId) return null;

  const flowTask = tasks.find((t) => t.id === flowTaskId);
  if (!flowTask) return null;

  const handleSelect = (mode: "shift" | "eatNext", minutes: number) => {
    const impact = calculateFlowImpact(tasks, flowTaskId, minutes, mode);
    dispatch(setPendingFlowImpact(impact));
  };

  const handleBack = () => {
    dispatch(closeFlowModal());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-warning/15">
              <Zap size={20} className="text-warning" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text">Flow State</h2>
              <p className="text-sm text-text-muted">
                <span style={{ color: flowTask.color }} className="font-medium">
                  {flowTask.title}
                </span>{" "}
                devam ediyor. Süre ekleyelim mi?
              </p>
            </div>
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
            <span className="text-text-muted">Mevcut süre:</span>
            <span className="text-text font-medium tabular-nums">
              {Math.round(
                (flowTask.endTime -
                  flowTask.startTime -
                  flowTask.pausedDuration) /
                  60000,
              )}{" "}
              dk
            </span>
          </div>
          <div className="flex items-center justify-between text-sm mt-1">
            <span className="text-text-muted">Gün bitişi:</span>
            <span className="text-text font-medium tabular-nums">
              {new Date(dayEndTime).toLocaleTimeString("tr-TR", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </span>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-xs text-text-muted mb-2 font-medium">
            Ne kadar süre ekleyelim?
          </p>
          <div className="flex gap-2">
            {EXTRA_MINUTES_OPTIONS.map((min) => (
              <button
                key={min}
                className="flex-1 py-2 rounded-lg bg-surface border border-border text-text text-sm font-medium hover:border-warning/50 hover:bg-warning/5 transition-all tabular-nums"
              >
                +{min}dk
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {FLOW_OPTIONS.map((opt) => {
            const Icon = opt.icon;

            return (
              <div key={opt.mode}>
                <p className="text-xs text-text-muted mb-1.5 font-medium px-1">
                  {opt.label} - {opt.sublabel}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {EXTRA_MINUTES_OPTIONS.map((min) => {
                    const impact = calculateFlowImpact(
                      tasks,
                      flowTaskId,
                      min,
                      opt.mode,
                    );
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
                        key={`${opt.mode}-${min}`}
                        onClick={() => handleSelect(opt.mode, min)}
                        className="text-left p-3 rounded-xl border border-border hover:border-opacity-50 transition-all"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Icon size={14} style={{ color: opt.color }} />
                          <span
                            className="text-xs font-bold"
                            style={{ color: opt.color }}
                          >
                            +{min}dk
                          </span>
                        </div>
                        <p className="text-[10px] text-text-muted leading-tight">
                          {opt.description.replace("30", String(min))}
                        </p>
                        <div className="mt-1.5 flex items-center gap-1">
                          <span className="text-[10px] text-text-muted">
                            Bitiş:
                          </span>
                          <span
                            className="text-[10px] font-bold tabular-nums"
                            style={{ color: opt.color }}
                          >
                            {newEndTime}
                          </span>
                          {dayShifted && (
                            <span className="text-[8px] px-1 py-0.5 rounded bg-warning/10 text-warning">
                              +gecikme
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={handleBack}
          className="w-full mt-4 py-2.5 rounded-xl border border-border text-text-muted hover:text-text hover:border-border/80 transition-all text-sm font-medium"
        >
          Gerek Yok
        </button>
      </div>
    </div>
  );
}
