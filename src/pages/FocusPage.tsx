import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  FOCUS_PRESETS,
  completePhase,
  pauseSession,
  resumeSession,
  setDurations,
  setFocusTask,
  startSession,
  stopSession,
  syncCompletedToday,
} from "@/store/slices/focusSlice";
import { loadAccountabilityState, saveFocusSession } from "@/store/slices/mentorSlice";
import { playSound } from "@/services/sound";
import { Coffee, Loader2, Pause, Play, Square, Timer, CheckCircle2 } from "lucide-react";

export default function FocusPage() {
  const { token } = useAuth();
  const dispatch = useAppDispatch();
  const focus = useAppSelector((s) => s.focus);
  const tasks = useAppSelector((s) => s.routine.currentRoutine?.tasks ?? []);
  const summary = useAppSelector((s) => s.mentor.summary);
  const [now, setNow] = useState(Date.now());
  const [customWork, setCustomWork] = useState(String(focus.workMinutes));
  const [customBreak, setCustomBreak] = useState(String(focus.breakMinutes));
  const [savingSession, setSavingSession] = useState(false);
  const finishing = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (summary) dispatch(syncCompletedToday(summary.completedFocusSessions));
  }, [summary?.completedFocusSessions, summary, dispatch]);

  // Oturum bitişini yakala (tarayıcı sekmesi arka planda olsa da
  // gerçek zaman damgasına göre hesaplanır; sekme açılınca tamamlanır).
  useEffect(() => {
    if (!focus.running || !focus.endsAt) {
      finishing.current = false;
      return;
    }
    if (now < focus.endsAt || finishing.current) return;
    finishing.current = true;

    const phase = focus.phase;
    const startedAt = focus.startedAt ?? focus.endsAt - focus.workMinutes * 60_000;
    const task = tasks.find((t) => t.id === focus.taskId);
    const completedAt = focus.endsAt;

    if (token) {
      setSavingSession(true);
      dispatch(
        saveFocusSession({
          token,
          mode: phase === "focus" ? "focus" : "short_break",
          plannedMinutes:
            phase === "focus" ? focus.workMinutes : focus.breakMinutes,
          actualMinutes:
            phase === "focus" ? focus.workMinutes : focus.breakMinutes,
          completed: true,
          taskId: focus.taskId,
          taskTitle: task?.title ?? null,
          startedAt,
          endedAt: completedAt,
        }),
      ).finally(() => {
        setSavingSession(false);
        dispatch(loadAccountabilityState(token));
      });
    }

    playSound("focusEnd");
    dispatch(completePhase({ at: completedAt }));
  }, [
    now,
    focus.running,
    focus.endsAt,
    focus.phase,
    focus.startedAt,
    focus.workMinutes,
    focus.breakMinutes,
    focus.taskId,
    tasks,
    token,
    dispatch,
  ]);

  const totalMs =
    (focus.phase === "break" ? focus.breakMinutes : focus.workMinutes) * 60_000;
  const remainingMs =
    focus.running && focus.endsAt
      ? Math.max(0, focus.endsAt - now)
      : focus.remainingSec * 1000;
  const pct =
    totalMs > 0
      ? Math.min(100, Math.round(((totalMs - remainingMs) / totalMs) * 100))
      : 0;
  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000);
  const selectedTask = tasks.find((t) => t.id === focus.taskId);

  const isPreset = (work: number, brk: number) =>
    focus.workMinutes === work && focus.breakMinutes === brk;

  const handleStop = () => {
    if (token && focus.startedAt && (focus.phase === "focus" || focus.phase === "break")) {
      const endedAt = Date.now();
      const elapsed = Math.max(0, Math.round((endedAt - focus.startedAt) / 60_000));
      const planned =
        focus.phase === "focus" ? focus.workMinutes : focus.breakMinutes;
      dispatch(
        saveFocusSession({
          token,
          mode: focus.phase === "focus" ? "focus" : "short_break",
          plannedMinutes: planned,
          actualMinutes: Math.min(elapsed, planned),
          completed: false,
          taskId: focus.taskId,
          taskTitle: selectedTask?.title ?? null,
          startedAt: focus.startedAt,
          endedAt,
        }),
      ).finally(() => dispatch(loadAccountabilityState(token)));
    }
    dispatch(stopSession());
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h2 className="text-lg font-bold text-text flex items-center gap-2">
          <Timer size={18} className="text-primary" />
          Odak
        </h2>
        <p className="text-xs text-text-muted">
          Pomodoro sayacı · görevle ilişkilendir · oturumlar hesabına kaydedilir.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 text-center">
        <span
          className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide px-2 py-1 rounded-full ${
            focus.phase === "focus"
              ? "bg-primary/10 text-primary"
              : focus.phase === "break"
                ? "bg-warning/10 text-warning"
                : "bg-background text-text-muted"
          }`}
        >
          {focus.phase === "break" ? <Coffee size={11} /> : <Timer size={11} />}
          {focus.phase === "focus"
            ? "Odak oturumu"
            : focus.phase === "break"
              ? "Mola"
              : "Hazır"}
        </span>

        <div className="text-6xl font-mono font-bold text-text tabular-nums mt-4">
          {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </div>

        <div className="h-2 bg-border rounded-full overflow-hidden mt-4">
          <div
            className={`h-full rounded-full transition-all ${
              focus.phase === "break" ? "bg-warning" : "bg-primary"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <p className="text-xs text-text-muted mt-2">
          {selectedTask
            ? `Görev: ${selectedTask.title}`
            : "Görev seçilmedi (istersen aşağıdan bağla)"}
        </p>

        <div className="flex items-center justify-center gap-2 mt-4">
          {focus.phase === "idle" && (
            <button
              onClick={() => {
                dispatch(startSession());
                playSound("focusStart");
              }}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Play size={16} /> Başlat
            </button>
          )}
          {focus.running && (
            <button
              onClick={() => dispatch(pauseSession())}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-warning/10 border border-warning/30 text-warning text-sm font-medium hover:bg-warning/20 transition-colors"
            >
              <Pause size={16} /> Duraklat
            </button>
          )}
          {!focus.running && focus.phase !== "idle" && (
            <button
              onClick={() => dispatch(resumeSession())}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-success/10 border border-success/30 text-success text-sm font-medium hover:bg-success/20 transition-colors"
            >
              <Play size={16} /> Devam
            </button>
          )}
          {focus.phase !== "idle" && (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-surface border border-border text-text-muted text-sm hover:text-text transition-colors"
            >
              {savingSession ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Square size={16} />
              )}
              Bitir
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="p-3 rounded-xl bg-surface border border-border">
          <p className="text-[10px] uppercase text-text-muted">Bugün odak</p>
          <p className="text-xl font-bold text-text tabular-nums">
            {summary?.focusMinutes ?? 0}
            <span className="text-xs font-normal text-text-muted"> dk</span>
          </p>
        </div>
        <div className="p-3 rounded-xl bg-surface border border-border">
          <p className="text-[10px] uppercase text-text-muted">Oturum</p>
          <p className="text-xl font-bold text-text tabular-nums">
            {summary?.completedFocusSessions ?? focus.completedToday}
          </p>
        </div>
        <div className="p-3 rounded-xl bg-surface border border-border">
          <p className="text-[10px] uppercase text-text-muted">Dinlenme</p>
          <p className="text-xl font-bold text-text tabular-nums">
            {summary?.restMinutes ?? 0}
            <span className="text-xs font-normal text-text-muted"> dk</span>
          </p>
        </div>
        <div className="p-3 rounded-xl bg-surface border border-border">
          <p className="text-[10px] uppercase text-text-muted">Aktif görev</p>
          <p className="text-xs font-semibold text-text truncate mt-1">
            {summary?.activeTaskTitle ?? "—"}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
        <div>
          <p className="text-xs font-medium text-text mb-2">Hazır planlar</p>
          <div className="flex flex-wrap gap-1.5">
            {FOCUS_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() =>
                  dispatch(
                    setDurations({
                      workMinutes: preset.work,
                      breakMinutes: preset.break,
                    }),
                  )
                }
                disabled={focus.phase !== "idle"}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 ${
                  isPreset(preset.work, preset.break)
                    ? "bg-primary/10 border-primary/40 text-primary"
                    : "bg-background border-border text-text-muted hover:text-text"
                }`}
              >
                {preset.label} dk
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-text mb-2">Özel süre</p>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-text-muted">
              Odak
              <input
                type="number"
                min={5}
                max={180}
                value={customWork}
                onChange={(e) => setCustomWork(e.target.value)}
                className="ml-1 w-16 px-2 py-1 rounded-lg bg-background border border-border text-xs text-text"
              />
            </label>
            <label className="text-[10px] text-text-muted">
              Mola
              <input
                type="number"
                min={1}
                max={60}
                value={customBreak}
                onChange={(e) => setCustomBreak(e.target.value)}
                className="ml-1 w-16 px-2 py-1 rounded-lg bg-background border border-border text-xs text-text"
              />
            </label>
            <button
              onClick={() =>
                dispatch(
                  setDurations({
                    workMinutes: Number(customWork) || 25,
                    breakMinutes: Number(customBreak) || 5,
                  }),
                )
              }
              disabled={focus.phase !== "idle"}
              className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-medium disabled:opacity-50"
            >
              Uygula
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-text mb-2">Göreve bağla</p>
          <select
            value={focus.taskId ?? ""}
            onChange={(e) => dispatch(setFocusTask(e.target.value || null))}
            className="w-full px-2.5 py-2 rounded-lg bg-background border border-border text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">Görev seçme</option>
            {tasks
              .filter((t) => t.status !== "completed")
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
          <CheckCircle2 size={11} className="text-success" />
          Sayaç gerçek zaman damgasıyla çalışır; sekme arka planda olsa da süre
          doğru hesaplanır.
        </div>
      </div>
    </div>
  );
}
