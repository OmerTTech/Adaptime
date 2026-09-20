import { useAppSelector, useAppDispatch } from "@/store/hooks";
import {
  completeTask,
  removeTask,
  updateTask,
} from "@/store/slices/routineSlice";
import { openEditModal } from "@/store/slices/uiSlice";
import { isScheduled } from "@/types";
import {
  CheckCircle,
  Circle,
  Pencil,
  Trash2,
  Clock,
  ListTodo,
} from "lucide-react";

export default function UnscheduledTasks() {
  const dispatch = useAppDispatch();
  const tasks = useAppSelector(
    (state) => state.routine.currentRoutine?.tasks ?? [],
  );
  const unscheduled = tasks.filter(
    (t) => !isScheduled(t) && t.status !== "skipped",
  );

  if (unscheduled.length === 0) return null;

  const pendingCount = unscheduled.filter((t) => t.status !== "completed").length;

  return (
    <div className="p-4 rounded-xl border border-dashed border-border bg-background/40">
      <div className="flex items-center gap-2 mb-2">
        <ListTodo size={14} className="text-text-muted" />
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
          Yapılacaklar {pendingCount > 0 && `(${pendingCount})`}
        </h3>
        <span className="text-[10px] text-text-muted/70 ml-auto flex items-center gap-1">
          <Clock size={10} />
          Saatsiz görevler
        </span>
      </div>

      <div className="space-y-1.5">
        {unscheduled.map((task) => {
          const completed = task.status === "completed";
          return (
            <div
              key={task.id}
              className="group flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-surface-hover/50 transition-colors"
            >
              <button
                onClick={() => {
                  if (completed) {
                    dispatch(
                      updateTask({ id: task.id, updates: { status: "pending" } }),
                    );
                  } else {
                    dispatch(completeTask(task.id));
                  }
                }}
                className="shrink-0 cursor-pointer"
                title={completed ? "Geri al" : "Tamamla"}
              >
                {completed ? (
                  <CheckCircle
                    size={18}
                    style={{ color: task.color, opacity: 0.9 }}
                  />
                ) : (
                  <Circle
                    size={18}
                    style={{ color: task.color, opacity: 0.6 }}
                  />
                )}
              </button>

              <span
                className={`text-sm flex-1 min-w-0 truncate ${
                  completed
                    ? "line-through text-text-muted/60"
                    : "text-text"
                }`}
              >
                {task.title}
              </span>

              {task.estimatedMinutes ? (
                <span className="text-[10px] text-text-muted tabular-nums shrink-0">
                  ~{task.estimatedMinutes} dk
                </span>
              ) : null}

              <button
                onClick={() => dispatch(openEditModal(task.id))}
                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-hover text-text-muted transition-all"
                title="Düzenle / zaman ver"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => dispatch(removeTask(task.id))}
                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-surface-hover text-danger transition-all"
                title="Sil"
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-text-muted/60 mt-2">
        Kalem simgesiyle bu göreve planlı bir saat verebilirsin.
      </p>
    </div>
  );
}