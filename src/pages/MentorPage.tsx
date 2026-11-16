import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  loadDailyLaunch,
  requestFirstSteps,
  requestMentorCheck,
  clearFirstSteps,
} from "@/store/slices/mentorSlice";
import { addSubtasks, updateTask } from "@/store/slices/routineSlice";
import CheckActions from "@/components/accountability/CheckActions";
import { ACTIVITY_LABEL, type TaskBlock } from "@/types";
import { formatClock, formatRelative } from "@/utils";
import {
  Activity,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  RefreshCw,
  Settings2,
  Sparkles,
  Target,
  Timer,
} from "lucide-react";

const LAUNCH_COUNTS = [3, 5, 10] as const;
const LAUNCH_COUNT_KEY = "adaptime-launch-count";

function readLaunchCount(): number {
  const raw = Number(localStorage.getItem(LAUNCH_COUNT_KEY));
  return (LAUNCH_COUNTS as readonly number[]).includes(raw) ? raw : 3;
}

function pickFocusTask(tasks: TaskBlock[]): TaskBlock | null {
  return (
    tasks.find((t) => t.status === "active") ??
    tasks.find((t) => t.status === "paused") ??
    tasks.find((t) => t.status === "pending") ??
    null
  );
}

export default function MentorPage() {
  const { token } = useAuth();
  const dispatch = useAppDispatch();
  const pending = useAppSelector((s) => s.mentor.pending);
  const checks = useAppSelector((s) => s.mentor.checks);
  const activities = useAppSelector((s) => s.mentor.activities);
  const settings = useAppSelector((s) => s.mentor.settings);
  const summary = useAppSelector((s) => s.mentor.summary);
  const ai = useAppSelector((s) => s.mentor.ai);
  const nextCheckAt = useAppSelector((s) => s.mentor.nextCheckAt);
  const dailyLaunch = useAppSelector((s) => s.mentor.dailyLaunch);
  const firstSteps = useAppSelector((s) => s.mentor.firstSteps);
  const firstStepsLoading = useAppSelector((s) => s.mentor.firstStepsLoading);
  const error = useAppSelector((s) => s.mentor.error);
  const tasks = useAppSelector((s) => s.routine.currentRoutine?.tasks ?? []);

  const fallbackTask = useMemo(() => pickFocusTask(tasks), [tasks]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>("");
  const [requesting, setRequesting] = useState(false);
  const [minutes, setMinutes] = useState(5);
  const [pickedSteps, setPickedSteps] = useState<number[]>([]);
  const [stepsNote, setStepsNote] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedTaskId && fallbackTask) setSelectedTaskId(fallbackTask.id);
  }, [fallbackTask, selectedTaskId]);

  // Günlük başlangıç maddesi sayısı (3/5/10) hatırlanır.
  const [launchCount, setLaunchCount] = useState(readLaunchCount);
  const [showLaunchSettings, setShowLaunchSettings] = useState(false);

  useEffect(() => {
    if (token) dispatch(loadDailyLaunch({ token, count: launchCount }));
  }, [token, dispatch, launchCount]);

  // Yeni adım listesi geldiğinde hepsini seçili başlat.
  useEffect(() => {
    setPickedSteps(firstSteps ? firstSteps.steps.map((_, i) => i) : []);
    setStepsNote(null);
  }, [firstSteps]);

  const selectedTask =
    tasks.find((t) => t.id === selectedTaskId) ?? fallbackTask ?? null;

  // Adımlar hangi süreyle üretildiyse gösterim ve ekleme onu kullanır.
  const generatedMinutes = firstSteps?.minutes ?? minutes;
  const stepMinutes =
    firstSteps && firstSteps.steps.length > 0
      ? Math.max(1, Math.round(generatedMinutes / firstSteps.steps.length))
      : 0;

  const handleCheckNow = async () => {
    if (!token || requesting) return;
    setRequesting(true);
    try {
      await dispatch(requestMentorCheck(token)).unwrap();
    } catch {
      /* mentor.error */
    } finally {
      setRequesting(false);
    }
  };

  const handleFirstSteps = async () => {
    if (!token || !selectedTask) return;
    setStepsNote(null);
    try {
      await dispatch(
        requestFirstSteps({
          token,
          taskId: selectedTask.id,
          title: selectedTask.title,
          notes: selectedTask.description ?? null,
          minutes,
        }),
      ).unwrap();
    } catch {
      /* mentor.error */
    }
  };

  const toggleStep = (index: number) => {
    setPickedSteps((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index],
    );
  };

  const applyFirstAction = () => {
    if (!firstSteps || !selectedTask) return;
    const step = firstSteps.steps[0];
    dispatch(
      updateTask({
        id: selectedTask.id,
        updates: { firstAction: step },
      }),
    );
    setStepsNote(`İlk adım göreve kaydedildi: “${step}”`);
  };

  const addPickedAsTasks = () => {
    if (!firstSteps || !selectedTask || pickedSteps.length === 0) return;
    const titles = [...pickedSteps]
      .sort((a, b) => a - b)
      .map((index) => firstSteps.steps[index])
      .filter((step): step is string => Boolean(step));
    dispatch(addSubtasks({ id: selectedTask.id, titles }));
    setStepsNote(
      `${titles.length} adım “${selectedTask.title}” görevine alt görev olarak eklendi.`,
    );
    setPickedSteps([]);
  };

  const aiActive = (ai?.availableKeys ?? 0) > 0 && settings?.aiEnabled !== false;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-text flex items-center gap-2">
            <BrainCircuit size={18} className="text-primary" />
            AI Mentor
          </h2>
          <p className="text-xs text-text-muted">
            Saatlik hesap verebilirlik · {settings?.timezone ?? "Asia/Baku"} ·{" "}
            {settings?.enabled === false
              ? "kontroller kapalı"
              : nextCheckAt
                ? `sonraki kontrol ${formatClock(nextCheckAt)} (${formatRelative(nextCheckAt)})`
                : "program yok"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[10px] px-2 py-1 rounded-full border ${
              aiActive
                ? "border-success/30 text-success bg-success/10"
                : "border-border text-text-muted bg-surface"
            }`}
            title={
              aiActive
                ? `Model: ${ai?.model} · kullanılabilir anahtar: ${ai?.availableKeys}/${ai?.configuredKeys}`
                : "Gemini anahtarı yok veya kota nedeniyle kapalı; kural tabanlı mesajlar kullanılıyor"
            }
          >
            {aiActive ? "AI aktif" : "Yerel fallback"}
          </span>
          <button
            onClick={handleCheckNow}
            disabled={!token || requesting}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-xs text-text-muted hover:text-text transition-colors disabled:opacity-50"
          >
            {requesting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            Kontrol et
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-danger bg-danger/10 border border-danger/25 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      {/* Bekleyen kontroller */}
      {pending.length > 0 ? (
        <div className="space-y-3">
          {pending.slice(0, 2).map((check) => (
            <div
              key={check._id}
              className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wide text-text-muted flex items-center gap-1.5">
                  <Sparkles size={11} className="text-warning" />
                  {check.taskTitle ?? "Mentor kontrolü"}
                </span>
                <span className="text-[10px] text-text-muted">
                  {check.createdAt
                    ? formatClock(new Date(check.createdAt).getTime())
                    : ""}
                  {" · "}
                  {(check.generatedBy ?? check.source) === "ai" ? "AI" : "kural"}
                </span>
              </div>
              <p className="text-sm text-text leading-relaxed mb-3">
                {check.message}
              </p>
              <CheckActions check={check} />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-sm text-text">
            Şu an bekleyen kontrol yok.
            {settings?.restUntil && settings.restUntil > Date.now()
              ? ` Dinlenme modundasın, ${formatRelative(settings.restUntil)} devam eder.`
              : " Bir sonraki kontrolde ilerlemeni soracağım."}
          </p>
          <button
            onClick={handleCheckNow}
            disabled={!token || requesting}
            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {requesting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Sparkles size={12} />
            )}
            Manuel kontrol başlat
          </button>
        </div>
      )}

      {/* Daily launch */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-text flex items-center gap-1.5">
            <Target size={14} className="text-primary" />
            Günlük başlangıç
          </h3>
          <div className="flex items-center gap-2 relative">
            <button
              onClick={() =>
                token &&
                dispatch(
                  loadDailyLaunch({ token, refresh: true, count: launchCount }),
                )
              }
              className="text-[10px] text-text-muted hover:text-text"
              title="Yeniden oluştur"
            >
              yenile
            </button>
            <button
              onClick={() => setShowLaunchSettings((v) => !v)}
              className="p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
              title="Günlük başlangıç ayarı (kaç madde)"
              aria-label="Günlük başlangıç ayarı"
              aria-expanded={showLaunchSettings}
            >
              <Settings2 size={12} />
            </button>

            {showLaunchSettings && (
              <div className="absolute right-0 top-7 z-20 w-40 rounded-xl border border-border bg-surface p-2 shadow-xl">
                <p className="text-[10px] text-text-muted px-1 mb-1">
                  Kaç madde?
                </p>
                <div className="flex gap-1">
                  {LAUNCH_COUNTS.map((n) => (
                    <button
                      key={n}
                      onClick={() => {
                        setLaunchCount(n);
                        localStorage.setItem(LAUNCH_COUNT_KEY, String(n));
                        setShowLaunchSettings(false);
                      }}
                      className={`flex-1 py-1 rounded-lg text-[11px] font-semibold tabular-nums border transition-colors ${
                        launchCount === n
                          ? "bg-primary text-white border-primary"
                          : "bg-background border-border text-text-muted hover:text-text"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        {dailyLaunch ? (
          <ol className="space-y-2 text-sm text-text">
            {(dailyLaunch.items && dailyLaunch.items.length > 0
              ? dailyLaunch.items
              : [
                  {
                    title: dailyLaunch.topTaskTitle,
                    firstStep: dailyLaunch.firstStep,
                    doneCriteria: dailyLaunch.doneCriteria,
                  },
                ]
            ).map((item, idx) => (
              <li key={`${item.title}-${idx}`} className="flex gap-2">
                <span className="text-primary font-bold shrink-0 tabular-nums">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-medium leading-snug break-words">
                    {item.title}
                  </p>
                  <p className="text-[11px] text-text-muted leading-snug mt-0.5">
                    → {item.firstStep}
                  </p>
                  <p className="text-[10px] text-text-muted/80 leading-snug">
                    ✓ {item.doneCriteria}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs text-text-muted">
            {error ? "Oluşturulamadı — yenile'ye bas." : "Hazırlanıyor..."}
          </p>
        )}
      </div>

      {/* İlk adımlar */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-text flex items-center gap-1.5">
            <Timer size={14} className="text-warning" />
            İlk adımlar
          </h3>
          {firstSteps && firstSteps.taskId === selectedTask?.id && (
            <span className="text-[10px] text-text-muted tabular-nums">
              ~{stepMinutes} dk/adım · {firstSteps.steps.length} adım
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1 mb-2">
          {[5, 15, 30, 60, 120].map((m) => (
            <button
              key={m}
              onClick={() => setMinutes(m)}
              className={`px-2 py-1 rounded-md text-[10px] tabular-nums border transition-colors ${
                minutes === m
                  ? "bg-warning/10 border-warning/40 text-warning"
                  : "bg-background border-border text-text-muted hover:text-text"
              }`}
            >
              {m} dk
            </button>
          ))}
          <span className="flex items-center gap-1 ml-1 shrink-0">
            <input
              type="number"
              min={5}
              max={240}
              step={5}
              value={minutes}
              onChange={(e) =>
                setMinutes(
                  Math.min(240, Math.max(5, Number(e.target.value) || 5)),
                )
              }
              className="w-14 px-2 py-1 rounded-md bg-background border border-border text-[10px] text-text tabular-nums"
              aria-label="Süre (dakika)"
            />
            <span className="text-[10px] text-text-muted">dk</span>
          </span>
        </div>

        <div className="flex gap-2">
          <select
            value={selectedTaskId}
            onChange={(e) => {
              setSelectedTaskId(e.target.value);
              dispatch(clearFirstSteps());
            }}
            className="flex-1 min-w-0 px-2.5 py-2 rounded-lg bg-background border border-border text-xs text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">Görev seç...</option>
            {tasks
              .filter((t) => t.status !== "completed")
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
          </select>
          <button
            onClick={handleFirstSteps}
            disabled={!selectedTask || firstStepsLoading || !token}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {firstStepsLoading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Sparkles size={12} />
            )}
            Adımları üret
          </button>
        </div>

        {selectedTask?.firstAction && (
          <p className="text-[11px] text-text-muted mt-2 truncate">
            Kayıtlı ilk adım: {selectedTask.firstAction}
          </p>
        )}

        {firstSteps && firstSteps.taskId === selectedTask?.id && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-wide text-text-muted">
                {firstSteps.source === "ai" ? "AI önerisi" : "Yerel öneri"}
              </p>
              <div className="flex gap-2 text-[10px]">
                <button
                  onClick={() =>
                    setPickedSteps(firstSteps.steps.map((_, i) => i))
                  }
                  className="text-primary hover:underline"
                >
                  Tümünü seç
                </button>
                <button
                  onClick={() => setPickedSteps([])}
                  className="text-text-muted hover:text-text"
                >
                  Temizle
                </button>
              </div>
            </div>
            <ol className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {firstSteps.steps.map((step, i) => {
                const active = pickedSteps.includes(i);
                return (
                  <li key={i}>
                    <button
                      onClick={() => toggleStep(i)}
                      className={`w-full flex gap-2 text-left text-xs rounded-lg px-2.5 py-2 border transition-colors ${
                        active
                          ? "bg-primary/10 border-primary/40 text-text"
                          : "bg-background border-border text-text-muted hover:text-text"
                      }`}
                    >
                      <span
                        className={`mt-0.5 w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 text-[9px] ${
                          active
                            ? "bg-primary border-primary text-white"
                            : "border-border"
                        }`}
                      >
                        {active ? "✓" : ""}
                      </span>
                      <span className="flex-1 min-w-0">{step}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={addPickedAsTasks}
                disabled={pickedSteps.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                Seçilenleri alt görev ekle ({pickedSteps.length})
              </button>
              <button
                onClick={applyFirstAction}
                className="px-3 py-2 rounded-lg bg-background border border-border text-xs text-text-muted hover:text-text transition-colors"
              >
                İlk adımı kaydet
              </button>
            </div>
            {stepsNote && (
              <p className="text-[11px] text-success">{stepsNote}</p>
            )}
          </div>
        )}
      </div>

      {/* Kontrol geçmişi */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <h3 className="text-sm font-semibold text-text flex items-center gap-1.5 mb-2">
          <History size={14} className="text-text-muted" />
          Bugünün kontrolleri
        </h3>
        {checks.length === 0 ? (
          <p className="text-xs text-text-muted">Bugün henüz kontrol yok.</p>
        ) : (
          <div className="space-y-2">
            {checks.map((check) => (
              <div key={check._id} className="border-l-2 border-border pl-2.5">
                <div className="flex items-center gap-2 text-[10px] text-text-muted">
                  <Clock3 size={10} />
                  {check.createdAt
                    ? formatClock(new Date(check.createdAt).getTime())
                    : ""}
                  <span
                    className={
                      check.status === "answered" ? "text-success" : "text-warning"
                    }
                  >
                    {check.status === "answered" ? "yanıtlandı" : "bekliyor"}
                  </span>
                  {check.response && <span>· {check.response}</span>}
                </div>
                <p className="text-xs text-text mt-0.5">{check.message}</p>
                {check.responseNote && (
                  <p className="text-[11px] text-text-muted mt-0.5">
                    Notun: {check.responseNote}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Aktivite akışı */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-text flex items-center gap-1.5">
            <Activity size={14} className="text-primary" />
            Bugünkü aktivite
          </h3>
          {summary && (
            <span className="text-[10px] text-text-muted tabular-nums">
              odak {summary.focusMinutes}dk · dinlenme {summary.restMinutes}dk
            </span>
          )}
        </div>
        {activities.length === 0 ? (
          <p className="text-xs text-text-muted">
            Henüz aktivite bildirilmedi. Kontrollerde verdiğin cevaplar burada
            listelenir.
          </p>
        ) : (
          <div className="space-y-1.5">
            {activities.slice(0, 10).map((activity) => (
              <div
                key={activity._id}
                className="flex items-center gap-2 text-xs text-text"
              >
                <CheckCircle2 size={11} className="text-text-muted shrink-0" />
                <span className="shrink-0 text-text-muted tabular-nums">
                  {formatClock(activity.startedAt)}
                </span>
                <span className="truncate">
                  {ACTIVITY_LABEL[activity.kind] ?? activity.kind}
                  {activity.taskTitle ? ` — ${activity.taskTitle}` : ""}
                </span>
                {activity.note && (
                  <span className="text-text-muted truncate hidden sm:inline">
                    “{activity.note}”
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
