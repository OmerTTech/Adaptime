import { useAppSelector } from "@/store/hooks";
import { formatTime } from "@/utils";
import { Moon } from "lucide-react";

export default function DayEndTimeBadge() {
  const dayEndTime = useAppSelector(
    (state) => state.routine.currentRoutine?.dayEndTime,
  );
  const tasks = useAppSelector(
    (state) => state.routine.currentRoutine?.tasks ?? [],
  );

  if (tasks.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-border text-xs">
      <Moon size={12} className="text-warning" />
      <span className="text-text-muted">Gün bitişi:</span>
      <span className="text-text font-medium tabular-nums">
        {dayEndTime ? formatTime(dayEndTime) : "--:--"}
      </span>
    </div>
  );
}
