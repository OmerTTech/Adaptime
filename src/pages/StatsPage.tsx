import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { loadRoutineHistory } from "@/store/slices/routineSlice";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { ACTIVITY_LABEL, isScheduled } from "@/types";
import { formatTime } from "@/utils";
import {
  Flame,
  TrendingUp,
  CheckCircle,
  CircleSlash,
  BarChart3,
  Loader2,
  Activity,
  Timer,
  Coffee,
  AlertTriangle,
} from "lucide-react";

interface MidValue {
  date: string;
  completed: number;
  total: number;
  focusMinutes: number;
}

const FRESH = 7;
const DEEP = 30;

export default function StatsPage() {
  const { token } = useAuth();
  const dispatch = useAppDispatch();
  const history = useAppSelector((s) => s.routine.history);
  const historyLoaded = useAppSelector((s) => s.routine.historyLoaded);
  const currentRoutine = useAppSelector((s) => s.routine.currentRoutine);
  const summary = useAppSelector((s) => s.mentor.summary);
  const activities = useAppSelector((s) => s.mentor.activities);
  const [loading, setLoading] = useState(false);
  const [fresh, setFresh] = useState<MidValue[]>([]);
  const [deep, setDeep] = useState<MidValue[]>([]);

  useEffect(() => {
    if (!token || historyLoaded) return;
    setLoading(true);
    dispatch(loadRoutineHistory({ token, limit: 30 }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, historyLoaded, dispatch]);

  const build = (days: number): MidValue[] => {
    const out: MidValue[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const r = history.find((h) => h.date === date);
      const tasks = r?.tasks ?? [];
      const completed = tasks.filter((t) => t.status === "completed").length;
      const focusMinutes = tasks.reduce((acc, t) => {
        if (t.status !== "completed") return acc;
        if (isScheduled(t)) {
          return (
            acc +
            Math.max(0, (t.endTime! - t.startTime! - t.pausedDuration) / 60000)
          );
        }
        return acc + (t.estimatedMinutes ?? 0);
      }, 0);
      out.push({ date, completed, total: tasks.length, focusMinutes });
    }
    return out;
  };

  useEffect(() => {
    setFresh(build(FRESH));
    setDeep(build(DEEP));
  }, [history, currentRoutine]);

  const scheduledToday = (currentRoutine?.tasks ?? []).filter(isScheduled);
  const doneToday = scheduledToday.filter((t) => t.status === "completed").length;
  const doneTodayPct =
    scheduledToday.length > 0
      ? Math.round((doneToday / scheduledToday.length) * 100)
      : 0;
  const unscheduledPending = (currentRoutine?.tasks ?? []).filter(
    (t) => !isScheduled(t) && t.status !== "completed",
  ).length;

  const maxSharp = Math.max(
    1,
    ...[...fresh, ...deep].map((v) => v.completed),
  );
  const rng = [...fresh, ...deep].slice(-FRESH);

  const renderBars = (data: MidValue[], max: number) => (
    <div className="flex items-end gap-1.5 h-24">
      {data.map((v) => {
        const h = Math.max(4, (v.completed / max) * 96);
        const hasData = v.total > 0;
        return (
          <div
            key={v.date}
            className="flex flex-col items-center gap-1 flex-1 min-w-0"
            title={`${v.date}: ${v.completed}/${v.total} tamamlandı · ${Math.round(v.focusMinutes)}dk odak`}
          >
            <div
              className={`w-full rounded-md ${hasData ? "bg-primary/70" : "bg-border/40"}`}
              style={{ height: `${h}px` }}
            />
            <span className="text-[8px] text-text-muted tabular-nums">
              {new Date(v.date).getDate()}/{Number(v.date.slice(5, 7))}
            </span>
          </div>
        );
      })}
    </div>
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-text-muted">
        <Loader2 size={32} className="animate-spin" />
        <p className="text-sm">Geçmiş yükleniyor...</p>
      </div>
    );
  }

  if (!historyLoaded && history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-text-muted">
        <BarChart3 size={40} className="opacity-40" />
        <p className="text-sm">Henüz istatistik yok. bugün görev ekle ve takip et.</p>
      </div>
    );
  }

  const weekDone = rng.filter((v) => v.completed > 0).length;
  const weekFocus = rng.reduce((a, v) => a + v.focusMinutes, 0);
  const totalDays = deep.filter((v) => v.total > 0).length;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h2 className="text-lg font-bold text-text flex items-center gap-2">
          <BarChart3 size={18} className="text-primary" />
          İstatistikler
        </h2>
        <p className="text-xs text-text-muted">
          Güne bakış ve son {DEEP} günün özeti.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-surface border border-border">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <CheckCircle size={14} className="text-success" />
            Bugün tamamlanan
          </div>
          <div className="text-3xl font-bold text-text mt-1 tabular-nums">
            {doneToday}
            <span className="text-base text-text-muted font-medium">
              /{scheduledToday.length}
            </span>
          </div>
          <div className="mt-2 h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-success rounded-full transition-all"
              style={{ width: `${doneTodayPct}%` }}
            />
          </div>
          <p className="text-[10px] text-text-muted mt-1">
            %{doneTodayPct} tamamlandı
          </p>
        </div>

        <div className="p-4 rounded-xl bg-surface border border-border">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Flame size={14} className="text-warning" />
            Odak süresi (7 gün)
          </div>
          <div className="text-3xl font-bold text-text mt-1 tabular-nums">
            {Math.round(weekFocus / 60)}sa
            <span className="text-base text-text-muted font-medium">
              {" "}
              {Math.round(weekFocus % 60)}dk
            </span>
          </div>
          <p className="text-[10px] text-text-muted mt-1">
            {weekDone}/{FRESH} gün görev tamamlandı
          </p>
        </div>
      </div>

      {summary && (
        <div className="p-4 rounded-xl bg-surface border border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-text">
              <Activity size={14} className="text-primary" />
              Hesap verebilirlik (bugün)
            </div>
            <span className="text-[10px] text-text-muted tabular-nums">
              {summary.checksAnswered}/{summary.checksSent} kontrol yanıtlandı
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              {
                label: "Tamamlanan",
                value: `${summary.completed}/${summary.planned}`,
                hint: `%${summary.completionRate}`,
              },
              {
                label: "Geciken",
                value: String(summary.overdue),
                hint: "süresi geçmiş",
              },
              {
                label: "Ertelenen",
                value: String(summary.delayed),
                hint: "görev",
              },
              {
                label: "Deadline",
                value: `%${summary.deadlineSuccessRate}`,
                hint: "zamanında",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="p-2.5 rounded-lg bg-background border border-border"
              >
                <p className="text-[10px] uppercase tracking-wide text-text-muted">
                  {item.label}
                </p>
                <p className="text-base font-bold text-text tabular-nums">
                  {item.value}
                </p>
                <p className="text-[9px] text-text-muted">{item.hint}</p>
              </div>
            ))}
          </div>

          <div>
            <div className="flex items-center justify-between text-[10px] text-text-muted mb-1">
              <span>Planlanan süre: {summary.plannedMinutes} dk</span>
              <span>
                Bildirilen çalışma: {summary.workingMinutes + summary.otherMinutes} dk
              </span>
            </div>
            <div className="h-2 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{
                  width: `${Math.min(
                    100,
                    summary.plannedMinutes > 0
                      ? Math.round(
                          ((summary.workingMinutes + summary.otherMinutes) /
                            summary.plannedMinutes) *
                            100,
                        )
                      : 0,
                  )}%`,
                }}
              />
            </div>
            <p className="text-[9px] text-text-muted mt-1">
              Yalnızca senin bildirdiğin aktiviteler sayılır; tahmin edilen süre
              istatistiğe eklenmez.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-lg bg-background border border-border">
              <Timer size={12} className="mx-auto text-primary" />
              <p className="text-sm font-bold text-text tabular-nums mt-0.5">
                {summary.focusMinutes} dk
              </p>
              <p className="text-[9px] text-text-muted">odak</p>
            </div>
            <div className="p-2 rounded-lg bg-background border border-border">
              <AlertTriangle size={12} className="mx-auto text-warning" />
              <p className="text-sm font-bold text-text tabular-nums mt-0.5">
                {summary.otherMinutes} dk
              </p>
              <p className="text-[9px] text-text-muted">başka iş</p>
            </div>
            <div className="p-2 rounded-lg bg-background border border-border">
              <Coffee size={12} className="mx-auto text-text-muted" />
              <p className="text-sm font-bold text-text tabular-nums mt-0.5">
                {summary.restMinutes} dk
              </p>
              <p className="text-[9px] text-text-muted">dinlenme</p>
            </div>
          </div>

          {activities.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-text-muted mb-1">
                Son bildirimler
              </p>
              <div className="space-y-1">
                {activities.slice(0, 5).map((a) => (
                  <div
                    key={a._id}
                    className="flex items-center justify-between text-[11px] text-text"
                  >
                    <span className="truncate">
                      {formatTime(a.startedAt)} · {ACTIVITY_LABEL[a.kind]}
                      {a.taskTitle ? ` — ${a.taskTitle}` : ""}
                    </span>
                    {a.note && (
                      <span className="text-text-muted truncate max-w-[40%]">
                        “{a.note}”
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="p-4 rounded-xl bg-surface border border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-medium text-text">
            <TrendingUp size={14} className="text-primary" />
            Son 7 Gün
          </div>
          <span className="text-xs text-text-muted">
            Aktif gün: {totalDays}
          </span>
        </div>
        {renderBars(fresh, maxSharp)}
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-text-muted">7 gün önce</span>
          <span className="text-[9px] text-text-muted">Bugün</span>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-surface border border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-text mb-3">
          <BarChart3 size={14} className="text-primary" />
          Son 30 Gün
        </div>
        {renderBars(deep, maxSharp)}
      </div>

      <div className="p-4 rounded-xl bg-surface border border-border flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-text">
          <CircleSlash size={14} className="text-text-muted" />
          Saatsiz bekleyen
        </div>
        <span className="font-bold text-text tabular-nums">
          {unscheduledPending}
        </span>
      </div>

      {history.length > 0 && (
        <div className="p-4 rounded-xl bg-surface border border-border">
          <p className="text-sm font-medium text-text mb-2">Son Günler</p>
          <div className="space-y-1.5">
            {history.slice(0, 8).map((r) => {
              const done = r.tasks.filter(
                (t) => t.status === "completed",
              ).length;
              return (
                <div
                  key={r.date}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-text-muted">
                    {new Date(r.date).toLocaleDateString("tr-TR", {
                      day: "2-digit",
                      month: "long",
                    })}
                  </span>
                  <span className="text-text tabular-nums">
                    {done} tamamlandı{" "}
                    <span className="text-text-muted">/ {r.tasks.length}</span>
                  </span>
                  {r.dayEndTime ? (
                    <span className="text-text-muted tabular-nums">
                      bitiş {formatTime(r.dayEndTime)}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}