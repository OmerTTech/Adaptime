import { useAppSelector, useAppDispatch } from "@/store/hooks";
import {
  completeTask,
  removeTask,
  skipTask,
  updateTask,
} from "@/store/slices/routineSlice";
import { CheckCircle2, Moon, Trash2, X } from "lucide-react";

/**
 * Gün kapanışı: açık görevler için tek tek "tamamla / yarına devret / bırak".
 * Suçlayıcı dil yok; karar sayısı az.
 */
export default function DayClosingModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const tasks = useAppSelector((s) => s.routine.currentRoutine?.tasks ?? []);
  const open = tasks.filter(
    (t) => t.status === "pending" || t.status === "active" || t.status === "paused",
  );

  const carry = (id: string) =>
    dispatch(updateTask({ id, updates: { carryPolicy: "rolling" } }));

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-center justify-center px-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text">Günü kapat</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-text-muted hover:text-text"
            aria-label="Kapat"
          >
            <X size={14} />
          </button>
        </div>
        <p className="text-[11px] text-text-muted mt-1">
          {open.length === 0
            ? "Açık görev yok. Gün tamam."
            : `${open.length} görev açık. Her biri için tek karar yeter.`}
        </p>
        <div className="mt-2 space-y-1.5 max-h-[55vh] overflow-y-auto">
          {open.map((task) => (
            <div
              key={task.id}
              className="rounded-lg border border-border bg-background px-2 py-1.5"
            >
              <p className="text-xs text-text truncate">{task.title}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <button
                  onClick={() => dispatch(completeTask(task.id))}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-success/10 border border-success/30 text-success text-[10px] font-medium hover:bg-success/20"
                >
                  <CheckCircle2 size={10} /> Tamamla
                </button>
                <button
                  onClick={() => carry(task.id)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/30 text-primary text-[10px] font-medium hover:bg-primary/20"
                >
                  <Moon size={10} /> Yarına devret
                </button>
                <button
                  onClick={() => dispatch(skipTask(task.id))}
                  className="px-2 py-0.5 rounded-md border border-border text-text-muted text-[10px] hover:text-text"
                >
                  Bugünlük bırak
                </button>
                <button
                  onClick={() => dispatch(removeTask(task.id))}
                  className="ml-auto p-1 rounded-md text-danger/70 hover:text-danger hover:bg-danger/10"
                  title="Sil"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          className="mt-3 w-full py-2 rounded-lg bg-background border border-border text-xs text-text-muted hover:text-text transition-colors"
        >
          Kapat
        </button>
      </div>
    </div>
  );
}
