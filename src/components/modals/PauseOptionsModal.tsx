import { useState, useEffect } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { closePauseModal, setPendingPauseImpact } from "@/store/slices/uiSlice";
import { calculatePauseImpact, getPlannedDayEnd } from "@/engine/timeEngine";
import { formatDuration } from "@/utils";
import { isScheduled, type TaskBlock } from "@/types";
import { ArrowRight, Scissors, Scale, X } from "lucide-react";

// Önerilen sıra: Kes (kaybedilen süreyi plandan düş, gün aynı saatte bitsin),
// sonra Kaydır, sonra Dengele.
const OPTIONS = [
  {
    mode: "cut" as const,
    label: "Kes",
    sublabel: "Süreden düş, değiştirme",
    icon: Scissors,
    color: "#ef4444",
  },
  {
    mode: "shift" as const,
    label: "Kaydır",
    sublabel: "Herşeyi ileri al",
    icon: ArrowRight,
    color: "#6366f1",
  },
  {
    mode: "balance" as const,
    label: "Dengele",
    sublabel: "Herkesten biraz",
    icon: Scale,
    color: "#22c55e",
  },
] as const;

interface AffectedTask {
  id: string;
  newStart: number;
  newEnd: number;
}

/** Seçeneğin zaman çizelgesini "önce / sonra" olarak 2D gösterir. */
function ImpactTimeline({
  tasks,
  affected,
  color,
  pausedTaskId,
  bufferSegments,
}: {
  tasks: TaskBlock[];
  affected: AffectedTask[];
  color: string;
  pausedTaskId: string;
  bufferSegments?: { start: number; end: number }[];
}) {
  const scheduled = tasks.filter(isScheduled);
  if (scheduled.length === 0 || affected.length === 0) return null;

  const starts = [
    ...scheduled.map((t) => t.startTime!),
    ...affected.map((a) => a.newStart),
  ];
  const ends = [
    ...scheduled.map((t) => t.endTime!),
    ...affected.map((a) => a.newEnd),
  ];
  const min = Math.min(...starts);
  const span = Math.max(1, Math.max(...ends) - min);
  const left = (v: number) => ((v - min) / span) * 100;
  const width = (start: number, end: number) =>
    Math.max(2, left(end) - left(start));

  const row = (
    key: string,
    label: string,
    bars: { id: string; start: number; end: number }[],
    before: boolean,
    segments?: { start: number; end: number }[],
  ) => (
    <div key={key} className="flex items-center gap-1.5">
      <span className="w-7 shrink-0 text-[8px] uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <div className="relative h-2 flex-1 rounded-full bg-border/30 overflow-hidden">
        {bars.map((bar) => (
          <div
            key={bar.id}
            className="absolute inset-y-0 rounded-[3px]"
            style={{
              left: `${left(bar.start)}%`,
              width: `${width(bar.start, bar.end)}%`,
              backgroundColor: before
                ? bar.id === pausedTaskId
                  ? "rgba(255,255,255,0.45)"
                  : "rgba(148,163,184,0.45)"
                : color,
              opacity: before ? 1 : 0.9,
            }}
          />
        ))}
        {segments?.map((seg, i) => (
          <div
            key={`seg-${i}`}
            className="absolute inset-y-0 rounded-[3px]"
            style={{
              left: `${left(seg.start)}%`,
              width: `${Math.max(1, left(seg.end) - left(seg.start))}%`,
              backgroundColor: `${color}33`,
              backgroundImage: `repeating-linear-gradient(45deg, ${color}dd 0 3px, transparent 3px 6px)`,
            }}
            title="Boşluktan karşılandı"
          />
        ))}
      </div>
    </div>
  );

  return (
    <div className="mt-1.5 space-y-0.5">
      {row(
        "before",
        "önce",
        scheduled.map((t) => ({
          id: t.id,
          start: t.startTime!,
          end: t.endTime!,
        })),
        true,
      )}
      {row(
        "after",
        "sonra",
        affected.map((a) => ({ id: a.id, start: a.newStart, end: a.newEnd })),
        false,
        bufferSegments,
      )}
      {bufferSegments && bufferSegments.length > 0 && (
        <p className="flex items-center gap-1 pl-8 text-[9px] text-text-muted">
          <span
            className="inline-block w-2 h-2 rounded-[2px] shrink-0"
            style={{
              backgroundColor: `${color}33`,
              backgroundImage: `repeating-linear-gradient(45deg, ${color}dd 0 3px, transparent 3px 6px)`,
            }}
          />
          boşluktan karşılandı
        </p>
      )}
    </div>
  );
}

