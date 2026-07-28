import { useEffect, useState, useCallback } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { formatTime } from "@/utils";
import {
  Play,
  Pause,
  CheckCircle,
  SkipForward,
  Zap,
  TimerOff,
} from "lucide-react";
import { completeTask, pauseTask, skipTask } from "@/store/slices/routineSlice";
import {
  openPauseModal,
  openFlowModal,
  openEarlyFinishModal,
} from "@/store/slices/uiSlice";

export default function FocusTimer() {
  const dispatch = useAppDispatch();
  const tasks = useAppSelector(
    (state) => state.routine.currentRoutine?.tasks ?? [],
  );
  const isPauseModalOpen = useAppSelector((state) => state.ui.isPauseModalOpen);
  const isPreviewModalOpen = useAppSelector(
    (state) => state.ui.isPreviewModalOpen,
  );
  const isFlowModalOpen = useAppSelector((state) => state.ui.isFlowModalOpen);
  const isEarlyFinishModalOpen = useAppSelector(
    (state) => state.ui.isEarlyFinishModalOpen,
  );
  const [now, setNow] = useState(Date.now());

  const activeTask = tasks.find((t) => t.status === "active");
  const pausedTask = tasks.find((t) => t.status === "paused");
  const currentTask = activeTask || pausedTask;

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handlePause = useCallback(() => {
    if (!currentTask) return;
    dispatch(pauseTask(currentTask.id));
  }, [currentTask, dispatch]);

  const handleResume = useCallback(() => {
    if (!currentTask) return;
    dispatch(openPauseModal({ taskId: currentTask.id, pauseDuration: 0 }));
  }, [currentTask, dispatch]);

  const handleComplete = useCallback(() => {
    if (!currentTask) return;
    dispatch(completeTask(currentTask.id));
  }, [currentTask, dispatch]);

  const handleSkip = useCallback(() => {
    if (!currentTask) return;
    dispatch(skipTask(currentTask.id));
  }, [currentTask, dispatch]);

  const handleFlowState = useCallback(() => {
    if (!currentTask) return;
    dispatch(openFlowModal({ taskId: currentTask.id }));
  }, [currentTask, dispatch]);

  const handleEarlyFinish = useCallback(() => {
    if (!currentTask) return;
    dispatch(openEarlyFinishModal({ taskId: currentTask.id }));
  }, [currentTask, dispatch]);

  if (!currentTask) return null;

  const effectiveDuration =
    currentTask.endTime - currentTask.startTime - currentTask.pausedDuration;
  const pausedTime =
    currentTask.status === "paused" && currentTask.pausedAt
      ? now - currentTask.pausedAt
      : 0;
  const elapsed = Math.max(
    0,
    now - currentTask.startTime - currentTask.pausedDuration - pausedTime,
  );
  const remaining = Math.max(0, effectiveDuration - elapsed);
  const remainingMinutes = Math.ceil(remaining / 60000);
  const progress =
    effectiveDuration > 0
      ? Math.min((elapsed / effectiveDuration) * 100, 100)
      : 0;

  const elapsedSec = Math.floor(elapsed / 1000);
  const eHours = Math.floor(elapsedSec / 3600);
  const eMinutes = Math.floor((elapsedSec % 3600) / 60);
  const eSeconds = elapsedSec % 60;

  const remSec = Math.floor(remaining / 1000);
  const rHours = Math.floor(remSec / 3600);
  const rMinutes = Math.floor((remSec % 3600) / 60);
  const rSeconds = remSec % 60;

  const hasTimeLeft = remainingMinutes > 5;
  const dimmed =
    isPauseModalOpen ||
    isPreviewModalOpen ||
    isFlowModalOpen ||
    isEarlyFinishModalOpen;

  return (
    <div
      className={`w-full max-w-md mx-auto transition-opacity ${dimmed ? "opacity-30 pointer-events-none" : ""}`}
    >
      <div
        className="relative rounded-2xl border-2 p-8 text-center transition-all"
        style={{
          borderColor: currentTask.color,
          backgroundColor: currentTask.color + "08",
          boxShadow:
            currentTask.status === "active"
              ? `0 0 30px ${currentTask.color}20`
              : "none",
        }}
      >
        {currentTask.status === "active" && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span
              className="px-3 py-1 rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: currentTask.color }}
            >
              ODAKLANIYOR
            </span>
          </div>
        )}
        {currentTask.status === "paused" && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-warning text-black">
              DURAKLATILDI
            </span>
          </div>
        )}

        <h2 className="text-xl font-bold text-text mt-2">
          {currentTask.title}
        </h2>

        <div className="my-6">
          <div
            className="text-6xl font-mono font-bold tabular-nums"
            style={{ color: currentTask.color }}
          >
            {eHours > 0 && `${eHours}:`}
            {String(eMinutes).padStart(2, "0")}:
            {String(eSeconds).padStart(2, "0")}
          </div>
          <p className="text-xs text-text-muted mt-2">geçen süre</p>
          {currentTask.status === "active" && (
            <p className="text-xs text-text-muted mt-1">
              kalan {rHours > 0 && `${rHours}:`}
              {String(rMinutes).padStart(2, "0")}:
              {String(rSeconds).padStart(2, "0")}
            </p>
          )}
        </div>

        <div className="h-2 bg-border rounded-full overflow-hidden mb-6">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${progress}%`,
              backgroundColor: currentTask.color,
            }}
          />
        </div>

        <div className="flex items-center justify-center gap-3">
          {currentTask.status === "active" && (
            <button
              onClick={handlePause}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-warning/10 text-warning hover:bg-warning/20 border border-warning/30 transition-all font-medium text-sm"
            >
              <Pause size={18} />
              Durdur
            </button>
          )}
          {currentTask.status === "paused" && (
            <button
              onClick={handleResume}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-success/10 text-success hover:bg-success/20 border border-success/30 transition-all font-medium text-sm"
            >
              <Play size={18} />
              Devam Et
            </button>
          )}
          <button
            onClick={handleComplete}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30 transition-all font-medium text-sm"
          >
            <CheckCircle size={18} />
            Tamamla
          </button>
          <button
            onClick={handleSkip}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-surface border border-border text-text-muted hover:text-text hover:border-border/80 transition-all text-sm"
          >
            <SkipForward size={18} />
          </button>
        </div>

        {currentTask.status === "active" && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              onClick={handleFlowState}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning/10 text-warning hover:bg-warning/20 border border-warning/20 transition-all text-xs font-medium"
            >
              <Zap size={12} />
              +Flow
            </button>
            {hasTimeLeft && (
              <button
                onClick={handleEarlyFinish}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/10 text-success hover:bg-success/20 border border-success/20 transition-all text-xs font-medium"
              >
                <TimerOff size={12} />
                Erken Bitir
              </button>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-center gap-4 text-xs text-text-muted">
          <span>
            {formatTime(currentTask.startTime)} -{" "}
            {formatTime(currentTask.endTime)}
          </span>
          {currentTask.flowExtensions > 0 && (
            <span className="text-warning">
              +{currentTask.flowExtensions} flow
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
