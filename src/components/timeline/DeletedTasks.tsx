import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { loadTodayRoutine } from "@/store/slices/routineSlice";
import { routineApi } from "@/services/api";
import { ArchiveRestore, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

interface ArchivedItem {
  id: string;
  dateKey: string;
  removedAt: number;
  title: string;
  color: string;
}

/**
 * Son silinen görevler: yanlışlıkla silinen görev geri yüklenebilir.
 * Takvimin hemen altında, görev listelerinin yanında durur.
 */
export default function DeletedTasks() {
  const { token } = useAuth();
  const dispatch = useAppDispatch();
  const [archived, setArchived] = useState<ArchivedItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const taskCount = useAppSelector(
    (s) => s.routine.currentRoutine?.tasks.length ?? 0,
  );

  // Görev eklenip silindikçe arşivi tazele (kayıt 1.5 sn debounce'lı).
  useEffect(() => {
    if (!token) return;
    let alive = true;
    const timer = setTimeout(() => {
      routineApi
        .archive(token, 15)
        .then((res) => {
          if (alive) setArchived(res.items ?? []);
        })
        .catch(() => {
          /* sessiz */
        });
    }, 2400);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [token, taskCount]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    routineApi
      .archive(token, 15)
      .then((res) => {
        if (alive) setArchived(res.items ?? []);
      })
      .catch(() => {
        /* sessiz */
      });
    return () => {
      alive = false;
    };
  }, [token]);

  const restore = async (item: ArchivedItem) => {
    if (!token) return;
    setBusy(item.id);
    try {
      await routineApi.restoreArchived(item.id, token);
      setArchived((prev) => prev.filter((i) => i.id !== item.id));
      await dispatch(loadTodayRoutine(token));
    } finally {
      setBusy(null);
    }
  };

  if (archived.length === 0) return null;

  return (
    <div className="w-full max-w-2xl mx-auto mt-2 rounded-xl border border-border bg-surface p-3">
      <button
        onClick={() => setShowArchive((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-text transition-colors"
      >
        <ArchiveRestore size={12} />
        Son silinen görevler ({archived.length})
        {showArchive ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {showArchive && (
        <div className="mt-1.5 space-y-1">
          {archived.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-lg bg-background/60 px-2 py-1.5"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0 opacity-70"
                style={{ backgroundColor: item.color }}
              />
              <span
                className="text-xs text-text-muted flex-1 min-w-0 truncate"
                title={item.title}
              >
                {item.title}
              </span>
              <span className="text-[10px] text-text-muted/70 shrink-0">
                {item.dateKey}
              </span>
              <button
                onClick={() => restore(item)}
                disabled={busy !== null}
                className="shrink-0 px-2 py-1 rounded-lg bg-primary/15 text-primary text-[11px] font-medium hover:bg-primary/25 transition-colors disabled:opacity-50"
              >
                {busy === item.id ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  "Geri yükle"
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
