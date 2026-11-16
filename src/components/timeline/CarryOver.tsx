import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { loadTodayRoutine } from "@/store/slices/routineSlice";
import { routineApi } from "@/services/api";
import { ArrowRight, ChevronDown, ChevronUp, History, Loader2 } from "lucide-react";

interface UnfinishedItem {
  date: string;
  taskId: string;
  title: string;
  color: string;
  status: string;
  startTime: number | null;
  estimatedMinutes: number | null;
  subtaskCount: number;
}

const VISIBLE_LIMIT = 5;

export default function CarryOver() {
  const { token } = useAuth();
  const dispatch = useAppDispatch();
  const [items, setItems] = useState<UnfinishedItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(VISIBLE_LIMIT);
  const progressive = useAppSelector((s) => s.ui.progressiveLists);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    routineApi
      .unfinished(token)
      .catch(() => ({ date: "", tasks: [] }))
      .then((unfinished) => {
        if (alive) setItems(unfinished.tasks ?? []);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const refreshToday = () => dispatch(loadTodayRoutine(token!));

  const moveOne = async (item: UnfinishedItem) => {
    if (!token) return;
    setBusy(item.taskId);
    try {
      await routineApi.handleMissed(item.date, item.taskId, "move", token);
      setItems((prev) => prev.filter((i) => i.taskId !== item.taskId));
      await refreshToday();
    } finally {
      setBusy(null);
    }
  };

  const moveAll = async () => {
    if (!token || items.length === 0) return;
    setBusy("all");
    try {
      await routineApi.carryAll(items[0].date, "move", token);
      setItems([]);
      await refreshToday();
    } finally {
      setBusy(null);
    }
  };

  if (items.length === 0) return null;

  const visible = progressive ? items.slice(0, visibleCount) : items;

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      {items.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <History size={13} className="text-primary shrink-0" />
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
              Dünden devam edenler ({items.length})
            </h3>
            <button
              onClick={moveAll}
              disabled={busy !== null}
              className="ml-auto shrink-0 whitespace-nowrap flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/15 text-primary text-[11px] font-medium hover:bg-primary/25 transition-colors disabled:opacity-50"
              title="Dünün tamamlanmamış tüm görevlerini bugünün planına taşı"
            >
              {busy === "all" ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <ArrowRight size={11} />
              )}
              Tümünü taşı
            </button>
          </div>

          <div className="space-y-1">
            {visible.map((item) => (
              <div
                key={item.taskId}
                className="flex items-center gap-2 rounded-lg bg-background/60 px-2 py-1.5"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span
                  className="text-xs text-text flex-1 min-w-0 truncate"
                  title={item.title}
                >
                  {item.title}
                </span>
                {item.subtaskCount > 0 && (
                  <span className="text-[10px] text-text-muted shrink-0">
                    {item.subtaskCount} alt görev
                  </span>
                )}
                <span className="text-[10px] text-text-muted shrink-0 tabular-nums">
                  {item.startTime
                    ? new Date(item.startTime).toLocaleTimeString("tr-TR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : item.estimatedMinutes
                      ? `~${item.estimatedMinutes} dk`
                      : "saatsiz"}
                </span>
                <button
                  onClick={() => moveOne(item)}
                  disabled={busy !== null}
                  className="shrink-0 px-2 py-1 rounded-lg bg-surface-hover text-text-muted hover:text-text text-[11px] transition-colors disabled:opacity-50"
                  title="Bugünün planına taşı"
                >
                  {busy === item.taskId ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    "Taşı"
                  )}
                </button>
              </div>
            ))}
          </div>

          {progressive && items.length > visibleCount && (
            <button
              onClick={() => setVisibleCount((v) => v + 5)}
              className="mt-1.5 flex items-center gap-1 text-[11px] text-primary hover:underline transition-colors"
            >
              <ChevronDown size={12} />
              +{Math.min(5, items.length - visibleCount)} görev daha
              {items.length - visibleCount > 5
                ? ` (${items.length - visibleCount} kaldı)`
                : ""}
            </button>
          )}
          {progressive && items.length <= visibleCount && visibleCount > VISIBLE_LIMIT && (
            <button
              onClick={() => setVisibleCount(VISIBLE_LIMIT)}
              className="mt-1.5 flex items-center gap-1 text-[11px] text-text-muted hover:text-text transition-colors"
            >
              <ChevronUp size={12} />
              Daha az göster
            </button>
          )}
        </>
      )}

    </div>
  );
}
