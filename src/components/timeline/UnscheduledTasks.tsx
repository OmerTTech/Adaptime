import { useRef, useState } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import {
  completeTask,
  duplicateTask,
  removeTask,
  updateTask,
  startTask,
  toggleSubtask,
  detachSubtask,
  renameSubtask,
} from "@/store/slices/routineSlice";
import { openEditModal } from "@/store/slices/uiSlice";
import { playSound } from "@/services/sound";
import { isScheduled, PRIORITY_ORDER } from "@/types";
import {
  Check,
  CheckCircle,
  ChevronRight,
  Circle,
  Copy,
  Crosshair,
  Pencil,
  Play,
  Clock,
  ListTodo,
  Unlink,
} from "lucide-react";
import ConfirmDeleteButton from "@/components/ui/ConfirmDeleteButton";

const VISIBLE_LIMIT = 8;

export default function UnscheduledTasks() {
  const dispatch = useAppDispatch();
  const tasks = useAppSelector(
    (state) => state.routine.currentRoutine?.tasks ?? [],
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [focusId, setFocusId] = useState<string | null>(null);
  // Alt görev başlığı satır içi düzenlenir (kalem → input).
  const [editingSub, setEditingSub] = useState<{
    taskId: string;
    subId: string;
    value: string;
  } | null>(null);
  // Esc ile iptal edildiyse blur'da kaydetme.
  const cancelSubEdit = useRef(false);

  const saveSubtaskTitle = () => {
    if (cancelSubEdit.current) {
      cancelSubEdit.current = false;
      setEditingSub(null);
      return;
    }
    if (!editingSub) return;
    const title = editingSub.value.trim();
    if (title) {
      dispatch(
        renameSubtask({
          id: editingSub.taskId,
          subtaskId: editingSub.subId,
          title,
        }),
      );
    }
    setEditingSub(null);
  };
  // Uzun listeler performans için parça parça gösterilir (ayardan kapatılabilir).
  const [visibleCount, setVisibleCount] = useState(VISIBLE_LIMIT);
  const progressive = useAppSelector((s) => s.ui.progressiveLists);
  // Açık görevler üstte (öncelik sırasına göre), tamamlananlar en altta.
  const unscheduled = tasks
    .filter((t) => !isScheduled(t) && t.status !== "skipped")
    .sort((a, b) => {
      const doneA = a.status === "completed" ? 1 : 0;
      const doneB = b.status === "completed" ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      if (doneA === 1) return (b.completedAt ?? 0) - (a.completedAt ?? 0);
      const pa = PRIORITY_ORDER[a.priority ?? "medium"];
      const pb = PRIORITY_ORDER[b.priority ?? "medium"];
      if (pa !== pb) return pa - pb;
      return (a.createdAtClient ?? 0) - (b.createdAtClient ?? 0);
    });

  if (unscheduled.length === 0) return null;

  const pendingCount = unscheduled.filter((t) => t.status !== "completed").length;
  const focused = unscheduled.find((t) => t.id === focusId) ?? null;
  const shown = focused
    ? [focused]
    : progressive
      ? unscheduled.slice(0, visibleCount)
      : unscheduled;

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

      {focused && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-[11px] text-primary">
          <Crosshair size={12} className="shrink-0" />
          <span className="truncate">Odak: {focused.title}</span>
          <button
            onClick={() => setFocusId(null)}
            className="ml-auto shrink-0 hover:underline"
          >
            Tümünü göster
          </button>
        </div>
      )}

      <div className="space-y-1">
        {shown.map((task) => {
          const completed = task.status === "completed";
          const subtasks = task.subtasks ?? [];
          const doneSubtasks = subtasks.filter((s) => s.done).length;
          const isOpen = expanded[task.id] !== false;

          return (
            <div
              key={task.id}
              className={`rounded-lg transition-colors ${
                completed ? "bg-surface-hover/30" : "hover:bg-surface-hover/50"
              }`}
            >
              <div className="group flex items-center gap-1.5 px-1 py-1.5">
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
                  className={`shrink-0 cursor-pointer rounded-full transition-transform ${
                    completed
                      ? ""
                      : "p-0.5 hover:scale-110 hover:bg-surface-hover"
                  }`}
                  title={completed ? "Geri al" : "Tamamla"}
                  aria-pressed={completed}
                >
                  {completed ? (
                    <span
                      className="w-6 h-6 rounded-full grid place-items-center shadow-sm"
                      style={{ backgroundColor: task.color }}
                    >
                      <Check size={15} className="text-white" strokeWidth={3} />
                    </span>
                  ) : (
                    <Circle
                      size={24}
                      className="text-text-muted/70"
                      style={{ color: task.color, opacity: 0.9 }}
                      strokeWidth={2}
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
                      size={18}
                      strokeWidth={2.5}
                      className={`transition-transform duration-300 ${
                        isOpen ? "rotate-90" : ""
                      }`}
                    />
                  </button>
                )}

                <span
                  className={`text-[15px] font-medium sm:text-sm sm:font-normal flex-1 min-w-0 line-clamp-2 leading-snug ${
                    completed ? "line-through text-text-muted/60" : "text-text"
                  }`}
                  title={`${task.title} — çift tıkla düzenle`}
                  onDoubleClick={() => dispatch(openEditModal(task.id))}
                >
                  {task.title}
                </span>

                {task.parallel && (
                  <span
                    className="text-[10px] text-primary shrink-0"
                    title="Aynı anda başka bir görevle yapılıyor"
                  >
                    ∥
                  </span>
                )}

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
                  onClick={() =>
                    setFocusId(focused?.id === task.id ? null : task.id)
                  }
                  className={`p-2 rounded-lg shrink-0 transition-colors ${
                    focused?.id === task.id
                      ? "bg-primary text-white"
                      : "bg-surface-hover/60 text-text-muted hover:text-text"
                  }`}
                  title={
                    focused?.id === task.id
                      ? "Odağı kapat"
                      : "Sadece bu görevi göster"
                  }
                >
                  <Crosshair size={16} />
                </button>
                {!completed && (
                  <button
                    onClick={() => dispatch(startTask(task.id))}
                    className="p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
                    title={`Şimdi başla (${task.estimatedMinutes ?? 30} dk)`}
                  >
                    <Play size={16} />
                  </button>
                )}
                <button
                  onClick={() => dispatch(duplicateTask(task.id))}
                  className="p-2 rounded-lg bg-surface-hover/60 text-text-muted hover:text-text transition-colors shrink-0"
                  title="Kopyala (kopya yapılacaklara eklenir)"
                >
                  <Copy size={16} />
                </button>
                <button
                  onClick={() => dispatch(openEditModal(task.id))}
                  className="p-2 rounded-lg bg-surface-hover/60 text-text-muted hover:text-text transition-colors shrink-0"
                  title="Düzenle / zaman ver"
                >
                  <Pencil size={16} />
                </button>
                <ConfirmDeleteButton
                  onConfirm={() => dispatch(removeTask(task.id))}
                  className="p-2 rounded-lg bg-danger/10 text-danger hover:bg-danger/20 transition-colors shrink-0"
                  size={16}
                />
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
                      className="mt-1 mb-2.5 ml-8 mr-1 space-y-1 border-l pl-3"
                      style={{ borderColor: task.color + "40" }}
                    >
                      {subtasks.map((sub) => (
                        <li
                          key={sub.id}
                          className="flex items-start gap-2 group/sub"
                        >
                          {editingSub?.taskId === task.id &&
                          editingSub.subId === sub.id ? (
                            <input
                              autoFocus
                              value={editingSub.value}
                              onChange={(e) =>
                                setEditingSub((prev) =>
                                  prev ? { ...prev, value: e.target.value } : prev,
                                )
                              }
                              onBlur={saveSubtaskTitle}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                                if (e.key === "Escape") {
                                  cancelSubEdit.current = true;
                                  setEditingSub(null);
                                }
                              }}
                              className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-background border border-primary/40 text-[13px] text-text"
                            />
                          ) : (
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
                              className="flex flex-1 min-w-0 items-start gap-2 text-left py-0.5"
                              title={sub.done ? "Geri al" : "Tamamla"}
                            >
                              {sub.done ? (
                                <CheckCircle
                                  size={16}
                                  className="mt-0.5 shrink-0"
                                  style={{ color: task.color }}
                                />
                              ) : (
                                <Circle
                                  size={16}
                                  className="mt-0.5 shrink-0 text-text-muted/60"
                                />
                              )}
                              <span
                                className={`flex-1 min-w-0 text-[13px] leading-snug ${
                                  sub.done
                                    ? "line-through text-text-muted/60"
                                    : "text-text-muted"
                                }`}
                              >
                                {sub.title}
                              </span>
                            </button>
                          )}
                          <button
                            onClick={() => {
                              cancelSubEdit.current = false;
                              setEditingSub({
                                taskId: task.id,
                                subId: sub.id,
                                value: sub.title,
                              });
                            }}
                            className="mt-0.5 p-1.5 rounded-lg bg-surface-hover/50 text-text-muted/70 hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
                            title="Alt görevi düzenle"
                          >
                            <Pencil size={15} />
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
                            className="mt-0.5 mr-2 p-1.5 rounded-lg bg-surface-hover/50 text-text-muted/70 hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
                            title="Alt görevden çıkar (Yapılacaklar'a taşır)"
                          >
                            <Unlink size={15} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* 3+ gündür devreden görev: nazikçe küçült/böl/sil önerisi. */}
              {(task.carryCount ?? 0) >= 3 && !completed && (
                <div className="mx-1 mb-2 px-2.5 py-2 rounded-lg bg-warning/10 border border-warning/30">
                  <p className="text-[11px] text-text leading-snug">
                    Bu görev <strong>{task.carryCount} gündür</strong> devam
                    ediyor.
                  </p>
                  <p className="text-[10px] text-text-muted leading-snug mt-0.5">
                    Bugün bitirebileceğin kadar küçült, alt görevlere böl ya da
                    artık gündemden çıkar.
                  </p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <button
                      type="button"
                      onClick={() => dispatch(openEditModal(task.id))}
                      className="px-2 py-1 rounded-lg bg-background border border-border text-[10px] text-text hover:border-primary/50 transition-colors"
                    >
                      Küçült
                    </button>
                    <button
                      type="button"
                      onClick={() => dispatch(openEditModal(task.id))}
                      className="px-2 py-1 rounded-lg bg-background border border-border text-[10px] text-text hover:border-primary/50 transition-colors"
                    >
                      Alt görevlere böl
                    </button>
                    <ConfirmDeleteButton
                      onConfirm={() => dispatch(removeTask(task.id))}
                      title="Bu görevi sil"
                      className="px-1.5 py-1 rounded-lg bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
                      size={12}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {progressive && !focused && unscheduled.length > visibleCount && (
        <>
          <button
            onClick={() => setVisibleCount((v) => v + 5)}
            className="mt-2 text-[11px] text-primary hover:underline"
          >
            +{Math.min(5, unscheduled.length - visibleCount)} görev daha
            {unscheduled.length - visibleCount > 5
              ? ` (${unscheduled.length - visibleCount} kaldı)`
              : ""}
          </button>
          <p className="text-[10px] text-text-muted/70 mt-1">
            Tümünü birden görmek için Ayarlar → Liste görünümü’nden bu
            gösterimi kapatabilirsin.
          </p>
        </>
      )}
      {progressive && !focused && visibleCount > VISIBLE_LIMIT && (
        <button
          onClick={() => setVisibleCount(VISIBLE_LIMIT)}
          className="mt-2 ml-3 text-[11px] text-text-muted hover:text-text"
        >
          Daha az göster
        </button>
      )}

      <p className="text-[10px] text-text-muted/60 mt-2">
        Kalem simgesiyle bu göreve planlı bir saat verebilirsin.
      </p>
    </div>
  );
}
