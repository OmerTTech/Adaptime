import { useAppSelector, useAppDispatch } from "@/store/hooks";
import {
  closeEarlyFinishModal,
  setPendingEarlyFinishImpact,
} from "@/store/slices/uiSlice";
import { calculateEarlyFinishImpact } from "@/engine/earlyFinish";
import { TimerOff, Coffee, ArrowRight, X } from "lucide-react";

export default function EarlyFinishModal() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector((state) => state.ui.isEarlyFinishModalOpen);
  const earlyFinishTaskId = useAppSelector(
    (state) => state.ui.earlyFinishTaskId,
  );
  const tasks = useAppSelector(
    (state) => state.routine.currentRoutine?.tasks ?? [],
  );
  const dayEndTime = useAppSelector(
    (state) => state.routine.currentRoutine?.dayEndTime ?? 0,
  );

  if (!isOpen || !earlyFinishTaskId) return null;

  const task = tasks.find((t) => t.id === earlyFinishTaskId);
  if (!task) return null;

  const remainingMs = Math.max(0, task.endTime - Date.now());
  const savedMinutes = Math.max(0, Math.round(remainingMs / 60000));

  if (savedMinutes <= 0) {
    dispatch(closeEarlyFinishModal());
    return null;
  }

  const handleSelect = (mode: "extendBreak" | "pullForward") => {
    const impact = calculateEarlyFinishImpact(tasks, earlyFinishTaskId, mode);
    dispatch(setPendingEarlyFinishImpact(impact));
  };

  const handleBack = () => {
    dispatch(closeEarlyFinishModal());
  };

  const extendBreakImpact = calculateEarlyFinishImpact(
    tasks,
    earlyFinishTaskId,
    "extendBreak",
  );
  const pullForwardImpact = calculateEarlyFinishImpact(
    tasks,
    earlyFinishTaskId,
    "pullForward",
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-success/15">
              <TimerOff size={20} className="text-success" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text">Erken Bitiş</h2>
              <p className="text-sm text-text-muted">
                <span style={{ color: task.color }} className="font-medium">
                  {task.title}
                </span>{" "}
                için {savedMinutes} dakika kaldı ama erken bitirebilirsin.
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
            <span className="text-text-muted">Kalan süre:</span>
            <span className="text-text font-bold tabular-nums">
              {savedMinutes} dakika
            </span>
          </div>
          <div className="flex items-center justify-between text-sm mt-1">
            <span className="text-text-muted">Mevcut gün bitişi:</span>
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
          <button
            onClick={() => handleSelect("extendBreak")}
            className="w-full text-left p-4 rounded-xl border border-border hover:border-success/50 transition-all"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 mt-0.5 bg-success/10">
                <Coffee size={20} className="text-success" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-text text-sm">
                    Dinlenmeye Ekle
                  </span>
                  <span className="text-xs text-text-muted">Boş ver</span>
                </div>
                <p className="text-xs text-text-muted mt-0.5">
                  {savedMinutes} dakika dinlenme sürenize eklendi. Gün aynı
                  saatte biter.
                </p>
                <div className="mt-2">
                  <span className="text-xs font-bold text-success tabular-nums">
                    Gün bitişi:{" "}
                    {new Date(
                      extendBreakImpact.newDayEndTime,
                    ).toLocaleTimeString("tr-TR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </span>
                </div>
              </div>
            </div>
          </button>

          <button
            onClick={() => handleSelect("pullForward")}
            className="w-full text-left p-4 rounded-xl border border-border hover:border-primary/50 transition-all"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 mt-0.5 bg-primary/10">
                <ArrowRight size={20} className="text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-text text-sm">
                    Sonraki Görevlere Çek
                  </span>
                  <span className="text-xs text-text-muted">Kazan</span>
                </div>
                <p className="text-xs text-text-muted mt-0.5">
                  {savedMinutes} dakika sonraki görevlere aktarılır. Gün{" "}
                  {savedMinutes} dakika erken biter.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs font-bold text-primary tabular-nums">
                    Gün bitişi:{" "}
                    {new Date(
                      pullForwardImpact.newDayEndTime,
                    ).toLocaleTimeString("tr-TR", {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/10 text-success">
                    -{savedMinutes} dk
                  </span>
                </div>
              </div>
            </div>
          </button>
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
