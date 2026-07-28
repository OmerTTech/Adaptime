import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { confirmAction, goBackFromPreview } from "@/store/slices/uiSlice";
import { applyModifiedTasks } from "@/store/slices/routineSlice";
import { applyPauseImpact } from "@/engine/timeEngine";
import { applyFlowImpact } from "@/engine/flowState";
import { applyEarlyFinishImpact } from "@/engine/earlyFinish";
import { formatDuration, formatTime } from "@/utils";
import {
  CheckCircle,
  ArrowLeft,
  Clock,
  AlertTriangle,
  Zap,
  TimerOff,
} from "lucide-react";

const SOURCE_CONFIG: Record<
  string,
  { label: string; color: string; icon: typeof AlertTriangle }
> = {
  pause: { label: "Duraklatma", color: "#6366f1", icon: AlertTriangle },
  flow: { label: "Flow State", color: "#f59e0b", icon: Zap },
  earlyFinish: { label: "Erken Bitiş", color: "#22c55e", icon: TimerOff },
};

const PAUSE_MODE_LABELS: Record<string, string> = {
  shift: "Kaydır",
  cut: "Kes",
  balance: "Dengele",
};

const FLOW_MODE_LABELS: Record<string, string> = {
  shift: "Kaydır (Tümünü İleri Al)",
  eatNext: "Sonraki Görevden Düş",
};

const EARLY_FINISH_MODE_LABELS: Record<string, string> = {
  extendBreak: "Dinlenmeye Ekle",
  pullForward: "Sonraki Görevlere Çek",
};

