import { useState } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { closeFlowModal, setPendingFlowImpact } from "@/store/slices/uiSlice";
import { calculateFlowImpact } from "@/engine/flowState";
import { getPlannedDayEnd } from "@/engine/timeEngine";
import { isScheduled, type FlowMode } from "@/types";
import { Zap, ArrowRight, Scissors, Scale, X, Clock } from "lucide-react";

const MODES: {
  mode: FlowMode;
  label: string;
  short: string;
  explanation: string;
  icon: typeof Scissors;
  color: string;
}[] = [
  {
    mode: "eatNext",
    label: "Kes",
    short: "Sonrakinden düş",
    explanation:
      "Uzayan süre sonraki görevin süresinden kesilir. Gün aynı saatte biter, sonraki iş kısalır.",
    icon: Scissors,
    color: "#ef4444",
  },
  {
    mode: "shift",
    label: "Kaydır",
    short: "Hepsini ileri al",
    explanation:
      "Kalan tüm plan aynı süre kadar ileri kayar. Hiçbir görev kısalmaz, gün geç biter.",
    icon: ArrowRight,
    color: "#f59e0b",
  },
  {
    mode: "balance",
    label: "Dengele",
    short: "Yarı kes, yarı kaydır",
    explanation:
      "Sürenin yarısı sonraki görevden kesilir, yarısı gün sonuna eklenir. Ne görev çok kısalır ne gün çok uzar.",
    icon: Scale,
    color: "#6366f1",
  },
];

const EXTRA_MINUTES_OPTIONS = [15, 30, 45, 60];

const fmt = (ts: number) =>
  new Date(ts).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

export default function FlowStateModal() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector((state) => state.ui.isFlowModalOpen);
  const flowTaskId = useAppSelector((state) => state.ui.flowTaskId);
  const tasks = useAppSelector(
    (state) => state.routine.currentRoutine?.tasks ?? [],
  );
  const storedDayEnd = useAppSelector(
    (state) => state.routine.currentRoutine?.dayEndTime ?? 0,
  );
  const [minutes, setMinutes] = useState<number | null>(null);

  if (!isOpen || !flowTaskId) return null;

  const flowTask = tasks.find((t) => t.id === flowTaskId);
  if (!flowTask || !isScheduled(flowTask)) return null;

  const dayEndTime = getPlannedDayEnd(tasks, storedDayEnd);
  const chosen = minutes ?? null;

  const apply = (mode: FlowMode) => {
    if (!chosen) return;
    dispatch(
      setPendingFlowImpact(calculateFlowImpact(tasks, flowTaskId, chosen, mode)),
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-warning/15">
              <Zap size={20} className="text-warning" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text">Flow</h2>
              <p className="text-xs text-text-muted">
                Süre uzadığında kalan planı gerçeğe uydurur.
              </p>
            </div>
          </div>
          <button
            onClick={() => dispatch(closeFlowModal())}
            className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-text-muted mb-4 leading-relaxed">
          <span style={{ color: flowTask.color }} className="font-medium">
            {flowTask.title}
          </span>{" "}
          planlanan süreyi aştı. Önce <strong className="text-text">ne kadar</strong>{" "}
          uzadığını seç, sonra bu süreyi nasıl karşılayacağını:
        </p>

        {/* 1. adım: süre */}
        <div className="mb-4 p-3 rounded-xl bg-background border border-border">
          <p className="text-xs font-medium text-text mb-2">
            1. Ne kadar süre eklensin?
          </p>
          <div className="grid grid-cols-4 gap-2">
            {EXTRA_MINUTES_OPTIONS.map((min) => (
              <button
                key={min}
                onClick={() => setMinutes(min)}
                className={`py-2 rounded-lg text-sm font-semibold tabular-nums border transition-all ${
                  chosen === min
                    ? "bg-warning text-black border-warning"
                    : "bg-surface border-border text-text hover:border-warning/50"
                }`}
              >
                +{min} dk
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between text-[11px] text-text-muted mt-2">
            <span className="flex items-center gap-1">
              <Clock size={11} /> Gün bitişi: {fmt(dayEndTime)}
            </span>
            <span>
              {chosen
                ? `${fmt(flowTask.endTime)} → ${fmt(flowTask.endTime + chosen * 60_000)}`
                : "süre seçilmedi"}
            </span>
          </div>
        </div>

        {/* 2. adım: yöntem */}
        <p className="text-xs font-medium text-text mb-2">
          2. Kalan plan ne olsun?
          {!chosen && (
            <span className="text-text-muted font-normal">
              {" "}
              — önce süre seç
            </span>
          )}
        </p>
        <div className="space-y-2">
          {MODES.map((opt) => {
            const Icon = opt.icon;
            const disabled = !chosen;
            const impact = chosen
              ? calculateFlowImpact(tasks, flowTaskId, chosen, opt.mode)
              : null;
            return (
              <button
                key={opt.mode}
                onClick={() => apply(opt.mode)}
                disabled={disabled}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  disabled
                    ? "border-border opacity-45 cursor-not-allowed"
                    : "border-border hover:bg-surface-hover/60"
                }`}
                style={!disabled ? { borderColor: opt.color + "55" } : undefined}
              >
                <div className="flex items-center gap-2">
                  <Icon size={15} style={{ color: opt.color }} />
                  <span
                    className="text-sm font-bold"
                    style={{ color: opt.color }}
                  >
                    {opt.label}
                  </span>
                  <span className="text-[11px] text-text-muted">{opt.short}</span>
                  {impact && (
                    <span className="ml-auto text-[11px] tabular-nums text-text-muted">
                      bitiş {fmt(impact.newDayEndTime)}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-text-muted leading-snug mt-1">
                  {opt.explanation}
                </p>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => dispatch(closeFlowModal())}
          className="w-full mt-4 py-2.5 rounded-xl border border-border text-text-muted hover:text-text hover:border-border/80 transition-all text-sm font-medium"
        >
          Gerek yok, süre uzamasın
        </button>
      </div>
    </div>
  );
}
