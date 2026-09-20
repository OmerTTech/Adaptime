import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { loadRoutineHistory } from "@/store/slices/routineSlice";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { isScheduled } from "@/types";
import { formatTime } from "@/utils";
import {
  Flame,
  TrendingUp,
  CheckCircle,
  CircleSlash,
  BarChart3,
  Loader2,
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