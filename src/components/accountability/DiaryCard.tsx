import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { loadDiaryEntries } from "@/store/slices/diarySlice";
import { setActivePage } from "@/store/slices/uiSlice";
import { getTodayString } from "@/utils";
import { BookOpen, PenLine, ChevronRight } from "lucide-react";

export default function DiaryCard() {
  const { token } = useAuth();
  const dispatch = useAppDispatch();
  const entries = useAppSelector((s) => s.diary.entries);
  const today = getTodayString();
  const entry = entries.find((e) => e.dateKey === today);

  useEffect(() => {
    if (token && entries.length === 0) dispatch(loadDiaryEntries(token));
  }, [token, entries.length, dispatch]);

  return (
    <button
      onClick={() => dispatch(setActivePage("diary"))}
      className="w-full text-left p-3 rounded-xl bg-surface border border-border hover:border-border/70 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen size={14} className="text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-text">Günlük</p>
            <p className="text-[10px] text-text-muted truncate">
              {entry
                ? `${entry.mood}/5 ruh hali · ${entry.highlights || entry.progress || "not var"}`
                : "Bugün neler yaşadın? Gelişimini yaz."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-primary shrink-0">
          {entry ? "Aç" : <><PenLine size={11} /> Yaz</>}
          <ChevronRight size={12} />
        </div>
      </div>
    </button>
  );
}