export default function PauseOptionsModal() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector((state) => state.ui.isPauseModalOpen);
  const pausedTaskId = useAppSelector((state) => state.ui.pausedTaskId);
  const tasks = useAppSelector(
    (state) => state.routine.currentRoutine?.tasks ?? [],
  );
  const storedDayEnd = useAppSelector(
    (state) => state.routine.currentRoutine?.dayEndTime ?? 0,
  );
  // "Şu an" değeri plandan hesaplanır; saklanan dayEndTime eski kalabilir.
  const dayEndTime = getPlannedDayEnd(tasks, storedDayEnd);

  const [livePauseDuration, setLivePauseDuration] = useState(0);

  useEffect(() => {
    if (!isOpen || !pausedTaskId) return;
    const task = tasks.find((t) => t.id === pausedTaskId);
    if (!task?.pausedAt) return;

    const update = () => setLivePauseDuration(Date.now() - task.pausedAt!);
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [isOpen, pausedTaskId, tasks]);

  if (!isOpen || !pausedTaskId) return null;

  const pausedTask = tasks.find((t) => t.id === pausedTaskId);
  if (!pausedTask) return null;

  const handleSelect = (mode: "shift" | "cut" | "balance") => {
    const impact = calculatePauseImpact(
      tasks,
      pausedTaskId,
      livePauseDuration,
      mode,
    );
    dispatch(setPendingPauseImpact(impact));
  };

  const handleBack = () => {
    dispatch(closePauseModal());
  };

  const scheduledCount = tasks.filter(isScheduled).length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm">
      <div className="min-h-full flex items-center justify-center p-3">
      <div className="bg-surface border border-border rounded-2xl p-4 w-full max-w-xl shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div>
            <h2 className="text-lg font-bold text-text">Duraklatıldı</h2>
            <p className="text-sm text-text-muted">
              <span style={{ color: pausedTask.color }} className="font-medium">
                {pausedTask.title}
              </span>{" "}
              durduruldu. Kaybedilen süre ne olsun?
            </p>
          </div>
          <button
            onClick={handleBack}
            className="p-2 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-2.5 grid grid-cols-2 gap-2">
          <div className="p-2 rounded-xl bg-background border border-border">
            <p className="text-[10px] text-text-muted">Duraklama süresi</p>
            <p className="text-sm text-text font-bold tabular-nums">
              {formatDuration(livePauseDuration)}
            </p>
          </div>
          <div className="p-2 rounded-xl bg-background border border-border">
            <p className="text-[10px] text-text-muted">Gün bitişi (şu an)</p>
            <p className="text-sm text-text font-bold tabular-nums">
              {new Date(dayEndTime).toLocaleTimeString("tr-TR", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          {OPTIONS.map((opt) => {
            const impact = calculatePauseImpact(
              tasks,
              pausedTaskId,
              livePauseDuration,
              opt.mode,
            );
            const Icon = opt.icon;
            const newEndTime = new Date(
              impact.newDayEndTime,
            ).toLocaleTimeString("tr-TR", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            });
            const diffMinutes = Math.round(
              (impact.newDayEndTime - dayEndTime) / 60000,
            );

            return (
              <button
                key={opt.mode}
                onClick={() => handleSelect(opt.mode)}
                className="relative w-full text-left pl-3.5 pr-2.5 py-2 rounded-xl border border-border bg-background hover:bg-surface-hover/60 transition-all overflow-hidden"
              >
                <span
                  className="absolute left-0 top-0 h-full w-[3px]"
                  style={{ backgroundColor: opt.color }}
                />
                <div className="flex items-start gap-2.5">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: opt.color + "1f" }}
                  >
                    <Icon size={16} style={{ color: opt.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-text text-sm">
                        {opt.label}
                      </span>
                      <span className="text-[10px] text-text-muted">
                        {opt.sublabel}
                      </span>
                      <span
                        className="ml-auto text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full"
                        style={{
                          color: opt.color,
                          backgroundColor: opt.color + "16",
                        }}
                      >
                        {newEndTime}
                        {diffMinutes !== 0
                          ? ` (${diffMinutes > 0 ? "+" : ""}${diffMinutes}dk)`
                          : " (±0)"}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-text-muted mt-0.5 leading-tight">
                      {impact.description}
                    </p>
                    <ImpactTimeline
                      tasks={tasks}
                      affected={impact.affectedTasks}
                      color={opt.color}
                      pausedTaskId={pausedTaskId}
                      bufferSegments={impact.bufferSegments}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {scheduledCount === 0 && (
          <p className="mt-2 text-[11px] text-text-muted">
            Saatli görev yok; görsel önizleme yalnızca planlı görevlerde görünür.
          </p>
        )}

        <button
          onClick={handleBack}
          className="w-full mt-2.5 py-2 rounded-xl border border-border text-text-muted hover:text-text hover:border-border/80 transition-all text-sm font-medium"
        >
          Geri Dön
        </button>
      </div>
      </div>
    </div>
  );
}
