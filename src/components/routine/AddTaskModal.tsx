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

export default function AddTaskModal() {
  const dispatch = useAppDispatch();
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [selectedColor, setSelectedColor] = useState(getRandomColor());
  const today = getTodayString();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startTime || !endTime) return;

    const start = timeToTimestamp(startTime, today);
    const end = timeToTimestamp(endTime, today);

    if (end <= start) return;

    dispatch(
      addTask({
        title,
        startTime: start,
        endTime: end,
        color: selectedColor,
      }),
    );

    setTitle("");
    setStartTime("");
    setEndTime("");
    dispatch(closeAddModal());
  };

  return (
    <Dialog open onOpenChange={() => dispatch(closeAddModal())}>
      <DialogContent className="bg-surface border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-text">Yeni Görev Ekle</DialogTitle>
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
