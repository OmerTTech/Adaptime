import { useState } from "react";
import { useAppDispatch } from "@/store/hooks";
import { addTask } from "@/store/slices/routineSlice";
import { closeAddModal } from "@/store/slices/uiSlice";
import { getTodayString, timeToTimestamp, getRandomColor } from "@/utils";
import {
  CATEGORY_LABEL,
  PRIORITY_LABEL,
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
import { Clock, Zap } from "lucide-react";

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
  const [mode, setMode] = useState<Mode>("quick");
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [category, setCategory] = useState<TaskCategory>("work");
  const [deadline, setDeadline] = useState("");
  const [description, setDescription] = useState("");
  const [selectedColor, setSelectedColor] = useState(getRandomColor());
  const today = getTodayString();

  const handleSubmit = (e: React.FormEvent) => {
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
    };

    if (mode === "scheduled") {
      if (!startTime || !endTime) return;
      const start = timeToTimestamp(startTime, today);
      let end = timeToTimestamp(endTime, today);
      if (end <= start) {
        end = timeToTimestamp(endTime, getTodayString(1));
      }
      if (end <= start) return;
      dispatch(addTask({ ...common, startTime: start, endTime: end }));
    } else {
      const est = estimatedMinutes
        ? Math.max(1, Number(estimatedMinutes))
        : undefined;
      dispatch(addTask({ ...common, estimatedMinutes: est }));
    }

    setTitle("");
    setStartTime("");
    setEndTime("");
    setEstimatedMinutes("");
    setDeadline("");
    setDescription("");
    setPriority("medium");
    setCategory("work");
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

          {mode === "scheduled" ? (
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
                  required
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
                  required
                />
              </div>
            </div>
          ) : (
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