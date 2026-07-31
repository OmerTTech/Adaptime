import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { Flame, RotateCcw } from "lucide-react";
import { resetStreak } from "@/store/slices/routineSlice";

export default function StreakBadge() {
  const dispatch = useAppDispatch();
  const streak = useAppSelector(
    (state) => state.routine.currentRoutine?.streak ?? 0,
  );

  return (
    <div className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border text-xs relative">
      <Flame size={12} className="text-warning" />
      <span className="text-text font-medium">{streak}</span>
      <span className="text-text-muted">seri</span>
      {streak > 0 && (
        <button
          onClick={() => dispatch(resetStreak())}
          className="ml-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-danger/10 text-text-muted hover:text-danger"
          title="Seriyi sıfırla"
        >
          <RotateCcw size={10} />
        </button>
      )}
    </div>
  );
}
