import { useCallback, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { bumpDayRefresh } from "@/store/slices/uiSlice";
import { loadTodayRoutine } from "@/store/slices/routineSlice";
import { useAuth } from "@/contexts/AuthContext";
import { routineApi } from "@/services/api";
import { getRandomColor, getTodayString, timeToTimestamp } from "@/utils";
import { PRIORITY_ORDER, type TaskPriority } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CalendarClock,
  CheckCircle2,
  Copy,
  Loader2,
  Plus,
  Repeat,
  Save,
  Trash2,
} from "lucide-react";

interface DayTask {
  id: string;
  title: string;
  color: string;
  status: string;
  startTime: number | null;
  endTime: number | null;
  estimatedMinutes: number | null;
  repeat: string | null;
  priority?: string;
  sourceDate?: string;
  virtual: boolean;
}

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

function hhmm(ts: number | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function heading(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${d.toLocaleDateString("tr-TR", { weekday: "long" })}`;
}

/**
 * Takvimden bugün dışında bir gün seçildiğinde gösterilen plan:
 * planlı görevler + yapılacaklar. Tekrarlayan görevler "tekrar" etiketiyle
 * görünür; tek seferlik görevler yalnızca kendi gününde çıkar.
 */
export default function DayPlanView() {
  const dispatch = useAppDispatch();
  const { token } = useAuth();
  const selectedDate = useAppSelector((s) => s.ui.selectedDate);
  const dayRefresh = useAppSelector((s) => s.ui.dayRefresh);
  const [tasks, setTasks] = useState<DayTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editing, setEditing] = useState<DayTask | null>(null);
  const [form, setForm] = useState({
    title: "",
    date: selectedDate,
    start: "",
    end: "",
    minutes: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [moving, setMoving] = useState<DayTask | null>(null);
  const [moveDate, setMoveDate] = useState(getTodayString());
  const [movingBusy, setMovingBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  // 3.4 — sürükle-bırak: görevi başka bir saat dilimine bırak.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 4000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await routineApi.dayFull(selectedDate, token);
      setTasks(res.tasks ?? []);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, token]);

  useEffect(() => {
    void load();
  }, [load, dayRefresh]);

  const scheduled = tasks
    .filter((t) => t.startTime)
    .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
  const todos = tasks
    .filter((t) => !t.startTime)
    // Tamamlananlar en altta; açık görevler öncelik sırasına göre.
    .sort((a, b) => {
      const doneA = a.status === "completed" ? 1 : 0;
      const doneB = b.status === "completed" ? 1 : 0;
      if (doneA !== doneB) return doneA - doneB;
      const pa = PRIORITY_ORDER[(a.priority as TaskPriority) ?? "medium"] ?? 2;
      const pb = PRIORITY_ORDER[(b.priority as TaskPriority) ?? "medium"] ?? 2;
      return pa - pb;
    });

  const toggle = async (task: DayTask) => {
    if (!token || task.virtual) return;
    setBusy(task.id);
    try {
      await routineApi.taskUpdate(
        selectedDate,
        task.id,
        { status: task.status === "completed" ? "pending" : "completed" },
        token,
      );
      await load();
      dispatch(bumpDayRefresh());
    } finally {
      setBusy(null);
    }
  };

  const remove = async (task: DayTask) => {
    if (!token || task.virtual) return;
    setBusy(task.id);
    try {
      await routineApi.taskDelete(selectedDate, task.id, token);
      setConfirmId(null);
      await load();
      dispatch(bumpDayRefresh());
    } finally {
      setBusy(null);
    }
  };

  const duplicate = async (task: DayTask) => {
    if (!token || task.virtual) return;
    setBusy(task.id);
    try {
      await routineApi.taskDuplicate(selectedDate, task.id, token);
      setFlash(`“${task.title}” kopyalandı (yapılacak olarak eklendi).`);
      await load();
      dispatch(bumpDayRefresh());
    } finally {
      setBusy(null);
    }
  };

  const materialize = async (task: DayTask) => {
    if (!token) return;
    setBusy(task.id);
    try {
      await routineApi.appendTask(
        selectedDate,
        {
          title: task.title,
          color: task.color || getRandomColor(),
          status: "pending",
          priority: "medium",
          category: "work",
          ...(task.startTime && task.endTime
            ? {
                startTime: task.startTime,
                endTime: task.endTime,
                originalDuration: task.endTime - task.startTime,
              }
            : { estimatedMinutes: task.estimatedMinutes ?? 30 }),
          repeat: undefined,
          pausedDuration: 0,
          flowExtensions: 0,
          progress: 0,
          delayCount: 0,
          createdAtClient: Date.now(),
          subtasks: [],
        },
        token,
      );
      await load();
      dispatch(bumpDayRefresh());
    } finally {
      setBusy(null);
    }
  };

  const moveToTime = async (taskId: string, targetStart: number) => {
    if (!token) return;
    const dragged = tasks.find((t) => t.id === taskId);
    if (!dragged || dragged.virtual) return;
    const duration =
      dragged.startTime && dragged.endTime
        ? dragged.endTime - dragged.startTime
        : (dragged.estimatedMinutes ?? 30) * 60_000;
    const startTime = targetStart;
    const endTime = startTime + duration;
    if (dragged.startTime === startTime) return;

    // Çakışma engellenmez, uyarılır: kullanıcı kararı kendisi verir.
    const clash = tasks.find(
      (t) =>
        t.id !== dragged.id &&
        t.startTime &&
        t.endTime &&
        t.status !== "completed" &&
        t.status !== "skipped" &&
        startTime < t.endTime &&
        t.startTime < endTime,
    );

    setBusy(dragged.id);
    try {
      await routineApi.taskUpdate(
        selectedDate,
        dragged.id,
        { startTime, endTime, estimatedMinutes: null },
        token,
      );
      setFlash(
        clash
          ? `“${dragged.title}” ${hhmm(startTime)} saatine taşındı; “${clash.title}” ile çakışıyor.`
          : `“${dragged.title}” ${hhmm(startTime)} saatine taşındı.`,
      );
      await load();
      dispatch(bumpDayRefresh());
    } finally {
      setBusy(null);
    }
  };

  const openEdit = (task: DayTask) => {
    setEditing(task);
    setForm({
      title: task.title,
      date: selectedDate,
      start: hhmm(task.startTime),
      end: hhmm(task.endTime),
      minutes: task.estimatedMinutes ? String(task.estimatedMinutes) : "",
    });
  };

  const tomorrowKey = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const openMove = (task: DayTask) => {
    setMoving(task);
    setMoveDate(getTodayString());
  };

  const confirmMove = async () => {
    if (!token || !moving) return;
    if (moveDate === selectedDate) {
      setMoving(null);
      return;
    }
    setMovingBusy(true);
    try {
      await routineApi.taskUpdate(
        selectedDate,
        moving.id,
        { date: moveDate },
        token,
      );

      const label = new Date(`${moveDate}T12:00:00`).toLocaleDateString(
        "tr-TR",
        { day: "numeric", month: "long" },
      );
      setFlash(
        moveDate === getTodayString()
          ? `“${moving.title}” bugünün planına taşındı.`
          : `“${moving.title}” ${label} gününe taşındı.`,
      );

      if (moveDate === getTodayString()) {
        dispatch(loadTodayRoutine(token));
      }

      setMoving(null);
      await load();
      dispatch(bumpDayRefresh());
    } finally {
      setMovingBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!token || !editing || !form.title.trim()) return;
    setSavingEdit(true);
    try {
      let start: number | null = null;
      let end: number | null = null;
      if (form.start) {
        start = timeToTimestamp(form.start, form.date);
        end = form.end ? timeToTimestamp(form.end, form.date) : null;
        if (end !== null && end <= start) {
          end = start + (Number(form.minutes) || 30) * 60_000;
        }
        if (end === null) end = start + (Number(form.minutes) || 30) * 60_000;
      }

      await routineApi.taskUpdate(
        selectedDate,
        editing.id,
        {
          title: form.title.trim(),
          startTime: start,
          endTime: end,
          estimatedMinutes: start
            ? null
            : Number(form.minutes) > 0
              ? Number(form.minutes)
              : 30,
          date: form.date,
        },
        token,
      );

      const movedTo = form.date !== selectedDate ? form.date : null;

      setEditing(null);

      if (movedTo) {
        const label = new Date(`${movedTo}T12:00:00`).toLocaleDateString("tr-TR", {
          day: "numeric",
          month: "long",
        });
        setFlash(
          movedTo === getTodayString()
            ? `“${form.title.trim()}” bugünün planına taşındı.`
            : `“${form.title.trim()}” ${label} gününe taşındı.`,
        );
        // Bugüne taşındıysa bugünün planı da hemen tazelensin.
        if (movedTo === getTodayString() && token) {
          dispatch(loadTodayRoutine(token));
        }
      }

      await load();
      dispatch(bumpDayRefresh());
    } finally {
      setSavingEdit(false);
    }
  };

  const rows = (list: DayTask[]) =>
    list.map((task) => {
      const done = task.status === "completed";
      const confirming = confirmId === task.id;
      return (
        <div
          key={task.id}
          draggable={!task.virtual}
          onDragStart={(e) => {
            if (task.virtual) return;
            e.dataTransfer.setData("text/plain", task.id);
            e.dataTransfer.effectAllowed = "move";
            setDraggingId(task.id);
          }}
          onDragEnd={() => {
            setDraggingId(null);
            setDragOverId(null);
          }}
          onDragOver={(e) => {
            if (!draggingId || !task.startTime) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setDragOverId(task.id);
          }}
          onDragLeave={() =>
            setDragOverId((id) => (id === task.id ? null : id))
          }
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/plain") || draggingId;
            setDragOverId(null);
            setDraggingId(null);
            if (id && task.startTime) void moveToTime(id, task.startTime);
          }}
          className={`group flex items-center gap-2 rounded-lg bg-background/60 px-2 py-1.5 ${
            task.startTime && !task.virtual ? "cursor-grab active:cursor-grabbing" : ""
          } ${draggingId === task.id ? "opacity-40" : ""} ${
            dragOverId === task.id
              ? "ring-1 ring-primary bg-primary/10"
              : ""
          }`}
        >
          <button
            onClick={() => toggle(task)}
            disabled={task.virtual || busy === task.id}
            className={`shrink-0 ${done ? "text-success" : "text-text-muted hover:text-text"} disabled:opacity-40`}
            title={done ? "Geri al" : "Tamamlandı"}
          >
            {busy === task.id ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <CheckCircle2 size={16} />
            )}
          </button>
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: task.color }}
          />
          <span
            className={`text-[11px] flex-1 min-w-0 truncate ${done ? "line-through text-text-muted" : "text-text"}`}
            title={task.title}
          >
            {task.title}
          </span>
          {task.repeat && (
            <span className="flex items-center gap-0.5 text-[9px] px-1 rounded bg-primary/15 text-primary shrink-0">
              <Repeat size={8} />
              {task.repeat === "daily" ? "günlük" : task.repeat}
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
          {task.virtual ? (
            <button
              onClick={() => materialize(task)}
              disabled={busy === task.id}
              className="shrink-0 p-1 rounded-md text-primary hover:bg-primary/15 transition-colors"
              title="Bu güne ekle"
            >
              <Plus size={12} />
            </button>
          ) : (
            <>
            <button
              onClick={() => duplicate(task)}
              disabled={busy === task.id}
              className="shrink-0 p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors disabled:opacity-40"
              title="Kopyala (yapılacak olarak eklenir)"
            >
              <Copy size={12} />
            </button>
            <button
              onClick={() => openMove(task)}
              className="shrink-0 p-1 rounded-md text-primary/80 hover:text-primary hover:bg-primary/10 transition-colors"
              title="Başka güne taşı"
            >
              <CalendarClock size={12} />
            </button>
            <button
              onClick={() => (confirming ? remove(task) : setConfirmId(task.id))}
              onBlur={() => setConfirmId(null)}
              className={`shrink-0 p-1 rounded-md transition-colors ${
                confirming
                  ? "bg-danger/20 text-danger"
                  : "text-text-muted hover:text-danger hover:bg-danger/10"
              }`}
              title={confirming ? "Silmek için tekrar dokun" : "Sil"}
            >
              <Trash2 size={12} />
            </button>
            </>
          )}
        </div>
      );
    });

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2 mb-2">
        <CalendarClock size={14} className="text-primary shrink-0" />
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
          Seçili günün planı
        </h3>
        <span className="ml-auto text-[10px] text-text-muted">
          {loading ? "…" : `${tasks.length} görev`}
        </span>
      </div>
      <p className="text-sm font-semibold text-text mb-2.5">{heading(selectedDate)}</p>

      {flash && (
        <p className="text-[11px] text-primary bg-primary/10 border border-primary/25 rounded-lg px-2 py-1.5 mb-2">
          {flash}
        </p>
      )}

      {loading ? (
        <div className="py-6 flex justify-center">
          <Loader2 size={16} className="animate-spin text-text-muted" />
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-[11px] text-text-muted py-3">
          Bu gün için plan yok. Sağ alttaki + ile görev ekleyebilirsin.
        </p>
      ) : (
        <div className="space-y-3">
          {scheduled.length > 0 && (
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1">
                Planlanan görevler
                <span className="ml-1 normal-case tracking-normal text-text-muted/70">
                  — sürükleyip başka saate bırak
                </span>
              </p>
              <div className="space-y-1">{rows(scheduled)}</div>
            </div>
          )}
          {todos.length > 0 && (
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1">
                Yapılacaklar
              </p>
              <div className="space-y-1">{rows(todos)}</div>
            </div>
          )}
        </div>
      )}

      {editing && (
        <Dialog open onOpenChange={() => setEditing(null)}>
          <DialogContent className="bg-surface border-border sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-text">Görevi düzenle</DialogTitle>
            </DialogHeader>

            <div className="space-y-2.5">
              <div>
                <label className="text-[11px] text-text-muted block mb-1">
                  Başlık
                </label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-text focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-[11px] text-text-muted block mb-1 flex items-center justify-between">
                  <span>Gün</span>
                  <button
                    onClick={() => setForm((f) => ({ ...f, date: getTodayString() }))}
                    className="text-[10px] text-primary hover:underline"
                  >
                    Bugüne taşı
                  </button>
                </label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, date: e.target.value || f.date }))
                  }
                  className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-text focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-text-muted block mb-1">
                    Başlangıç
                  </label>
                  <input
                    type="time"
                    value={form.start}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, start: e.target.value }))
                    }
                    className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-text focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-text-muted block mb-1">
                    Bitiş
                  </label>
                  <input
                    type="time"
                    value={form.end}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, end: e.target.value }))
                    }
                    className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-text focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {!form.start && (
                <div>
                  <label className="text-[11px] text-text-muted block mb-1">
                    Tahmini süre (dk)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.minutes}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, minutes: e.target.value }))
                    }
                    placeholder="30"
                    className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-text focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  onClick={saveEdit}
                  disabled={savingEdit || !form.title.trim()}
                  className="flex-1 bg-primary text-white hover:bg-primary/90 gap-1.5"
                >
                  {savingEdit ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Save size={13} />
                  )}
                  Kaydet
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setEditing(null)}
                  className="border-border text-text text-xs"
                >
                  Vazgeç
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {moving && (
        <Dialog open onOpenChange={() => setMoving(null)}>
          <DialogContent className="bg-surface border-border sm:max-w-xs">
            <DialogHeader>
              <DialogTitle className="text-text text-sm">
                Başka güne taşı
              </DialogTitle>
            </DialogHeader>

            <p className="text-xs text-text-muted -mt-1">
              “{moving.title}”
            </p>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setMoveDate(getTodayString())}
                className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  moveDate === getTodayString()
                    ? "bg-primary text-white"
                    : "bg-background border border-border text-text-muted hover:text-text"
                }`}
              >
                Bugüne taşı
              </button>
              <button
                onClick={() => setMoveDate(tomorrowKey())}
                className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  moveDate === tomorrowKey()
                    ? "bg-primary text-white"
                    : "bg-background border border-border text-text-muted hover:text-text"
                }`}
              >
                Yarına taşı
              </button>
            </div>

            <div>
              <label className="text-[11px] text-text-muted block mb-1">
                ya da başka bir gün
              </label>
              <input
                type="date"
                value={moveDate}
                onChange={(e) =>
                  setMoveDate(e.target.value || getTodayString())
                }
                className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs text-text focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={confirmMove}
                disabled={movingBusy || moveDate === selectedDate}
                className="flex-1 bg-primary text-white hover:bg-primary/90"
              >
                {movingBusy ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  "Taşı"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const task = moving;
                  setMoving(null);
                  if (task) openEdit(task);
                }}
                className="border-border text-text-muted text-[11px]"
              >
                Başlık / saat düzenle
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
