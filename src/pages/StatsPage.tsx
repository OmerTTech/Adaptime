import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { loadRoutineHistory, setStreak } from "@/store/slices/routineSlice";
import { loadDiaryEntries } from "@/store/slices/diarySlice";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { ACTIVITY_LABEL, CATEGORY_LABEL, isScheduled } from "@/types";
import { estimateAccuracy } from "@/engine/estimates";
import { formatTime, getTodayString } from "@/utils";
import { routineApi } from "@/services/api";
import { computeGamification } from "@/engine/gamification";
import { buildWeeklyReview } from "@/engine/weeklyReview";
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
  CalendarDays,
  Download,
  Moon,
  Trophy,
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
  const [streakInfo, setStreakInfo] = useState<{
    currentStreak: number;
    freezesLeft?: number;
    freezesPerMonth?: number;
    canFreezeYesterday?: boolean;
  } | null>(null);
  const [freezing, setFreezing] = useState(false);

  // Sayfaya her girişte tazele: aksi halde bugünkü değişiklikler grafiklere
  // yansımıyor (geçmiş yalnızca ilk açılışta yükleniyordu).
  useEffect(() => {
    if (!token) return;
    if (!historyLoaded) setLoading(true);
    dispatch(loadRoutineHistory({ token, limit: 30 }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, dispatch, historyLoaded]);

  const build = (days: number): MidValue[] => {
    const out: MidValue[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      // Bugünün canlı planı sunucudaki anlık görüntüden önce gelir.
      const r =
        currentRoutine && currentRoutine.date === date
          ? currentRoutine
          : history.find((h) => h.date === date);
      const all = r?.tasks ?? [];
      // Pas geçilenler ne tamamlandı ne de planlanmış sayılır.
      const tasks = all.filter((t) => t.status !== "skipped");
      const completed = tasks.filter((t) => t.status === "completed").length;
      const focusMinutes = tasks.reduce((acc, t) => {
        if (t.status !== "completed") return acc;
        const adjust = t.timeAdjustMinutes ?? 0;
        if (isScheduled(t)) {
          return (
            acc +
            Math.max(
              0,
              (t.endTime! - t.startTime! - t.pausedDuration) / 60000 - adjust,
            )
          );
        }
        return acc + Math.max(0, (t.estimatedMinutes ?? 0) - adjust);
      }, 0);
      out.push({ date, completed, total: tasks.length, focusMinutes });
    }
    return out;
  };

  useEffect(() => {
    setFresh(build(FRESH));
    setDeep(build(DEEP));
  }, [history, currentRoutine]);

  useEffect(() => {
    if (!token) return;
    routineApi
      .getStreak(token)
      .then(setStreakInfo)
      .catch(() => {});
  }, [token]);

  const freezeYesterday = async () => {
    if (!token || !streakInfo?.canFreezeYesterday || freezing) return;
    setFreezing(true);
    try {
      const res = await routineApi.freezeStreak(token);
      setStreakInfo(res);
      dispatch(setStreak(res.currentStreak));
      dispatch(loadRoutineHistory({ token, limit: 30 }));
    } catch {
      /* sessiz */
    } finally {
      setFreezing(false);
    }
  };

  // 4.5 — Haftalık özeti paylaşılabilir PNG olarak indir.
  const downloadWeeklyImage = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const gradient = ctx.createLinearGradient(0, 0, 1080, 1350);
    gradient.addColorStop(0, "#0f172a");
    gradient.addColorStop(1, "#1e293b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1080, 1350);

    ctx.fillStyle = "#a5b4fc";
    ctx.font = "600 40px sans-serif";
    ctx.fillText("ADAPTIME · HAFTALIK ÖZET", 90, 170);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 140px sans-serif";
    ctx.fillText(`${Math.floor(game.weekXp)}`, 90, 420);
    ctx.font = "500 42px sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText("bu hafta puan", 90, 480);

    ctx.fillStyle = "#e2e8f0";
    ctx.font = "500 46px sans-serif";
    ctx.fillText(
      `${Math.floor(weekly.focusMinutes / 60)} sa ${weekly.focusMinutes % 60} dk odak`,
      90,
      620,
    );
    ctx.fillText(
      `%${weekly.completionRate} tamamlama · ${weekly.completed}/${weekly.planned} görev`,
      90,
      710,
    );
    ctx.fillText(`Seviye ${game.level.index} · ${game.level.name}`, 90, 800);
    if (streakInfo) ctx.fillText(`Seri: ${streakInfo.currentStreak} gün`, 90, 890);

    ctx.fillStyle = "#64748b";
    ctx.font = "400 30px sans-serif";
    ctx.fillText("adaptime", 90, 1240);

    const link = document.createElement("a");
    link.download = `adaptime-hafta-${getTodayString()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const accuracy = estimateAccuracy(history);
  // 3.3 — Haftalık review: son 7 günün plan/gerçek özeti ve üç öneri.
  const weekly = buildWeeklyReview(history, currentRoutine);

  // 2.5 — Uyku ve tamamlama korelasyonu (günlükteki uyku saatinden).
  const diaryEntries = useAppSelector((s) => s.diary.entries);
  useEffect(() => {
    if (token && diaryEntries.length === 0) dispatch(loadDiaryEntries(token));
  }, [token, diaryEntries.length, dispatch]);

  const sleep = useMemo(() => {
    const rateFor = (date: string) => {
      const r =
        currentRoutine && currentRoutine.date === date
          ? currentRoutine
          : history.find((h) => h.date === date);
      if (!r) return null;
      const tasks = r.tasks.filter((t) => t.status !== "skipped");
      if (tasks.length === 0) return null;
      return (
        (tasks.filter((t) => t.status === "completed").length / tasks.length) *
        100
      );
    };
    const pairs = diaryEntries
      .filter((e) => typeof e.sleepHours === "number" && e.sleepHours > 0)
      .map((e) => ({ sleepHours: e.sleepHours as number, rate: rateFor(e.dateKey) }))
      .filter((p): p is { sleepHours: number; rate: number } => p.rate !== null);
    const low = pairs.filter((p) => p.sleepHours < 7);
    const good = pairs.filter((p) => p.sleepHours >= 7);
    const avg = (arr: typeof pairs) =>
      arr.length > 0
        ? Math.round(arr.reduce((a, p) => a + p.rate, 0) / arr.length)
        : null;
    return {
      pairs,
      lowAvg: avg(low),
      goodAvg: avg(good),
      lowCount: low.length,
      goodCount: good.length,
    };
  }, [diaryEntries, history, currentRoutine]);
  const game = computeGamification(
    history,
    currentRoutine,
    currentRoutine?.streak ?? 0,
    getTodayString(),
  );

  // Bugünkü ilerleme, saatli/saatsiz ayrımı yapmadan tüm açık görevleri sayar.
  const todayTasks = (currentRoutine?.tasks ?? []).filter(
    (t) => t.status !== "skipped",
  );
  const doneToday = todayTasks.filter((t) => t.status === "completed").length;
  const doneTodayPct =
    todayTasks.length > 0
      ? Math.round((doneToday / todayTasks.length) * 100)
      : 0;
  const unscheduledPending = (currentRoutine?.tasks ?? []).filter(
    (t) => !isScheduled(t) && t.status !== "completed",
  ).length;

  // Ölçek günün toplam görev sayısına göre: 3 görevden 1'i çubukta ~1/3 yükselir.
  const maxSharp = Math.max(
    1,
    ...[...fresh, ...deep].map((v) => Math.max(v.total, v.completed)),
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
              /{todayTasks.length}
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
        <div className="flex items-center gap-2 text-sm font-medium text-text">
          <Trophy size={14} className="text-warning" />
          Bu hafta kazandıkların
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-text tabular-nums">
            +{game.weekXp}
          </span>
          <span className="text-[11px] text-text-muted">puan</span>
          <span className="ml-auto text-[11px] text-text-muted tabular-nums">
            {game.weekCompleted} görev · seviye {game.level.index}{" "}
            {game.level.name}
          </span>
        </div>
        <div className="mt-2 h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-warning rounded-full transition-all"
            style={{ width: `${game.level.progress}%` }}
          />
        </div>
        <p className="text-[10px] text-text-muted mt-1">
          {game.level.next
            ? `${game.xp}/${game.level.next} puan · sonraki: ${game.level.nextName}`
            : `${game.xp} puan · en yüksek seviye`}
        </p>
        {streakInfo && (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-text-muted">
            <span className="text-text">
              Seri: {streakInfo.currentStreak} gün
            </span>
            <span>
              · bu ay {streakInfo.freezesLeft ?? 0}/
              {streakInfo.freezesPerMonth ?? 2} dondurma hakkı
            </span>
            {streakInfo.canFreezeYesterday && (
              <button
                onClick={freezeYesterday}
                disabled={freezing}
                className="px-2 py-0.5 rounded-md bg-warning/10 border border-warning/30 text-warning text-[10px] font-medium hover:bg-warning/20 transition-colors disabled:opacity-50"
              >
                {freezing ? "…" : "Dünü dondur (seriyi koru)"}
              </button>
            )}
          </div>
        )}
        <div className="mt-2.5 pt-2.5 border-t border-border">
          {game.weekBadges.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {game.weekBadges.map((badge) => (
                <span
                  key={badge.id}
                  title={badge.description}
                  className="text-[10px] px-1.5 py-0.5 rounded-md bg-warning/10 border border-warning/25 text-text"
                >
                  {badge.icon} {badge.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-text-muted">
              Bu hafta yeni rozet yok. Bir görev daha tamamlamak yeterli.
            </p>
          )}
          <p className="text-[10px] text-text-muted mt-1">
            Toplam {game.badges.length}/8 rozet · puan yalnızca tamamlanan
            görevlerden gelir.
          </p>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-surface border border-border">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-medium text-text">
            <CalendarDays size={14} className="text-primary" />
            Haftalık değerlendirme
          </div>
          <span className="text-[10px] text-text-muted tabular-nums">
            {weekly.activeDays}/{weekly.days} gün planlı
          </span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-lg bg-background border border-border">
            <p className="text-base font-bold text-text tabular-nums">
              %{weekly.completionRate}
            </p>
            <p className="text-[9px] text-text-muted">tamamlama</p>
          </div>
          <div className="p-2 rounded-lg bg-background border border-border">
            <p className="text-base font-bold text-text tabular-nums">
              {Math.floor(weekly.focusMinutes / 60)}sa{" "}
              {weekly.focusMinutes % 60}dk
            </p>
            <p className="text-[9px] text-text-muted">odak</p>
          </div>
          <div className="p-2 rounded-lg bg-background border border-border">
            <p className="text-base font-bold text-text tabular-nums">
              {weekly.carriedOver}
            </p>
            <p className="text-[9px] text-text-muted">devreden</p>
          </div>
        </div>
        <p className="text-[10px] text-text-muted mt-2 tabular-nums">
          {weekly.completed}/{weekly.planned} görev tamamlandı
          {weekly.bestDay
            ? ` · en verimli gün: ${new Date(
                `${weekly.bestDay.date}T12:00:00`,
              ).toLocaleDateString("tr-TR", { weekday: "long" })}`
            : ""}
        </p>
        <button
          onClick={downloadWeeklyImage}
          className="mt-2 flex items-center gap-1 text-[10px] text-primary hover:underline"
        >
          <Download size={10} /> Haftalık özeti görsel olarak indir
        </button>
        <ul className="mt-2 space-y-1">
          {weekly.suggestions.map((s) => (
            <li
              key={s}
              className="text-[11px] text-text-muted leading-snug flex gap-1.5"
            >
              <span className="text-primary shrink-0">·</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>

      {sleep.pairs.length > 0 && (
        <div className="p-4 rounded-xl bg-surface border border-border">
          <div className="flex items-center gap-2 text-sm font-medium text-text">
            <Moon size={14} className="text-primary" />
            Uyku ve tamamlama
          </div>
          {sleep.lowAvg !== null && sleep.goodAvg !== null ? (
            <>
              <p className="text-[11px] text-text-muted mt-1 leading-snug">
                7 saatten az uyuduğun günlerde tamamlama{" "}
                <strong className="text-text">%{sleep.lowAvg}</strong>, 7 saat
                ve üzerinde <strong className="text-text">%{sleep.goodAvg}</strong>.
                {sleep.goodAvg - sleep.lowAvg >= 10
                  ? " Uykuyu korumak doğrudan plana yarıyor."
                  : " Fark küçük; başka etkenler de var."}
              </p>
              <p className="text-[10px] text-text-muted mt-1 tabular-nums">
                {sleep.lowCount} az uyku · {sleep.goodCount} yeterli uyku günü
              </p>
            </>
          ) : (
            <p className="text-[11px] text-text-muted mt-1 leading-snug">
              Karşılaştırma için 7 saatin altında ve üstünde en az ikişer gün
              gerekiyor. Günlükte uyku saatini doldur.
            </p>
          )}
        </div>
      )}

      {accuracy.length > 0 && (
        <div className="p-4 rounded-xl bg-surface border border-border">
          <div className="flex items-center gap-2 text-sm font-medium text-text">
            <TrendingUp size={14} className="text-primary" />
            Süre tahminin tutuyor mu?
          </div>
          <p className="text-[11px] text-text-muted mt-1 mb-3">
            Bir göreve biçtiğin süre ile gerçekte süren süreyi karşılaştırır.
            1.0 = tam isabet. 1.4 = o tür işlerde planladığından %40 daha uzun
            sürüyor. Faiz değil; sadece “tahminim ne kadar gerçekçi” ölçüsü.
          </p>
          <div className="space-y-2.5">
            {accuracy.map((item) => (
              <div key={item.category}>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-text">
                    {CATEGORY_LABEL[item.category]}
                  </span>
                  <span className="text-text-muted tabular-nums">
                    {item.ratio.toFixed(1)}× · {item.samples} görev · gerçekte
                    ort. {Math.round(item.averageMinutes)} dk
                  </span>
                </div>
                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, item.ratio * 50)}%`,
                      backgroundColor:
                        item.ratio > 1.15
                          ? "#f59e0b"
                          : item.ratio < 0.85
                            ? "#6366f1"
                            : "var(--success)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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