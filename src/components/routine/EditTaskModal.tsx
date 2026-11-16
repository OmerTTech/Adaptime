import { useState } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import {
  updateTask,
  scheduleTask,
  unscheduleTask,
  moveTaskAsSubtask,
  addSubtasks,
} from "@/store/slices/routineSlice";
import AiSubtaskSplitter from "@/components/routine/AiSubtaskSplitter";
import { closeEditModal } from "@/store/slices/uiSlice";
import { suggestionFor } from "@/engine/estimates";
import {
  getTodayString,
  timeToTimestamp,
  timestampToTime,
  timestampToDateTimeLocal,
} from "@/utils";
import {
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  REPEAT_LABEL,
  WEEKDAY_LABEL,
  isScheduled,
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
import { Clock, CornerDownRight, Trash2 } from "lucide-react";

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

export default function EditTaskModal() {
  const dispatch = useAppDispatch();
  const taskId = useAppSelector((s) => s.ui.editTaskId);
  const task = useAppSelector((s) =>
    s.routine.currentRoutine?.tasks.find((t) => t.id === taskId),
  );
  const allTasks = useAppSelector(
    (s) => s.routine.currentRoutine?.tasks ?? [],
  );
  const history = useAppSelector((s) => s.routine.history);

  const [title, setTitle] = useState(task?.title ?? "");
  const [startTime, setStartTime] = useState(
    task && isScheduled(task) ? timestampToTime(task.startTime!) : "",
  );
  const [endTime, setEndTime] = useState(
    task && isScheduled(task) ? timestampToTime(task.endTime!) : "",
  );
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    task?.estimatedMinutes ? String(task.estimatedMinutes) : "",
  );
  const [selectedColor, setSelectedColor] = useState(task?.color ?? "");
  const [priority, setPriority] = useState<TaskPriority>(
    task?.priority ?? "medium",
  );
  const [category, setCategory] = useState<TaskCategory>(
    task?.category ?? "work",
  );
  const [deadline, setDeadline] = useState(
    task?.deadline ? timestampToDateTimeLocal(task.deadline) : "",
  );
  const [description, setDescription] = useState(task?.description ?? "");
  const [parentId, setParentId] = useState("");
  const [asSubtask, setAsSubtask] = useState(false);
  const [parallel, setParallel] = useState(task?.parallel ?? false);
  const estimateHint = suggestionFor(
    category,
    Math.max(5, Number(estimatedMinutes) || 30),
    history,
  );
  const [repeat, setRepeat] = useState<RepeatFrequency | "">(
    task?.repeat ?? "",
  );
  const [repeatDays, setRepeatDays] = useState<number[]>(
    task?.repeatDays ?? [],
  );
  const today = getTodayString();

  if (!task) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const deadlineTs = deadline ? new Date(deadline).getTime() : undefined;
    const meta = {
      title,
      color: selectedColor,
      priority,
      category,
      parallel,
      repeat: repeat || undefined,
      repeatDays: repeat === "custom" ? repeatDays : undefined,
      description: description.trim() || undefined,
      deadline:
        deadlineTs && Number.isFinite(deadlineTs) ? deadlineTs : undefined,
    };

    const est = estimatedMinutes
      ? Math.max(1, Number(estimatedMinutes))
      : undefined;

    if (startTime && endTime) {
      let start = timeToTimestamp(startTime, today);
      let end = timeToTimestamp(endTime, today);
      if (end <= start) {
        end = timeToTimestamp(endTime, getTodayString(1));
      }
      if (end > start) {
        dispatch(
          scheduleTask({ id: task.id, startTime: start, endTime: end }),
        );
        dispatch(updateTask({ id: task.id, updates: { ...meta, estimatedMinutes: est } }));
      }
    } else if (!startTime && !endTime && isScheduled(task)) {
      // "Planı kaldır" seçildi: saatler gerçekten silinir, görev yapılacaklara döner.
      dispatch(unscheduleTask({ id: task.id, estimatedMinutes: est }));
      dispatch(updateTask({ id: task.id, updates: meta }));
    } else {
      // Saatsiz görev: süre zorunlu değil, tahmini dakika opsiyonel.
      dispatch(
        updateTask({
          id: task.id,
          updates: { ...meta, estimatedMinutes: est },
        }),
      );
    }

    dispatch(closeEditModal());
  };

  const handleClearTime = () => {
    setStartTime("");
    setEndTime("");
  };

  const handleMoveAsSubtask = () => {
    if (!parentId) return;
    dispatch(moveTaskAsSubtask({ id: task.id, parentId }));
    dispatch(closeEditModal());
  };

  return (
    <Dialog open onOpenChange={() => dispatch(closeEditModal())}>
      <DialogContent className="bg-surface border-border sm:max-w-md max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-text">
            {isScheduled(task) ? "Görevi Düzenle" : "Yapılacak — Görevi Düzenle"}
          </DialogTitle>
        </DialogHeader>

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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted mb-1 block">
                Başlangıç
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
                Bitiş
              </label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="bg-background border-border text-text"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            {startTime && endTime ? (
              <button
                type="button"
                onClick={handleClearTime}
                className="text-xs text-danger flex items-center gap-1 hover:underline"
              >
                <Trash2 size={12} />
                Planı Kaldır
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const next = new Date();
                  const start = new Date();
                  start.setSeconds(0, 0);
                  start.setMinutes(next.getMinutes() + 15);
                  setStartTime(timestampToTime(start.getTime()));
                  setEndTime(timestampToTime(start.getTime() + 3600000));
                }}
                className="text-xs text-primary flex items-center gap-1 hover:underline"
              >
                <Clock size={12} />
                Şimdi Zaman Ver
              </button>
            )}
            <div className="w-32">
              <Input
                type="number"
                min={1}
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value)}
                placeholder="Tahmini dk"
                className="bg-background border-border text-text text-xs"
              />
            </div>
          </div>

          {estimateHint && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-primary/[0.07] border border-primary/25 text-[11px] text-text-muted">
              <span className="shrink-0">💡</span>
              <span className="flex-1">
                Geçmişte {CATEGORY_LABEL[category]} işlerinde süren tahminin{" "}
                <strong className="text-text">
                  {estimateHint.ratio.toFixed(1)}×
                </strong>{" "}
                çıkıyor ({estimateHint.samples} görev). Öneri:{" "}
                {estimateHint.suggestedMinutes} dk
              </span>
              <button
                type="button"
                onClick={() =>
                  setEstimatedMinutes(String(estimateHint.suggestedMinutes))
                }
                className="shrink-0 text-primary font-medium hover:underline"
              >
                Uygula
              </button>
            </div>
          )}

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
            existing={(task.subtasks ?? []).map((s) => s.title)}
            onAdd={(titles) =>
              dispatch(addSubtasks({ id: task.id, titles }))
            }
          />

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
                className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none py-1 text-right"
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
                {allTasks
                  .filter((t) => t.id !== task.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
              <Button
                type="button"
                size="sm"
                disabled={!asSubtask || !parentId}
                onClick={handleMoveAsSubtask}
                className="shrink-0 bg-primary hover:bg-primary-hover text-white disabled:opacity-40 text-xs px-3 h-auto"
              >
                Taşı
              </Button>
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
                {WEEKDAY_LABEL.map((label, index) => {
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

          <div>
            <label className="text-xs text-text-muted mb-2 block">Renk</label>
            <div className="flex gap-2 flex-wrap">
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
              onClick={() => dispatch(closeEditModal())}
              className="flex-1 border-border text-text"
            >
              İptal
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-primary hover:bg-primary-hover text-white"
            >
              Kaydet
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}