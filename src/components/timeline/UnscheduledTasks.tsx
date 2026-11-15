import { useState } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import {
  completeTask,
  removeTask,
  updateTask,
  toggleSubtask,
  detachSubtask,
} from "@/store/slices/routineSlice";
import { openEditModal } from "@/store/slices/uiSlice";
import { playSound } from "@/services/sound";
import { isScheduled } from "@/types";
import {
  CheckCircle,
  ChevronRight,
  Circle,
  Pencil,
  Trash2,
  Clock,
  ListTodo,
  Unlink,
} from "lucide-react";

export default function UnscheduledTasks() {
  const dispatch = useAppDispatch();
  const tasks = useAppSelector(
    (state) => state.routine.currentRoutine?.tasks ?? [],
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const unscheduled = tasks.filter(
    (t) => !isScheduled(t) && t.status !== "skipped",
  );

  if (unscheduled.length === 0) return null;

  const pendingCount = unscheduled.filter((t) => t.status !== "completed").length;

  return (
    <div className="p-4 rounded-xl border border-border bg-surface">
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
          const subtasks = task.subtasks ?? [];
          const doneSubtasks = subtasks.filter((s) => s.done).length;
          const isOpen = expanded[task.id] !== false;

          return (
            <div
              key={task.id}
              className="rounded-lg hover:bg-surface-hover/50 transition-colors"
            >
              <div className="group flex items-center gap-2 px-2 py-1.5">
                <button
                  onClick={() => {
                    if (completed) {
                      dispatch(
                        updateTask({
                          id: task.id,
                          updates: { status: "pending" },
                        }),
                      );
                    } else {
                      dispatch(completeTask(task.id));
                      playSound("taskComplete");
                    }
                  }}
                  className="shrink-0 cursor-pointer p-0.5"
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

                {subtasks.length > 0 && (
                  <button
                    onClick={() =>
                      setExpanded((prev) => ({
                        ...prev,
                        [task.id]: prev[task.id] === false,
                      }))
                    }
                    className="p-1 rounded-md bg-surface-hover/60 text-text-muted hover:text-primary hover:bg-surface-hover transition-colors shrink-0"
                    title={isOpen ? "Alt görevleri kapat" : "Alt görevleri aç"}
                    aria-expanded={isOpen}
                  >
                    <ChevronRight
                      size={16}
                      strokeWidth={2.5}
                      className={`transition-transform duration-300 ${
                        isOpen ? "rotate-90" : ""
                      }`}
                    />
                  </button>
                )}

                <span
                  className={`text-sm flex-1 min-w-0 truncate ${
                    completed ? "line-through text-text-muted/60" : "text-text"
                  }`}
                >
                  {task.title}
                </span>

                {subtasks.length > 0 && (
                  <span className="text-[10px] tabular-nums text-text-muted shrink-0">
                    {doneSubtasks}/{subtasks.length}
                  </span>
                )}

                {task.estimatedMinutes ? (
                  <span className="text-[10px] text-text-muted tabular-nums shrink-0">
                    ~{task.estimatedMinutes} dk
                  </span>
                ) : null}

                <button
                  onClick={() => dispatch(openEditModal(task.id))}
                  className="p-1.5 rounded opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-surface-hover text-text-muted transition-all shrink-0"
                  title="Düzenle / zaman ver"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => dispatch(removeTask(task.id))}
                  className="p-1.5 rounded opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-surface-hover text-danger transition-all shrink-0"
                  title="Sil"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {subtasks.length > 0 && (
                <div
                  className={`grid transition-all duration-300 ease-out ${
                    isOpen
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <ul
                      className="mb-1.5 ml-9 mr-2 space-y-1 border-l pl-3"
                      style={{ borderColor: task.color + "40" }}
                    >
                      {subtasks.map((sub) => (
                        <li
                          key={sub.id}
                          className="flex items-start gap-1 group/sub"
                        >
                          <button
                            onClick={() => {
                              dispatch(
                                toggleSubtask({
                                  id: task.id,
                                  subtaskId: sub.id,
                                }),
                              );
                              if (!sub.done) playSound("taskComplete");
                            }}
                            className="flex flex-1 min-w-0 items-start gap-2 text-left"
                            title={sub.done ? "Geri al" : "Tamamla"}
                          >
                            {sub.done ? (
                              <CheckCircle
                                size={13}
                                className="mt-0.5 shrink-0"
                                style={{ color: task.color }}
                              />
                            ) : (
                              <Circle
                                size={13}
                                className="mt-0.5 shrink-0 text-text-muted/60"
                              />
                            )}
                            <span
                              className={`flex-1 min-w-0 text-xs leading-snug ${
                                sub.done
                                  ? "line-through text-text-muted/60"
                                  : "text-text-muted"
                              }`}
                            >
                              {sub.title}
                            </span>
                          </button>
                          <button
                            onClick={() =>
                              dispatch(
                                detachSubtask({
                                  id: task.id,
                                  subtaskId: sub.id,
                                }),
                              )
                            }
                            className="mt-0.5 p-1 rounded text-text-muted/60 opacity-70 hover:opacity-100 hover:text-danger hover:bg-danger/10 transition-all shrink-0"
                            title="Alt görevden çıkar (Yapılacaklar'a taşır)"
                          >
                            <Unlink size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
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
