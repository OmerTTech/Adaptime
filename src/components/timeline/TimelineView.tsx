import { useEffect, useRef, useState, useCallback } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { formatTime, formatDuration } from "@/utils";
import { PRIORITY_LABEL, isScheduled } from "@/types";
import {
  Play,
  Pause,
  CheckCircle,
  SkipForward,
  Clock,
  Pencil,
  Copy,
  ChevronRight,
  Crosshair,
  Circle,
  Unlink,
} from "lucide-react";
import {
  startTask,
  pauseTask,
  completeTask,
  skipTask,
  updateTask,
  duplicateTask,
  removeTask,
  adjustTaskEnd,
  toggleSubtask,
  detachSubtask,
  renameSubtask,
} from "@/store/slices/routineSlice";
import { openPauseModal, openEditModal } from "@/store/slices/uiSlice";
import { playSound } from "@/services/sound";
import ConfirmDeleteButton from "@/components/ui/ConfirmDeleteButton";
import UnscheduledTasks from "./UnscheduledTasks";

export default function TimelineView() {
  const tasks = useAppSelector(
    (state) => state.routine.currentRoutine?.tasks ?? [],
  );
  const dispatch = useAppDispatch();
  const [, setTick] = useState(0);
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

  // Tamamlanan planlı görevler listenin en altına iner; kalanlar saat sırasında.
  const scheduledTasks = tasks.filter(isScheduled).sort((a, b) => {
    const doneA = a.status === "completed" ? 1 : 0;
    const doneB = b.status === "completed" ? 1 : 0;
    if (doneA !== doneB) return doneA - doneB;
    return a.startTime! - b.startTime!;
  });
  const hasUnscheduled = tasks.some((t) => !isScheduled(t));
  const focusedTask = scheduledTasks.find((t) => t.id === focusId) ?? null;
  const visibleTasks = focusedTask ? [focusedTask] : scheduledTasks;

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleCheckboxToggle = useCallback(
    (task: (typeof tasks)[0]) => {
      if (task.status === "completed") {
        dispatch(updateTask({ id: task.id, updates: { status: "pending" } }));
      } else if (task.status === "pending" || task.status === "skipped") {
        dispatch(completeTask(task.id));
        playSound("taskComplete");
      }
    },
    [dispatch],
  );

  const handleTaskAction = useCallback(
    (task: (typeof tasks)[0]) => {
      switch (task.status) {
        case "pending":
        case "skipped":
          dispatch(startTask(task.id));
          break;
        case "active":
          dispatch(pauseTask(task.id));
          break;
        case "paused":
          dispatch(openPauseModal({ taskId: task.id, pauseDuration: 0 }));
          break;
        case "completed":
          break;
      }
    },
    [dispatch],
  );

  const getEffectiveDuration = (task: (typeof tasks)[0]) => {
    const base = (task.endTime ?? 0) - (task.startTime ?? 0);
    return Math.max(0, base - task.pausedDuration);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-2">
      {!focusedTask && hasUnscheduled && <UnscheduledTasks />}

      {focusedTask && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2">
          <p className="text-xs font-medium text-primary flex items-center gap-1.5 min-w-0">
            <Crosshair size={12} className="shrink-0" />
            <span className="truncate">Odak: {focusedTask.title}</span>
          </p>
          <button
            onClick={() => setFocusId(null)}
            className="text-[10px] text-text-muted hover:text-text transition-colors shrink-0"
          >
            Tümünü göster
          </button>
        </div>
      )}

      {visibleTasks.length > 0 && (
        <div className="pt-2 pb-1 flex items-center gap-2">
          <Clock size={12} className="text-primary" />
          <p className="text-xs text-text-muted font-medium">
            Planlanan Görevler
          </p>
        </div>
      )}

      {visibleTasks.map((task, i) => {
        const duration = getEffectiveDuration(task);
        const activeStart = task.startedAt ?? task.startTime!;
        const pausedExtra =
          task.status === "paused" && task.pausedAt
            ? Date.now() - task.pausedAt
            : 0;
        const total = (task.endTime ?? 0) - (task.startTime ?? 0);
        const preGap = task.startedAt
          ? Math.max(0, task.startedAt - task.startTime!)
          : 0;
        const preGapPct = total > 0 ? (preGap / total) * 100 : 0;
        const elapsedActive =
          task.status === "active"
            ? Math.max(0, Date.now() - activeStart - task.pausedDuration)
            : 0;
        const activePct = total > 0 ? (elapsedActive / total) * 100 : 0;
        const pausePct =
          total > 0 && task.status === "paused"
            ? (pausedExtra / total) * 100
            : 0;
        const subtasks = task.subtasks ?? [];
        const doneSubtasks = subtasks.filter((s) => s.done).length;
        // Alt görevler varsayılan olarak açık; kullanıcı kapatırsa kapalı kalır.
        const isOpen = expanded[task.id] !== false;

        return (
          <div
            key={task.id}
            className="group flex flex-wrap items-center gap-x-4 gap-y-3 p-3 sm:p-4 rounded-xl bg-surface border border-border hover:border-border/80 transition-all"
          >
            <button
              onClick={() => handleCheckboxToggle(task)}
              className="relative focus:outline-none cursor-pointer"
              title={
                task.status === "completed"
                  ? "Tamamlanmadı olarak işaretle"
                  : "Tamamla"
              }
            >
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: task.color + "20" }}
              >
                {task.status === "completed" ? (
                  <CheckCircle size={20} style={{ color: task.color }} />
                ) : task.status === "skipped" ? (
                  <SkipForward size={18} style={{ color: "#ef4444" }} />
                ) : (
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{
                      backgroundColor: task.color,
                      boxShadow:
                        task.status === "active"
                          ? `0 0 8px ${task.color}`
                          : "none",
                    }}
                  />
                )}
              </div>
              {i < visibleTasks.length - 1 && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-px h-2 bg-border" />
              )}
            </button>

            <div className="flex-1 min-w-0 basis-[12rem]">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {subtasks.length > 0 && (
                  <button
                    onClick={() =>
                      setExpanded((prev) => ({
                        ...prev,
                        // Kapalıysa aç, açıksa kapat (varsayılan: açık)
                        [task.id]: prev[task.id] === false,
                      }))
                    }
                    className="-ml-1.5 p-1 rounded-md bg-surface-hover/60 text-text-muted hover:text-primary hover:bg-surface-hover transition-colors shrink-0"
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
                <h3
                  className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-text line-clamp-2 sm:text-sm sm:font-medium sm:leading-normal sm:line-clamp-1"
                  title={`${task.title} — çift tıkla düzenle`}
                  onDoubleClick={() => dispatch(openEditModal(task.id))}
                >
                  {task.title}
                </h3>
                {subtasks.length > 0 && (
                  <span className="text-[10px] tabular-nums text-text-muted shrink-0">
                    {doneSubtasks}/{subtasks.length}
                  </span>
                )}
                {task.status === "active" && (
                  <span className="text-xs text-success">● Canlı</span>
                )}
                {task.status === "paused" && (
                  <span className="text-xs text-warning">● Duraklatıldı</span>
                )}
                {task.status === "skipped" && (
                  <span className="text-xs text-danger">Pass geçildi</span>
                )}
                {task.parallel && (
                  <span
                    className="text-[10px] text-primary shrink-0"
                    title="Aynı anda başka bir görevle yapılabilir"
                  >
                    ∥ aynı anda
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-text-muted">
                  {formatTime(task.startTime!)} - {formatTime(task.endTime!)}
                </span>
                <span className="text-xs text-text-muted">
                  {formatDuration(duration)}
                </span>
                <button
                  onClick={() => dispatch(duplicateTask(task.id))}
                  className="p-1 rounded-md bg-surface-hover text-text-muted hover:text-text transition-colors shrink-0"
                  title="Kopyala (kopya yapılacaklara eklenir, kalemle düzenle)"
                >
                  <Copy size={13} />
                </button>
                {(task.status === "active" || task.status === "paused") && (
                  <div className="flex items-center gap-1 ml-auto shrink-0">
                    <button
                      onClick={() =>
                        dispatch(adjustTaskEnd({ id: task.id, minutes: -5 }))
                      }
                      className="px-1.5 py-0.5 rounded-md bg-surface-hover text-text-muted hover:text-text text-[11px] tabular-nums transition-colors"
                      title="Bitişi 5 dk öne al"
                    >
                      −5
                    </button>
                    <button
                      onClick={() =>
                        dispatch(adjustTaskEnd({ id: task.id, minutes: 5 }))
                      }
                      className="px-1.5 py-0.5 rounded-md bg-surface-hover text-text-muted hover:text-text text-[11px] tabular-nums transition-colors"
                      title="Bitişi 5 dk uzat"
                    >
                      +5
                    </button>
                  </div>
                )}
              </div>
              {(task.priority || task.deadline || (task.delayCount ?? 0) > 0) && (
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {task.priority && task.priority !== "medium" && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        task.priority === "critical"
                          ? "bg-danger/10 text-danger border-danger/30"
                          : "bg-warning/10 text-warning border-warning/30"
                      }`}
                    >
                      {PRIORITY_LABEL[task.priority]}
                    </span>
                  )}
                  {task.deadline && (
                    <span
                      className={`text-[10px] tabular-nums ${
                        task.status !== "completed" && task.deadline < Date.now()
                          ? "text-danger"
                          : "text-text-muted"
                      }`}
                    >
                      deadline {formatTime(task.deadline)}
                    </span>
                  )}
                  {(task.delayCount ?? 0) > 0 && (
                    <span className="text-[10px] text-warning">
                      {task.delayCount}× ertelendi
                    </span>
                  )}
                </div>
              )}
              {(task.status === "active" || task.status === "paused") && (
                <div className="mt-2 h-1.5 bg-border rounded-full overflow-hidden flex">
                  {preGapPct > 0 && (
                    <div
                      className="h-full transition-all duration-1000"
                      style={{
                        width: `${preGapPct}%`,
                        backgroundColor: "var(--text-muted)",
                        opacity: 0.2,
                      }}
                    />
                  )}
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${Math.max(0, activePct)}%`,
                      backgroundColor: task.color,
                      opacity: task.status === "paused" ? 0.6 : 1,
                    }}
                  />
                  {task.status === "paused" && pausePct > 0 && (
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: `${pausePct}%`,
                        backgroundColor: "#f59e0b",
                      }}
                    />
                  )}
                </div>
              )}
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
                      className="mt-2 space-y-1 border-l pl-3"
                      style={{ borderColor: task.color + "40" }}
                    >
                      {subtasks.map((sub) => (
                        <li key={sub.id} className="flex items-start gap-1 group/sub">
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
                              className="flex-1 min-w-0 px-1.5 py-0.5 rounded bg-background border border-primary/40 text-xs text-text"
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
                            className="mt-0.5 p-1 rounded text-text-muted/60 opacity-70 hover:opacity-100 hover:text-primary hover:bg-primary/10 transition-all shrink-0"
                            title="Alt görevi düzenle"
                          >
                            <Pencil size={12} />
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

            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() =>
                  setFocusId(focusedTask?.id === task.id ? null : task.id)
                }
                className={`p-2 rounded-lg transition-colors ${
                  focusedTask?.id === task.id
                    ? "bg-primary text-white"
                    : "bg-surface-hover text-text-muted hover:text-text"
                }`}
                title={
                  focusedTask?.id === task.id
                    ? "Odağı kapat"
                    : "Sadece bu görevi göster"
                }
              >
                <Crosshair size={16} />
              </button>
              {task.status === "pending" && (
                <button
                  onClick={() => dispatch(skipTask(task.id))}
                  className="p-2 rounded-lg bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
                  title="Pass geç"
                >
                  <SkipForward size={16} />
                </button>
              )}
              {task.status !== "completed" && (
                <button
                  onClick={() => handleTaskAction(task)}
                  className={`p-2 rounded-lg transition-colors ${
                    task.status === "active"
                      ? "bg-warning/10 text-warning hover:bg-warning/20"
                      : task.status === "paused"
                        ? "bg-success/10 text-success hover:bg-success/20"
                        : "bg-primary/10 text-primary hover:bg-primary/20"
                  }`}
                  title={
                    task.status === "active"
                      ? "Duraklat"
                      : task.status === "paused"
                        ? "Devam et"
                        : "Başlat"
                  }
                >
                  {task.status === "active" ? (
                    <Pause size={16} />
                  ) : (
                    <Play size={16} />
                  )}
                </button>
              )}
              {(task.status === "active" || task.status === "paused") && (
                <button
                  onClick={() => {
                    dispatch(completeTask(task.id));
                    playSound("taskComplete");
                  }}
                  className="p-2 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors"
                  title="Tamamla"
                >
                  <CheckCircle size={16} />
                </button>
              )}
              {task.status === "skipped" && (
                <button
                  onClick={() => {
                    dispatch(completeTask(task.id));
                    playSound("taskComplete");
                  }}
                  className="p-2 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors"
                  title="Tamamlandı işaretle"
                >
                  <CheckCircle size={16} />
                </button>
              )}
              {/* Kalem her durumda görünür: aktif/duraklatılmış görev de düzenlenebilir. */}
              <button
                onClick={() => dispatch(openEditModal(task.id))}
                className="p-2 rounded-lg bg-surface-hover text-text-muted hover:text-text transition-colors"
                title="Düzenle"
              >
                <Pencil size={16} />
              </button>
              {task.status !== "active" && task.status !== "paused" && (
                <ConfirmDeleteButton
                  onConfirm={() => dispatch(removeTask(task.id))}
                  className="p-2 rounded-lg bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
                  size={16}
                />
              )}
            </div>
          </div>
        );
      })}

      {tasks.length === 0 && (
        <div className="text-center py-12 text-text-muted">
          <Clock size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-sm">Henüz görev eklenmedi.</p>
          <p className="text-xs mt-1">+ butonu ile ilk görevinizi ekleyin.</p>
        </div>
      )}
    </div>
  );
}