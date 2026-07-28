import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { toggleViewMode } from "@/store/slices/uiSlice";
import { Clock, List } from "lucide-react";

export default function ViewToggle() {
  const dispatch = useAppDispatch();
  const viewMode = useAppSelector((state) => state.ui.viewMode);

  return (
    <button
      onClick={() => dispatch(toggleViewMode())}
      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-border hover:border-primary/50 transition-all text-sm"
    >
      {viewMode === "oclock" ? (
        <>
          <List size={16} className="text-primary" />
          <span className="text-text">Timeline</span>
        </>
      ) : (
        <>
          <Clock size={16} className="text-primary" />
          <span className="text-text">Saat</span>
        </>
      )}
    </button>
  );
}
