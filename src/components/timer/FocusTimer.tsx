import { useEffect, useState, useCallback, Fragment } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { formatTime, timestampToTime } from "@/utils";
import {
  Play,
  Pause,
  CheckCircle,
  SkipForward,
  Zap,
  TimerOff,
  Pencil,
} from "lucide-react";
import { completeTask, pauseTask, skipTask, adjustStartedAt } from "@/store/slices/routineSlice";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  const [isEditStartDialogOpen, setIsEditStartDialogOpen] = useState(false);
  const [adjustedStartTime, setAdjustedStartTime] = useState("");

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

  const handleOpenEditStart = useCallback(() => {
    if (!currentTask) return;
    setAdjustedStartTime(timestampToTime(currentTask.startTime));
    setIsEditStartDialogOpen(true);
  }, [currentTask]);

  const handleConfirmEditStart = useCallback(() => {
    if (!currentTask || !adjustedStartTime) return;
    const [h, m] = adjustedStartTime.split(":").map(Number);
    const newStartedAt = new Date(currentTask.startTime);
    newStartedAt.setHours(h, m, 0, 0);
    dispatch(
      adjustStartedAt({
        id: currentTask.id,
        startedAt: newStartedAt.getTime(),
      }),
    );
    setIsEditStartDialogOpen(false);
  }, [currentTask, adjustedStartTime, dispatch]);

  if (!currentTask) return null;

  const totalDuration = currentTask.endTime - currentTask.startTime;
  const pausedTime =
    currentTask.status === "paused" && currentTask.pausedAt
      ? now - currentTask.pausedAt
      : 0;

  const activeStart = currentTask.startedAt ?? currentTask.startTime;
  const workedMs = Math.max(
    0,
    now - activeStart - currentTask.pausedDuration - pausedTime,
  );
  const preGap = currentTask.startedAt
    ? Math.max(0, currentTask.startedAt - currentTask.startTime)
    : 0;
  const preGapPct = totalDuration > 0 ? (preGap / totalDuration) * 100 : 0;
  const workedPct = totalDuration > 0 ? (workedMs / totalDuration) * 100 : 0;
  const pausePct =
    totalDuration > 0 && currentTask.status === "paused"
      ? (pausedTime / totalDuration) * 100
      : 0;

  const remaining = Math.max(
    0,
    currentTask.endTime - now + currentTask.pausedDuration + pausedTime,
  );
  const remainingMinutes = Math.ceil(remaining / 60000);

  const focusSec = Math.floor(workedMs / 1000);
  const fHours = Math.floor(focusSec / 3600);
  const fMinutes = Math.floor((focusSec % 3600) / 60);
  const fSeconds = focusSec % 60;

  const pauseSec = Math.floor(pausedTime / 1000);
  const pHours = Math.floor(pauseSec / 3600);
  const pMinutes = Math.floor((pauseSec % 3600) / 60);
  const pSeconds = pauseSec % 60;

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
    <Fragment>
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
            {fHours > 0 && `${fHours}:`}
            {String(fMinutes).padStart(2, "0")}:
            {String(fSeconds).padStart(2, "0")}
          </div>
          <div className="flex items-center justify-center gap-1.5 mt-2">
            <p className="text-xs text-text-muted">geçen süre</p>
            {preGap > 0 && (
              <button
                onClick={handleOpenEditStart}
                className="p-0.5 rounded hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
                title="Başlangıç zamanını düzelt"
              >
                <Pencil size={11} />
              </button>
            )}
          </div>
          {currentTask.status === "paused" && (
            <p className="text-xs text-warning mt-1">
              duraklatma {pHours > 0 && `${pHours}:`}
              {String(pMinutes).padStart(2, "0")}:
              {String(pSeconds).padStart(2, "0")}
            </p>
          )}
          {currentTask.status === "active" && (
            <p className="text-xs text-text-muted mt-1">
              kalan {rHours > 0 && `${rHours}:`}
              {String(rMinutes).padStart(2, "0")}:
              {String(rSeconds).padStart(2, "0")}
            </p>
          )}
        </div>

        <div className="h-2.5 bg-border rounded-full overflow-hidden mb-6 flex">
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
            className="h-full transition-all duration-1000"
            style={{
              width: `${Math.max(0, workedPct)}%`,
              backgroundColor: currentTask.color,
              opacity: currentTask.status === "paused" ? 0.6 : 1,
            }}
          />
          {currentTask.status === "paused" && pausePct > 0 && (
            <div
              className="h-full transition-all duration-1000"
              style={{
                width: `${pausePct}%`,
                backgroundColor: "#f59e0b",
              }}
            />
          )}
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

    <Dialog
      open={isEditStartDialogOpen}
      onOpenChange={setIsEditStartDialogOpen}
    >
      <DialogContent>
        <DialogTitle>Başlangıç Zamanını Düzelt</DialogTitle>
        <p className="text-sm text-text-muted">
          Bu göreve gerçekte başladığınız zamanı girin.
        </p>
        <div className="my-2">
          <Input
            type="time"
            value={adjustedStartTime}
            onChange={(e) => setAdjustedStartTime(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={() => setIsEditStartDialogOpen(false)}
            className="px-4 py-2 rounded-lg border border-border text-text-muted hover:text-text transition-colors text-sm"
          >
            İptal
          </button>
          <button
            onClick={handleConfirmEditStart}
            className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            Onayla
          </button>
        </div>
      </DialogContent>
    </Dialog>
    </Fragment>
  );
}