export default function ImpactPreviewModal() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector((state) => state.ui.isPreviewModalOpen);
  const source = useAppSelector((state) => state.ui.previewSource);
  const pauseImpact = useAppSelector((state) => state.ui.pendingPauseImpact);
  const flowImpact = useAppSelector((state) => state.ui.pendingFlowImpact);
  const earlyFinishImpact = useAppSelector(
    (state) => state.ui.pendingEarlyFinishImpact,
  );
  const tasks = useAppSelector(
    (state) => state.routine.currentRoutine?.tasks ?? [],
  );
  const dayEndTime = useAppSelector(
    (state) => state.routine.currentRoutine?.dayEndTime ?? 0,
  );

  if (!isOpen) return null;

  const config = SOURCE_CONFIG[source] || SOURCE_CONFIG.pause;
  const Icon = config.icon;

  // Determine which impact is active
  const impact =
    source === "pause"
      ? pauseImpact
      : source === "flow"
        ? flowImpact
        : earlyFinishImpact;

  if (!impact) return null;

  // Get mode label and affected tasks based on source
  let modeLabel = "";
  let affectedTasks: { id: string; newStart: number; newEnd: number }[] = [];
  let description = "";
  let impactDayEndTime = 0;

  if (source === "pause" && pauseImpact) {
    modeLabel = PAUSE_MODE_LABELS[pauseImpact.mode] || pauseImpact.mode;
    affectedTasks = pauseImpact.affectedTasks;
    description = pauseImpact.description;
    impactDayEndTime = pauseImpact.newDayEndTime;
  } else if (source === "flow" && flowImpact) {
    modeLabel = FLOW_MODE_LABELS[flowImpact.mode] || flowImpact.mode;
    affectedTasks = flowImpact.affectedTasks;
    description = flowImpact.description;
    impactDayEndTime = flowImpact.newDayEndTime;
  } else if (source === "earlyFinish" && earlyFinishImpact) {
    modeLabel =
      EARLY_FINISH_MODE_LABELS[earlyFinishImpact.mode] ||
      earlyFinishImpact.mode;
    affectedTasks = [];
    description = earlyFinishImpact.description;
    impactDayEndTime = earlyFinishImpact.newDayEndTime;
  }

  const dayShifted = impactDayEndTime !== dayEndTime;
  const shiftMinutes = Math.round((impactDayEndTime - dayEndTime) / 60000);

  const handleConfirm = () => {
    let modifiedTasks = tasks;
    if (source === "pause" && pauseImpact) {
      modifiedTasks = applyPauseImpact(tasks, pauseImpact);
    } else if (source === "flow" && flowImpact) {
      modifiedTasks = applyFlowImpact(tasks, flowImpact);
    } else if (source === "earlyFinish" && earlyFinishImpact) {
      modifiedTasks = applyEarlyFinishImpact(tasks, earlyFinishImpact);
    }
    dispatch(applyModifiedTasks(modifiedTasks));
    dispatch(confirmAction());
  };

  const handleBack = () => {
    dispatch(goBackFromPreview());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl p-6 w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: config.color + "15" }}
          >
            <Icon size={20} style={{ color: config.color }} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text">Onayla</h2>
            <p className="text-xs text-text-muted">
              {config.label} değişikliği uygulanacak
            </p>
          </div>
        </div>

        <div className="space-y-3 mb-5">
          <div className="p-3 rounded-xl bg-background border border-border">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Mod:</span>
              <span className="font-bold" style={{ color: config.color }}>
                {modeLabel}
              </span>
            </div>
            {source === "pause" && (
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-text-muted">Duraklama:</span>
                <span className="text-text font-medium tabular-nums">
                  {formatDuration(
                    Date.now() -
                      (tasks.find(
                        (t) => t.id === pauseImpact?.affectedTasks[0]?.id,
                      )?.pausedAt ?? Date.now()),
                  )}
                </span>
              </div>
            )}
            {source === "flow" && flowImpact && (
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-text-muted">Eklenen süre:</span>
                <span className="text-text font-medium tabular-nums">
                  {flowImpact.extraMinutes} dakika
                </span>
              </div>
            )}
            {source === "earlyFinish" && earlyFinishImpact && (
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-text-muted">Kazanılan süre:</span>
                <span className="text-text font-medium tabular-nums">
                  {earlyFinishImpact.savedMinutes} dakika
                </span>
              </div>
            )}
          </div>

          <div className="p-3 rounded-xl bg-background border border-border">
            <p className="text-sm text-text">{description}</p>
          </div>

          {dayShifted && (
            <div
              className="p-3 rounded-xl border"
              style={{
                backgroundColor: config.color + "08",
                borderColor: config.color + "30",
              }}
            >
              <div className="flex items-center gap-2">
                <Clock size={14} style={{ color: config.color }} />
                <span
                  className="text-sm font-medium"
                  style={{ color: config.color }}
                >
                  Gün bitişi:{" "}
                  {new Date(impactDayEndTime).toLocaleTimeString("tr-TR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </span>
                <span className="text-xs text-text-muted">
                  ({shiftMinutes > 0 ? "+" : ""}
                  {shiftMinutes} dk)
                </span>
              </div>
            </div>
          )}
        </div>

        {affectedTasks.length > 0 && (
          <div className="space-y-2">
            <div className="p-3 rounded-xl bg-background border border-border">
              <p className="text-xs text-text-muted mb-2 font-medium">
                Yeni zaman çizelgesi:
              </p>
              <div className="space-y-1.5">
                {affectedTasks.map((at) => {
                  const task = tasks.find((t) => t.id === at.id);
                  if (!task) return null;
                  const changed =
                    at.newStart !== task.startTime ||
                    at.newEnd !== task.endTime;
                  return (
                    <div
                      key={at.id}
                      className={`flex items-center justify-between text-xs py-1 px-2 rounded ${
                        changed ? "bg-surface-hover" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: task.color }}
                        />
                        <span
                          className={changed ? "text-text" : "text-text-muted"}
                        >
                          {task.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 tabular-nums">
                        {changed && (
                          <span className="text-text-muted line-through">
                            {formatTime(task.startTime)}-
                            {formatTime(task.endTime)}
                          </span>
                        )}
                        <span
                          className={
                            changed ? "font-bold text-text" : "text-text-muted"
                          }
                        >
                          {formatTime(at.newStart)}-{formatTime(at.newEnd)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button
            onClick={handleBack}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-text-muted hover:text-text hover:border-border/80 transition-all text-sm font-medium"
          >
            <ArrowLeft size={16} />
            Geri
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-white transition-all text-sm font-bold"
            style={{ backgroundColor: config.color }}
          >
            <CheckCircle size={16} />
            Onayla ve Uygula
          </button>
        </div>
      </div>
    </div>
  );
}
