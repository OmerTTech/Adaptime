import { useState } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import {
  completeTask,
  removeTask,
  updateTask,
} from "@/store/slices/routineSlice";
import { PRIORITY_LABEL, isScheduled, type TaskPriority } from "@/types";
import { CheckCircle2, Trash2, X } from "lucide-react";

/** Toplu seçim: birden çok saatsiz görevi tamamla, önceliğini değiştir veya sil. */
export default function BulkTaskModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const tasks = useAppSelector((s) => s.routine.currentRoutine?.tasks ?? []);
  const candidates = tasks.filter(
    (t) => !isScheduled(t) && t.status !== "skipped",
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ids = [...selected];
  const run = (fn: (id: string) => void) => {
    ids.forEach(fn);
    setSelected(new Set());
    onClose();
  };
  const setPriority = (priority: TaskPriority) =>
    run((id) => dispatch(updateTask({ id, updates: { priority } })));

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
          <h3 className="text-sm font-semibold text-text">Toplu düzenle</h3>
          <button onClick={onClose} aria-label="Kapat" className="p-1 text-text-muted hover:text-text">
            <X size={14} />
          </button>
        </div>
        <p className="text-[11px] text-text-muted mt-1">
          Saatsiz görevlerden seç; sonra tek işlem uygula.
        </p>

        <div className="mt-2 max-h-[50vh] overflow-y-auto space-y-1">
          {candidates.length === 0 && (
            <p className="text-[11px] text-text-muted">Seçilecek görev yok.</p>
          )}
          {candidates.map((t) => (
            <label
              key={t.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.has(t.id)}
                onChange={() => toggle(t.id)}
                className="w-4 h-4 rounded accent-primary shrink-0"
              />
              <span
                className={`text-xs flex-1 min-w-0 truncate ${
                  t.status === "completed" ? "text-text-muted line-through" : "text-text"
                }`}
              >
                {t.title}
              </span>
              <span className="text-[10px] text-text-muted shrink-0">
                {PRIORITY_LABEL[t.priority ?? "medium"]}
              </span>
            </label>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-text-muted w-full">
            {selected.size} seçili
          </span>
          <button
            disabled={selected.size === 0}
            onClick={() => run((id) => dispatch(completeTask(id)))}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-success/10 border border-success/30 text-success text-[10px] font-medium disabled:opacity-40"
          >
            <CheckCircle2 size={11} /> Tamamla
          </button>
          <button
            disabled={selected.size === 0}
            onClick={() => setPriority("high")}
            className="px-2 py-1 rounded-lg border border-border text-text text-[10px] disabled:opacity-40"
          >
            Öncelik: yüksek
          </button>
          <button
            disabled={selected.size === 0}
            onClick={() => setPriority("low")}
            className="px-2 py-1 rounded-lg border border-border text-text text-[10px] disabled:opacity-40"
          >
            Öncelik: düşük
          </button>
          <button
            disabled={selected.size === 0}
            onClick={() => run((id) => dispatch(removeTask(id)))}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-danger/10 border border-danger/30 text-danger text-[10px] font-medium disabled:opacity-40"
          >
            <Trash2 size={11} /> Sil
          </button>
        </div>
      </div>
    </div>
  );
}
