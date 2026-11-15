import { useEffect, useState } from "react";
import { useAppSelector, useAppDispatch } from "@/store/hooks";
import { updateTask } from "@/store/slices/routineSlice";
import { openEditModal } from "@/store/slices/uiSlice";
import { isScheduled, PRIORITY_ORDER, type TaskBlock } from "@/types";
import { formatClock, formatRelative } from "@/utils";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Flame,
  Timer,
} from "lucide-react";

function topPriority(tasks: TaskBlock[]): TaskBlock | null {
  const open = tasks.filter(
    (t) => t.status !== "completed" && t.status !== "skipped",
  );
  if (open.length === 0) return null;
  return [...open].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority ?? "medium"];
    const pb = PRIORITY_ORDER[b.priority ?? "medium"];
    if (pa !== pb) return pa - pb;
    const da = a.deadline ?? a.endTime ?? Number.MAX_SAFE_INTEGER;
    const db = b.deadline ?? b.endTime ?? Number.MAX_SAFE_INTEGER;
    return da - db;
  })[0];
}

export default function TodayOverview() {
  const dispatch = useAppDispatch();
  const tasks = useAppSelector((s) => s.routine.currentRoutine?.tasks ?? []);
  const summary = useAppSelector((s) => s.mentor.summary);
  const nextCheckAt = useAppSelector((s) => s.mentor.nextCheckAt);
  const settings = useAppSelector((s) => s.mentor.settings);
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const next = topPriority(tasks);
  const activeTask = tasks.find((t) => t.status === "active" || t.status === "paused");
  const upcoming = tasks
    .filter((t) => typeof t.deadline === "number" && t.status !== "completed")
    .sort((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0))[0];
  // Çakışma tespiti: aynı anda planlanmış açık görevler.
  const openScheduled = tasks.filter(
    (t) => isScheduled(t) && t.status !== "completed" && t.status !== "skipped",
  );
  const conflicts: { first: TaskBlock; second: TaskBlock }[] = [];
  for (let i = 0; i < openScheduled.length; i += 1) {
    for (let j = i + 1; j < openScheduled.length; j += 1) {
      const a = openScheduled[i];
      const b = openScheduled[j];
      // Kullanıcı iki işi aynı anda yapabiliyor: "birlikte" işaretli çiftler uyarı üretmez.
      if (
        a.parallel ||
        b.parallel
      ) {
        continue;
      }
      if (isScheduled(a) && isScheduled(b) && a.startTime < b.endTime && b.startTime < a.endTime) {
        conflicts.push({ first: a, second: b });
      }
    }
  }

  const planned = summary?.planned ?? tasks.length;
  const completed = summary?.completed ?? tasks.filter((t) => t.status === "completed").length;
  const pct = planned > 0 ? Math.round((completed / planned) * 100) : 0;

  const cards = [
    {
      icon: Flame,
      label: "Bugünün önceliği",
      value: next?.title ?? "Görev yok",
      hint: next
        ? `${next.priority === "critical" ? "Kritik" : next.priority === "high" ? "Yüksek" : "Normal"}${isScheduled(next) ? ` · ${formatClock(next.startTime)}` : ""}`
        : "Yeni görev ekle",
      tone: "text-warning",
    },
    {
      icon: Timer,
      label: "Aktif görev",
      value: activeTask?.title ?? "—",
      hint: activeTask ? (activeTask.status === "paused" ? "Duraklatıldı" : "Devam ediyor") : "Şu an aktif görev yok",
      tone: "text-success",
    },
    {
      icon: CalendarClock,
      label: "Sonraki deadline",
      value: upcoming?.title ?? "—",
      hint: upcoming
        ? `${formatClock(upcoming.deadline!)} · ${formatRelative(upcoming.deadline!)}`
        : "Deadline tanımlı değil",
      tone: "text-primary",
    },
    {
      icon: ArrowRight,
      label: "Sonraki mentor kontrolü",
      value: nextCheckAt ? formatClock(nextCheckAt) : settings?.enabled === false ? "Kapalı" : "—",
      hint: nextCheckAt ? formatRelative(nextCheckAt) : "Ayarlardan aç",
      tone: "text-text-muted",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="p-3 rounded-xl bg-surface border border-border min-w-0"
            >
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-text-muted">
                <Icon size={11} className={card.tone} />
                <span className="truncate">{card.label}</span>
              </div>
              <p className="text-xs font-semibold text-text mt-1 truncate" title={card.value}>
                {card.value}
              </p>
              <p className="text-[10px] text-text-muted truncate">{card.hint}</p>
            </div>
          );
        })}
      </div>

      {conflicts.length > 0 && (
        <div className="p-2.5 rounded-xl bg-warning/10 border border-warning/30">
          <div className="flex items-start gap-2 text-warning">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <p className="text-[11px] leading-snug">
              “{conflicts[0].first.title}” ile “{conflicts[0].second.title}”
              aynı saat aralığında.
              {conflicts.length > 1 && ` (+${conflicts.length - 1} çakışma)`}
              <span className="block text-text-muted">
                İkisini aynı anda yapabiliyorsan sorun değil, “Aynı anda” işaretle; yoksa
                saatini kaydır.
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2 pl-5">
            <button
              onClick={() => {
                const { first, second } = conflicts[0];
                dispatch(updateTask({ id: first.id, updates: { parallel: true } }));
                dispatch(
                  updateTask({ id: second.id, updates: { parallel: true } }),
                );
              }}
              className="px-2 py-1 rounded-lg bg-warning/20 text-warning text-[11px] font-medium hover:bg-warning/30 transition-colors"
            >
              Aynı anda yapıyorum
            </button>
            <button
              onClick={() => dispatch(openEditModal(conflicts[0].first.id))}
              className="px-2 py-1 rounded-lg bg-surface-hover text-text-muted text-[11px] hover:text-text transition-colors"
            >
              Zamanı kaydır
            </button>
          </div>
        </div>
      )}

      <div className="p-3 rounded-xl bg-surface border border-border">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="flex items-center gap-1.5 text-text-muted">
            <CheckCircle2 size={12} className="text-success" />
            Günlük ilerleme
          </span>
          <span className="text-text font-medium tabular-nums">
            {completed}/{planned} · %{pct}
          </span>
        </div>
        <div className="h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full bg-success rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
