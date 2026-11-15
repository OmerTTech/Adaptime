import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAppDispatch } from "@/store/hooks";
import { loadTodayRoutine } from "@/store/slices/routineSlice";
import { routineApi } from "@/services/api";
import {
  ArrowRight,
  Loader2,
  Repeat,
  SkipForward,
  Trash2,
} from "lucide-react";

interface MissedRepeat {
  date: string;
  taskId: string;
  title: string;
  color: string;
  repeat: string;
  startTime: number | null;
  endTime: number | null;
  originalDuration: number | null;
}

const REPEAT_TEXT: Record<string, string> = {
  hourly: "saatlik",
  daily: "günlük",
  weekly: "haftalık",
  monthly: "aylık",
  custom: "seçili günler",
};

function daysAgoLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - target) / 86_400_000);
  if (diff <= 0) return "bugün";
  if (diff === 1) return "dün";
  return `${diff} gün önce`;
}

/**
 * Son 3 günde tamamlanmayan tekrarlayan görevler.
 * Kullanıcı taşır, atlar veya siler; seçim sunucuda kalıcıdır.
 */
export default function MissedRepeats() {
  const { token } = useAuth();
  const dispatch = useAppDispatch();
  const [items, setItems] = useState<MissedRepeat[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    routineApi
      .missedRepeats(token)
      .then((res) => {
        if (alive) setItems(res.missed ?? []);
      })
      .catch(() => {
        /* sessiz: kart görünmez */
      });
    return () => {
      alive = false;
    };
  }, [token]);

  if (items.length === 0) return null;

  const handle = async (
    item: MissedRepeat,
    action: "move" | "skip" | "delete",
  ) => {
    if (!token) return;
    setBusy(item.taskId);
    try {
      await routineApi.handleMissed(item.date, item.taskId, action, token);
      setItems((prev) => prev.filter((i) => i.taskId !== item.taskId));
      if (action === "move") dispatch(loadTodayRoutine(token));
    } catch {
      /* hata olursa kart olduğu gibi kalır */
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-warning/30 bg-warning/[0.06] p-3">
      <div className="flex items-center gap-2 mb-2">
        <Repeat size={13} className="text-warning shrink-0" />
        <h3 className="text-xs font-semibold text-warning uppercase tracking-wide">
          Kaçırılan tekrarlar ({items.length})
        </h3>
        <span className="text-[10px] text-text-muted ml-auto hidden sm:block">
          Bugüne taşı, atla veya sil
        </span>
      </div>

      <div className="space-y-1.5">
        {items.map((item) => (
          <div
            key={`${item.date}-${item.taskId}`}
            className="flex flex-wrap items-center gap-2 rounded-lg bg-surface/70 px-2 py-1.5"
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-text flex-1 min-w-[8rem] truncate" title={item.title}>
              {item.title}
            </span>
            <span className="text-[10px] text-text-muted shrink-0">
              {daysAgoLabel(item.date)} · {REPEAT_TEXT[item.repeat] ?? item.repeat}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => handle(item, "move")}
                disabled={busy === item.taskId}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/15 text-primary text-[11px] font-medium hover:bg-primary/25 transition-colors disabled:opacity-50"
                title="Bugünün planına taşı"
              >
                {busy === item.taskId ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <ArrowRight size={11} />
                )}
                Taşı
              </button>
              <button
                onClick={() => handle(item, "skip")}
                disabled={busy === item.taskId}
                className="p-1.5 rounded-lg bg-surface-hover text-text-muted hover:text-text transition-colors disabled:opacity-50"
                title="Bu seferlik atla"
              >
                <SkipForward size={12} />
              </button>
              <button
                onClick={() => handle(item, "delete")}
                disabled={busy === item.taskId}
                className="p-1.5 rounded-lg bg-danger/10 text-danger hover:bg-danger/20 transition-colors disabled:opacity-50"
                title="Tekrarı sil"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
