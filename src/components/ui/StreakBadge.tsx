import { useAppSelector } from "@/store/hooks";
import { Flame } from "lucide-react";

export default function StreakBadge() {
  const streak = useAppSelector(
    (state) => state.routine.currentRoutine?.streak ?? 0,
  );

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border text-xs">
      <Flame size={12} className="text-warning" />
      <span className="text-text font-medium">{streak}</span>
      <span className="text-text-muted">gün seri</span>
    </div>
  );
}
