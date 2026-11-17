import { useState } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { addTask } from "@/store/slices/routineSlice";
import { bumpDayRefresh, closeAddModal } from "@/store/slices/uiSlice";
import { useAuth } from "@/contexts/AuthContext";
import { routineApi } from "@/services/api";
import { getTodayString, timeToTimestamp, getRandomColor } from "@/utils";
import {
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  REPEAT_LABEL,
  WEEKDAY_LABEL,
  WEEKDAY_ORDER,
  type RepeatFrequency,
  type TaskCategory,
  type TaskPriority,
} from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import AiSubtaskSplitter from "@/components/routine/AiSubtaskSplitter";
import { CalendarDays, Clock, CornerDownRight, Zap } from "lucide-react";

const PRESET_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
  "#98D8C8",
  "#F7DC6F",
];

type Mode = "quick" | "scheduled";

export default function AddTaskModal() {
  const dispatch = useAppDispatch();
  const { token } = useAuth();
  const allTasks = useAppSelector(
    (s) => s.routine.currentRoutine?.tasks ?? [],
  );
  const selectedDate = useAppSelector((s) => s.ui.selectedDate);
  const [mode, setMode] = useState<Mode>("quick");
  const [date, setDate] = useState(selectedDate);
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [category, setCategory] = useState<TaskCategory>("work");
  const [deadline, setDeadline] = useState("");
  const [description, setDescription] = useState("");
  const [subtaskTitles, setSubtaskTitles] = useState<string[]>([]);
  const [selectedColor, setSelectedColor] = useState(getRandomColor());
  const [asSubtask, setAsSubtask] = useState(false);
  const [parentId, setParentId] = useState("");
  const [parallel, setParallel] = useState(false);
  const [repeat, setRepeat] = useState<RepeatFrequency | "">("");
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const today = getTodayString();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const deadlineTs = deadline ? new Date(deadline).getTime() : undefined;
    const common = {
      title,
      color: selectedColor,
      priority,
      category,
      ...(deadlineTs && Number.isFinite(deadlineTs) ? { deadline: deadlineTs } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(parallel ? { parallel: true } : {}),
      ...(repeat ? { repeat, repeatDays: repeat === "custom" ? repeatDays : undefined } : {}),
    };
    const est = estimatedMinutes ? Math.max(1, Number(estimatedMinutes)) : 30;
    const isToday = date === today;

    // Bugün dışındaki bir gün seçiliyse doğrudan o günün planına yaz.
    if (!isToday) {
      const base = {
        ...common,
        color: selectedColor,
        status: "pending",
        pausedDuration: 0,
        flowExtensions: 0,
        progress: 0,
        delayCount: 0,
        createdAtClient: Date.now(),
        subtasks: subtaskTitles.map((title) => ({ title, done: false })),
      };

      let payload: Record<string, unknown> = { ...base, estimatedMinutes: est };
      if (mode === "scheduled" && (startTime || endTime)) {
        let start = startTime ? timeToTimestamp(startTime, date) : undefined;
        let end = endTime ? timeToTimestamp(endTime, date) : undefined;
        if (start !== undefined && start < Date.now()) {
          // Geçmiş bir saate plan yapılmasın: süre bilgisiyle saatsiz kalır.
          payload = { ...base, estimatedMinutes: est };
        } else {
          if (start !== undefined && end !== undefined && end <= start) end = undefined;
          if (start !== undefined && end === undefined) end = start + est * 60_000;
          if (start === undefined && end !== undefined) start = end - est * 60_000;
          if (start !== undefined && end !== undefined) {
            payload = {
              ...base,
              startTime: start,
              endTime: end,
              originalDuration: end - start,
            };
          }
        }
      }

      if (token) {
        try {
          await routineApi.appendTask(date, payload, token);
          dispatch(bumpDayRefresh());
        } catch {
          /* sessizce kapatma; kullanıcı tekrar deneyebilir */
          return;
        }
      }

      setTitle("");
      setStartTime("");
      setEndTime("");
      setEstimatedMinutes("");
      setDeadline("");
      setDescription("");
      setSubtaskTitles([]);
      setPriority("medium");
      setCategory("work");
      setParallel(false);
      setRepeat("");
      setRepeatDays([]);
      dispatch(closeAddModal());
      return;
    }

    // Alt görev olarak ekleniyorsa saat/plan bilgisi kullanılmaz.
    if (asSubtask && parentId) {
      dispatch(addTask({ ...common, parentId }));
    } else if (mode === "scheduled" && (startTime || endTime)) {
      // Tek saat de yeter: eksik taraf tahmini süreden hesaplanır.
      let start = startTime ? timeToTimestamp(startTime, today) : undefined;
      let end = endTime ? timeToTimestamp(endTime, today) : undefined;
      if (start !== undefined && end !== undefined) {
        if (end <= start) end = timeToTimestamp(endTime, getTodayString(1));
        if (end <= start) return;
      } else if (start !== undefined) {
        end = start + est * 60_000;
      } else if (end !== undefined) {
        start = end - est * 60_000;
      }
      if (start === undefined || end === undefined) return;
      dispatch(
        addTask({
          ...common,
          startTime: start,
          endTime: end,
          subtasks: subtaskTitles,
        }),
      );
    } else {
      dispatch(
        addTask({ ...common, estimatedMinutes: est, subtasks: subtaskTitles }),
      );
    }

    setTitle("");
    setStartTime("");
    setEndTime("");
    setEstimatedMinutes("");
    setDeadline("");
    setDescription("");
    setSubtaskTitles([]);
    setPriority("medium");
    setCategory("work");
    setAsSubtask(false);
    setParentId("");
    setParallel(false);
    setRepeat("");
    setRepeatDays([]);
    dispatch(closeAddModal());
  };

  return (
    <Dialog open onOpenChange={() => dispatch(closeAddModal())}>
      <DialogContent className="bg-surface border-border sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-text">Yeni Görev Ekle</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-background border border-border">
          <button
            type="button"
            onClick={() => setMode("quick")}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === "quick"
                ? "bg-primary text-white"
                : "text-text-muted hover:text-text"
            }`}
          >
            <Zap size={14} />
            Hızlı Ekle
          </button>
          <button
            type="button"
            onClick={() => setMode("scheduled")}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === "scheduled"
                ? "bg-primary text-white"
                : "text-text-muted hover:text-text"
            }`}
          >
            <Clock size={14} />
            Planlı
          </button>
        </div>

        {mode === "quick" && (
          <p className="text-xs text-text-muted">
            Süre belirlemek zorunda değilsin. Süresiz görevler "Yapılacaklar"
            listesine eklenir, sonradan zaman planlayabilirsin.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-text-muted mb-1 block">
              Görev Adı
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Örn: Kodlama Çalışması"
              className="bg-background border-border text-text"
              required
            />
          </div>

          <div>
            <label className="text-xs text-text-muted mb-1 flex items-center gap-1.5">
              <CalendarDays size={12} />
              Tarih
            </label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || today)}
              className="bg-background border-border text-text"
            />
            {date !== today && (
              <p className="text-[11px] text-primary mt-1">
                Görev bugüne değil, seçtiğin güne eklenecek.
              </p>
            )}
          </div>

          {mode === "scheduled" && (
            <div className="space-y-1.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted mb-1 block">
                    Başlangıç <span className="opacity-60">— opsiyonel</span>
                  </label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="bg-background border-border text-text"
                  />
                </div>
                <div>
                  <label className="text-xs text-text-muted mb-1 block">
                    Bitiş <span className="opacity-60">— opsiyonel</span>
                  </label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="bg-background border-border text-text"
                  />
                </div>
              </div>
              <p className="text-[11px] text-text-muted/80 leading-snug">
                Tek saat yeterli: eksik olan taraf tahmini süreden hesaplanır.
                Hiç saat vermezsen görev saatsiz kalır ve Başlat'a basınca
                otomatik planlanır.
              </p>
            </div>
          )}

          <div>
            <label className="text-xs text-text-muted mb-1 block">
              Tahmini Süre (dk) <span className="opacity-60">— opsiyonel</span>
            </label>
            <Input
              type="number"
              min={1}
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
              placeholder="Örn: 45"
              className="bg-background border-border text-text"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none py-1">
                <input
                  type="checkbox"
                  checked={asSubtask}
                  onChange={(e) => {
                    setAsSubtask(e.target.checked);
                    if (!e.target.checked) setParentId("");
                  }}
                  className="w-4 h-4 rounded accent-primary"
                />
                <CornerDownRight size={12} />
                Alt görev yap
              </label>
              <label
                className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none py-1"
                title="Bu görevi başka bir görevle aynı saatte yapacaksan işaretle; saat çakışması uyarısı çıkmaz."
              >
                <span>Aynı anda yapılabilir</span>
                <input
                  type="checkbox"
                  checked={parallel}
                  onChange={(e) => setParallel(e.target.checked)}
                  className="w-4 h-4 rounded accent-primary"
                />
              </label>
            </div>
            <div className="flex gap-1.5 min-w-0">
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                disabled={!asSubtask}
                className="w-full min-w-0 flex-1 px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-text truncate disabled:opacity-40"
              >
                <option value="">Ana görev seç…</option>
                {allTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-text-muted block">
              Tekrar <span className="opacity-60">— bitirince yeni plan</span>
            </label>
            <select
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as RepeatFrequency | "")}
              className="w-full px-2.5 py-2 rounded-lg bg-background border border-border text-sm text-text"
            >
              <option value="">Tekrar yok</option>
              {(Object.keys(REPEAT_LABEL) as RepeatFrequency[]).map((f) => (
                <option key={f} value={f}>
                  {REPEAT_LABEL[f]}
                </option>
              ))}
            </select>
            {repeat === "custom" && (
              <div className="flex flex-wrap gap-1">
                {WEEKDAY_ORDER.map((index) => {
                  const label = WEEKDAY_LABEL[index];
                  const on = repeatDays.includes(index);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() =>
                        setRepeatDays((prev) =>
                          on
                            ? prev.filter((d) => d !== index)
                            : [...prev, index],
                        )
                      }
                      className={`px-2 py-1 rounded-lg text-[11px] border transition-colors ${
                        on
                          ? "bg-primary text-white border-primary"
                          : "bg-background border-border text-text-muted hover:text-text"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted mb-1 block">
                Öncelik
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-2.5 py-2 rounded-lg bg-background border border-border text-sm text-text"
              >
                {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">
                Kategori
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TaskCategory)}
                className="w-full px-2.5 py-2 rounded-lg bg-background border border-border text-sm text-text"
              >
                {(Object.keys(CATEGORY_LABEL) as TaskCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-text-muted mb-1 block">
              Deadline <span className="opacity-60">— opsiyonel</span>
            </label>
            <Input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="bg-background border-border text-text"
            />
          </div>

          <div>
            <label className="text-xs text-text-muted mb-1 block">
              Açıklama <span className="opacity-60">— opsiyonel</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Görevin kapsamı, notlar..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-text text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <AiSubtaskSplitter
            title={title}
            description={description}
            existing={subtaskTitles}
            onAdd={(titles) =>
              setSubtaskTitles((prev) => [...prev, ...titles])
            }
          />

          {subtaskTitles.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-text-muted">
                Eklenecek alt görevler ({subtaskTitles.length})
              </p>
              {subtaskTitles.map((sub, i) => (
                <div
                  key={`${sub}-${i}`}
                  className="flex items-center gap-2 rounded-lg bg-background border border-border px-2 py-1"
                >
                  <span className="flex-1 min-w-0 text-[11px] text-text truncate">
                    {sub}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSubtaskTitles((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="p-0.5 rounded text-text-muted hover:text-danger"
                    title="Kaldır"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="text-xs text-text-muted mb-2 block">Renk</label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(color)}
                  className={`w-8 h-8 rounded-full transition-all ${
                    selectedColor === color
                      ? "ring-2 ring-white ring-offset-2 ring-offset-surface scale-110"
                      : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
              <label
                className="relative w-8 h-8 rounded-full border-2 border-dashed border-border flex items-center justify-center cursor-pointer overflow-hidden hover:scale-105 transition-transform"
                title="Özel renk seç"
                style={{
                  backgroundColor: PRESET_COLORS.includes(selectedColor)
                    ? "transparent"
                    : selectedColor,
                }}
              >
                <input
                  type="color"
                  value={selectedColor}
                  onChange={(e) => setSelectedColor(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  aria-label="Özel renk"
                />
                <span className="text-[11px] text-text-muted pointer-events-none">
                  +
                </span>
              </label>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => dispatch(closeAddModal())}
              className="flex-1 border-border text-text"
            >
              İptal
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-primary hover:bg-primary-hover text-white"
            >
              Ekle
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}