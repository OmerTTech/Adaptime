import { useState } from "react";
import { useAppDispatch } from "@/store/hooks";
import { addTask } from "@/store/slices/routineSlice";
import { closeAddModal } from "@/store/slices/uiSlice";
import { getTodayString, timeToTimestamp, getRandomColor } from "@/utils";
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
  const [selectedColor, setSelectedColor] = useState(getRandomColor());
  const today = getTodayString();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (mode === "scheduled") {
      if (!startTime || !endTime) return;
      const start = timeToTimestamp(startTime, today);
      let end = timeToTimestamp(endTime, today);
      if (end <= start) {
        end = timeToTimestamp(endTime, getTodayString(1));
      }
      if (end <= start) return;
      dispatch(addTask({ title, startTime: start, endTime: end, color: selectedColor }));
    } else {
      const est = estimatedMinutes
        ? Math.max(1, Number(estimatedMinutes))
        : undefined;
      dispatch(addTask({ title, estimatedMinutes: est, color: selectedColor }));
    }

    setTitle("");
    setStartTime("");
    setEndTime("");
    setEstimatedMinutes("");
    dispatch(closeAddModal());
  };

  return (
    <Dialog open onOpenChange={() => dispatch(closeAddModal())}>
      <DialogContent className="bg-surface border-border sm:max-w-md">
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