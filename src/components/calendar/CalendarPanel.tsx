import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setSelectedDate } from "@/store/slices/uiSlice";
import { useAuth } from "@/contexts/AuthContext";
import { routineApi } from "@/services/api";
import { getTodayString } from "@/utils";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
} from "lucide-react";

type CalView = "day" | "month" | "year";

interface DayCount {
  date: string;
  planned: number;
  done: number;
  open: number;
  repeats: number;
  total: number;
}

interface DayTask {
  id: string;
  title: string;
  color: string;
  status: string;
  startTime: number | null;
  estimatedMinutes: number | null;
  repeat: string | null;
  virtual: boolean;
}

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shortDate(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

function longDate(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  const weekday = d.toLocaleDateString("tr-TR", { weekday: "long" });
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${weekday}`;
}

/**
 * Gün / ay / yıl görünümlü takvim. Seçilen gün, altındaki plan listesini belirler.
 * Aynı günün planı tekrarlayan görevleri de içerir (günlük görev her gün görünür,
 * tek seferlik görev yalnızca kendi gününde).
 */
export default function CalendarPanel() {
  const dispatch = useAppDispatch();
  const { token } = useAuth();
  const selectedDate = useAppSelector((s) => s.ui.selectedDate);
  const dayRefresh = useAppSelector((s) => s.ui.dayRefresh);
  const progressive = useAppSelector((s) => s.ui.progressiveLists);
  const today = getTodayString();

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<CalView>("month");
  const [anchor, setAnchor] = useState(selectedDate.slice(0, 7));
  const [yearAnchor, setYearAnchor] = useState(Number(selectedDate.slice(0, 4)));
  const [monthDays, setMonthDays] = useState<DayCount[]>([]);
  const [yearMonths, setYearMonths] = useState<
    Array<{ month: number; planned: number; done: number; open: number; total: number }>
  >([]);
  const [dayTasks, setDayTasks] = useState<DayTask[]>([]);
  const [dayVisible, setDayVisible] = useState(6);
  const [loading, setLoading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastDocTop = useRef<number | null>(null);

  const loadMonth = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await routineApi.calendarMonth(`${anchor}-01`, token);
      setMonthDays(res.days ?? []);
    } catch {
      setMonthDays([]);
    } finally {
      setLoading(false);
    }
  }, [anchor, token]);

  const loadYear = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await routineApi.calendarYear(yearAnchor, token);
      setYearMonths(res.months ?? []);
    } catch {
      setYearMonths([]);
    } finally {
      setLoading(false);
    }
  }, [yearAnchor, token]);

  const loadDay = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await routineApi.dayFull(selectedDate, token);
      setDayTasks(res.tasks ?? []);
    } catch {
      setDayTasks([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, token]);

  useEffect(() => {
    if (!open || !token) return;
    // Başlıktaki görev sayısı ve gün görünümü için gün her zaman yüklenir.
    void loadDay();
    if (view === "month") void loadMonth();
    else if (view === "year") void loadYear();
  }, [open, view, token, loadMonth, loadYear, loadDay, dayRefresh]);

  // Takvimde gün seçerken sayfa zıplamasın: kart ekranda aynı yerde kalsın.
  const rememberTop = () => {
    const el = cardRef.current;
    if (el) lastDocTop.current = el.getBoundingClientRect().top + window.scrollY;
  };

  useEffect(() => {
    const el = cardRef.current;
    if (!el || lastDocTop.current === null) return;
    const currentTop = el.getBoundingClientRect().top + window.scrollY;
    const delta = currentTop - lastDocTop.current;
    if (Math.abs(delta) > 4) window.scrollBy(0, delta);
    lastDocTop.current = el.getBoundingClientRect().top + window.scrollY;
  }, [selectedDate]);

  // Seçili gün değişince ay görünümü o aya kayar.
  useEffect(() => {
    setAnchor(selectedDate.slice(0, 7));
    setYearAnchor(Number(selectedDate.slice(0, 4)));
    setDayVisible(6);
  }, [selectedDate]);

  const counts = useMemo(() => {
    const map = new Map<string, DayCount>();
    monthDays.forEach((d) => map.set(d.date, d));
    return map;
  }, [monthDays]);

  const cells = useMemo(() => {
    const [y, m] = anchor.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const offset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(y, m, 0).getDate();
    const list: Array<string | null> = [];
    for (let i = 0; i < offset; i += 1) list.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      list.push(`${y}-${pad(m)}-${pad(d)}`);
    }
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [anchor]);

  const shiftMonth = (delta: number) => {
    const [y, m] = anchor.split("-").map(Number);
    const next = new Date(y, m - 1 + delta, 1);
    setAnchor(`${next.getFullYear()}-${pad(next.getMonth() + 1)}`);
  };

  const shiftDay = (delta: number) => {
    const d = new Date(`${selectedDate}T12:00:00`);
    d.setDate(d.getDate() + delta);
    dispatch(setSelectedDate(keyOf(d)));
  };

  const goToday = () => {
    rememberTop();
    dispatch(setSelectedDate(today));
    setAnchor(today.slice(0, 7));
    setYearAnchor(Number(today.slice(0, 4)));
  };

  const monthTotal = monthDays.reduce((sum, d) => sum + d.total, 0);
  const dayCount = dayTasks.filter((t) => t.status !== "completed").length;
  const [ay, am] = anchor.split("-").map(Number);

  return (
    <div
      ref={cardRef}
      className="rounded-xl border border-border bg-surface overflow-hidden"
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-hover/40 transition-colors"
      >
        <CalendarDays size={14} className="text-primary shrink-0" />
        <h3 className="text-xs font-semibold text-text-muted uppercase shrink-0">
          Takvim
        </h3>
        <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-primary/15 text-primary font-medium">
          {selectedDate === today ? "Bugün" : shortDate(selectedDate)}
        </span>
        <span className="text-[10px] text-text-muted/80">
          {dayCount} açık görev
        </span>
        <span className="ml-auto text-text-muted">
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2.5">
          <div className="flex items-center gap-1.5">
            <div className="flex rounded-lg bg-background/70 p-0.5">
              {(["day", "month", "year"] as CalView[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    view === v
                      ? "bg-primary text-white"
                      : "text-text-muted hover:text-text"
                  }`}
                >
                  {v === "day" ? "Gün" : v === "month" ? "Ay" : "Yıl"}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1">
              {view !== "year" && (
                <button
                  onClick={() => (view === "month" ? shiftMonth(-1) : shiftDay(-1))}
                  className="p-1 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                  aria-label="Geri"
                >
                  <ChevronLeft size={14} />
                </button>
              )}
              <button
                onClick={goToday}
                className="px-2 py-1 rounded-lg text-[11px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
              >
                Bugün
              </button>
              {view !== "year" && (
                <button
                  onClick={() => (view === "month" ? shiftMonth(1) : shiftDay(1))}
                  className="p-1 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                  aria-label="İleri"
                >
                  <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>

          {view === "month" && (
            <>
              <div className="flex items-center justify-between text-[11px] text-text-muted px-0.5">
                <span className="font-medium text-text">
                  {MONTHS[am - 1]} {ay}
                </span>
                <span>{loading ? "…" : `${monthTotal} görev`}</span>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center">
                {WEEKDAYS.map((w) => (
                  <span key={w} className="text-[9px] text-text-muted/70">
                    {w}
                  </span>
                ))}
                {cells.map((date, i) => {
                  if (!date) return <span key={`empty-${i}`} />;
                  const info = counts.get(date);
                  const isToday = date === today;
                  const isSelected = date === selectedDate;
                  const dots = info
                    ? info.total > 0
                      ? info.open === 0
                        ? 1
                        : Math.min(3, info.planned > 0 ? 2 : 1)
                      : 0
                    : 0;
                  return (
                    <button
                      key={date}
                      onClick={() => {
                        rememberTop();
                        dispatch(setSelectedDate(date));
                      }}
                      className={`relative h-9 rounded-lg flex flex-col items-center justify-center transition-all ${
                        isSelected
                          ? "bg-primary text-white shadow-sm shadow-primary/30"
                          : isToday
                            ? "bg-primary/15 text-text ring-1 ring-primary/40"
                            : "text-text-muted hover:text-text hover:bg-surface-hover"
                      }`}
                    >
                      <span className="text-[11px] tabular-nums leading-none">
                        {Number(date.slice(8))}
                      </span>
                      {dots > 0 && (
                        <span className="flex gap-0.5 mt-1">
                          {Array.from({ length: dots }).map((_, k) => (
                            <span
                              key={k}
                              className={`w-1 h-1 rounded-full ${
                                isSelected
                                  ? "bg-white/80"
                                  : info && info.open === 0
                                    ? "bg-success/70"
                                    : "bg-primary/70"
                              }`}
                            />
                          ))}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {view === "year" && (
            <>
              <div className="flex items-center justify-between text-[11px] text-text-muted px-0.5">
                <button
                  onClick={() => setYearAnchor((y) => y - 1)}
                  className="p-1 rounded-lg hover:bg-surface-hover"
                  aria-label="Önceki yıl"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="font-medium text-text">{yearAnchor}</span>
                <button
                  onClick={() => setYearAnchor((y) => y + 1)}
                  className="p-1 rounded-lg hover:bg-surface-hover"
                  aria-label="Sonraki yıl"
                >
                  <ChevronRight size={14} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {MONTHS.map((name, i) => {
                  const info = yearMonths.find((m) => m.month === i + 1);
                  const total = info?.total ?? 0;
                  const max = Math.max(1, ...yearMonths.map((m) => m.total));
                  const isSelected = Number(selectedDate.slice(5, 7)) === i + 1;
                  return (
                    <button
                      key={name}
                      onClick={() => {
                        setAnchor(`${yearAnchor}-${pad(i + 1)}`);
                        setView("month");
                      }}
                      className={`rounded-lg bg-background/60 px-2 py-1.5 text-left hover:bg-surface-hover transition-colors ${
                        isSelected ? "ring-1 ring-primary/40" : ""
                      }`}
                    >
                      <span className="block text-[11px] text-text font-medium">
                        {name.slice(0, 3)}
                      </span>
                      <span className="block text-[10px] text-text-muted">
                        {total > 0 ? `${total} görev` : "—"}
                      </span>
                      <span className="block mt-1 h-1 rounded-full bg-border overflow-hidden">
                        <span
                          className="block h-full bg-primary/70"
                          style={{ width: `${Math.round((total / max) * 100)}%` }}
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {view === "day" && (
            <div className="rounded-lg bg-background/60 p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-text">
                  {longDate(selectedDate)}
                </span>
                {loading && <Loader2 size={12} className="animate-spin text-text-muted" />}
              </div>
              <p className="text-[10px] text-text-muted mt-0.5">
                {dayTasks.length === 0
                  ? "Bu gün için plan yok."
                  : `${dayTasks.length} görev · ${dayTasks.filter((t) => t.status === "completed").length} tamamlandı`}
              </p>

              <div className="mt-1.5 space-y-1">
                {(progressive ? dayTasks.slice(0, dayVisible) : dayTasks).map((task) => (
                  <div key={task.id} className="flex items-center gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: task.color }}
                    />
                    <span
                      className={`text-[11px] flex-1 min-w-0 truncate ${
                        task.status === "completed"
                          ? "text-text-muted line-through"
                          : "text-text"
                      }`}
                    >
                      {task.title}
                    </span>
                    {task.repeat && (
                      <span className="text-[9px] px-1 rounded bg-primary/15 text-primary">
                        tekrar
                      </span>
                    )}
                    <span className="text-[10px] text-text-muted tabular-nums shrink-0">
                      {task.startTime
                        ? new Date(task.startTime).toLocaleTimeString("tr-TR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : task.estimatedMinutes
                          ? `~${task.estimatedMinutes} dk`
                          : "saatsiz"}
                    </span>
                  </div>
                ))}
                {progressive && dayTasks.length > dayVisible && (
                  <button
                    onClick={() => setDayVisible((v) => v + 5)}
                    className="text-[10px] text-primary hover:underline"
                  >
                    +{Math.min(5, dayTasks.length - dayVisible)} görev daha
                    {dayTasks.length - dayVisible > 5
                      ? ` (${dayTasks.length - dayVisible} kaldı)`
                      : ""}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
