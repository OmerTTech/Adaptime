import { useState } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { updateTask } from "@/store/slices/routineSlice";
import { closeEditModal } from "@/store/slices/uiSlice";
import { getTodayString, timeToTimestamp, timestampToTime } from "@/utils";
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

export default function EditTaskModal() {
  const dispatch = useAppDispatch();
  const taskId = useAppSelector((s) => s.ui.editTaskId);
  const task = useAppSelector((s) =>
    s.routine.currentRoutine?.tasks.find((t) => t.id === taskId),
  );

  const [title, setTitle] = useState(task?.title ?? "");
  const [startTime, setStartTime] = useState(
    task ? timestampToTime(task.startTime) : "",
  );
  const [endTime, setEndTime] = useState(
    task ? timestampToTime(task.endTime) : "",
  );
  const [selectedColor, setSelectedColor] = useState(task?.color ?? "");
  const today = getTodayString();

  if (!task) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !startTime || !endTime) return;

    let start = timeToTimestamp(startTime, today);
    let end = timeToTimestamp(endTime, today);

    if (end <= start) {
      end = timeToTimestamp(endTime, getTodayString(1));
    }

    if (end <= start) return;

    dispatch(
      updateTask({
        id: task.id,
        updates: {
          title,
          startTime: start,
          endTime: end,
          color: selectedColor,
        },
      }),
    );

    dispatch(closeEditModal());
  };

  return (
    <Dialog open onOpenChange={() => dispatch(closeEditModal())}>
      <DialogContent className="bg-surface border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-text">Görevi Düzenle</DialogTitle>
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
