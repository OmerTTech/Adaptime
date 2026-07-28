import { useEffect, useState, useCallback } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { formatTime, formatDuration } from "@/utils";
import { Play, Pause, CheckCircle, Clock } from "lucide-react";
import {
  startTask,
  pauseTask,
  resumeTask,
  completeTask,
} from "@/store/slices/routineSlice";
import { openPauseModal } from "@/store/slices/uiSlice";

const STATUS_ICONS: Record<string, typeof Play> = {
  pending: Clock,
  active: Play,
  paused: Pause,
  completed: CheckCircle,
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-text-muted",
  active: "text-success",
  paused: "text-warning",
  completed: "text-primary",
};

export default function TimelineView() {
  const tasks = useAppSelector(
    (state) => state.routine.currentRoutine?.tasks ?? [],
  );
  const dispatch = useAppDispatch();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleTaskAction = useCallback(
    (task: (typeof tasks)[0]) => {
      switch (task.status) {
        case "pending":
          dispatch(startTask(task.id));
          break;
        case "active": {
          dispatch(pauseTask(task.id));
          dispatch(
            openPauseModal({
              taskId: task.id,
              pauseDuration: 0,
            }),
          );
          break;
        }
        case "paused":
          dispatch(resumeTask(task.id));
          break;
        case "completed":
          break;
      }
    },
    [dispatch],
  );

  const getEffectiveDuration = (task: (typeof tasks)[0]) => {
    const base = task.endTime - task.startTime;
    return base - task.pausedDuration;
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-2">
      {tasks.map((task, i) => {
        const Icon = STATUS_ICONS[task.status] || Clock;
        const colorClass = STATUS_COLORS[task.status] || "text-text-muted";
        const duration = getEffectiveDuration(task);
        const pausedExtra =
          task.status === "paused" && task.pausedAt ? tick - task.pausedAt : 0;
        const elapsed =
          task.status === "active"
            ? Math.min(
                Date.now() - task.startTime - task.pausedDuration,
                duration,
              )
            : 0;
        const progress =
          duration > 0
            ? Math.min(((elapsed + pausedExtra) / duration) * 100, 100)
            : 0;

        return (
          <div
            key={task.id}
            className="group flex items-center gap-4 p-4 rounded-xl bg-surface border border-border hover:border-border/80 transition-all"
          >
            <div className="relative">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: task.color + "20" }}
              >
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
              </div>
              {i < tasks.length - 1 && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-px h-2 bg-border" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-text truncate">
                  {task.title}
                </h3>
                <span className={`text-xs ${colorClass}`}>
                  {task.status === "active"
                    ? "● Canlı"
                    : task.status === "paused"
                      ? "● Duraklatıldı"
                      : task.status === "completed"
                        ? "● Tamamlandı"
                        : ""}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-text-muted">
                  {formatTime(task.startTime)} - {formatTime(task.endTime)}
                </span>
                <span className="text-xs text-text-muted">
                  {formatDuration(duration)}
                </span>
              </div>
              {(task.status === "active" || task.status === "paused") && (
                <div className="mt-2 h-1 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{
                      width: `${progress}%`,
                      backgroundColor: task.color,
                    }}
                  />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
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
                >
                  <Icon size={16} />
                </button>
              )}
              {task.status !== "completed" && task.status !== "pending" && (
                <button
                  onClick={() => dispatch(completeTask(task.id))}
                  className="p-2 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors"
                >
                  <CheckCircle size={16} />
                </button>
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
