import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { startTask } from "@/store/slices/routineSlice";
import { openEditModal } from "@/store/slices/uiSlice";
import { isScheduled, PRIORITY_ORDER, type TaskBlock } from "@/types";
import { formatClock } from "@/utils";
import { ArrowRight, Play, Sparkles } from "lucide-react";

function nextTask(tasks: TaskBlock[]): TaskBlock | null {
  const open = tasks.filter(
    (t) =>
      t.status !== "completed" &&
      t.status !== "skipped" &&
      t.status !== "active" &&
      t.status !== "paused",
  );
  if (open.length === 0) return null;
  return [...open].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority ?? "medium"];
    const pb = PRIORITY_ORDER[b.priority ?? "medium"];
    if (pa !== pb) return pa - pb;
    const da = a.deadline ?? a.endTime ?? Number.MAX_SAFE_INTEGER;
    const db = b.deadline ?? b.endTime ?? Number.MAX_SAFE_INTEGER;
    return da - db;
  })[0];
}

/**
 * Karar yorgunluğunu kesen sade mod: tek görev, tek süre, tek düğme.
 * "Şimdi ne yapmalıyım?" sorusunun cevabını doğrudan verir.
 */
export default function NowNextCard() {
  const dispatch = useAppDispatch();
  const tasks = useAppSelector((s) => s.routine.currentRoutine?.tasks ?? []);
  const task = nextTask(tasks);

  if (!task) return null;

  const minutes = task.estimatedMinutes ?? 30;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <Sparkles size={13} className="text-primary" />
        <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">
          Şimdi ne yapmalıyım?
        </span>
        <span className="ml-auto text-[10px] text-text-muted">
          {isScheduled(task) ? formatClock(task.startTime) : `~${minutes} dk`}
        </span>
      </div>

      <p className="text-sm font-semibold text-text mb-2 break-words">
        {task.title}
      </p>

      <div className="flex items-center gap-2">
        <button
          onClick={() => dispatch(startTask(task.id))}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          <Play size={13} />
          Hemen başla
        </button>
        <button
          onClick={() => dispatch(openEditModal(task.id))}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-surface border border-border text-text-muted hover:text-text text-xs transition-colors"
        >
          Düzenle
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}
