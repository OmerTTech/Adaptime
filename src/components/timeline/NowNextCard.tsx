import { useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { pauseTask, startTask, updateTask } from "@/store/slices/routineSlice";
import { openEditModal, setActivePage } from "@/store/slices/uiSlice";
import { setFocusTask, startSession } from "@/store/slices/focusSlice";
import StartRitualModal from "@/components/timeline/StartRitualModal";
import { isScheduled, PRIORITY_LABEL, type TaskBlock } from "@/types";
import { formatTime } from "@/utils";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ListOrdered,
  Lock,
  Infinity as InfinityIcon,
  Play,
  Sparkles,
  Timer,
} from "lucide-react";

const OPEN_STATUSES: TaskBlock["status"][] = ["pending", "active", "paused"];

const PRIORITY_SCORE: Record<string, number> = {
  critical: 60,
  high: 42,
  medium: 24,
  low: 10,
};

interface Ranked {
  task: TaskBlock;
  score: number;
  reasons: string[];
}

/**
 * "Şimdi ne yapmalıyım?" puanı: öncelik + deadline yakınlığı + planlı saat +
 * ertelenme sayısı + kısa iş avantajı. Yüksek puan önce yapılmalı.
 */
function rankTask(task: TaskBlock): Ranked {
  const now = Date.now();
  let score = 0;
  const reasons: string[] = [];

  const priority = task.priority ?? "medium";
  score += PRIORITY_SCORE[priority] ?? 24;
  if (priority === "critical" || priority === "high") {
    reasons.push(PRIORITY_LABEL[priority]);
  }

  if (task.deadline) {
    const diff = task.deadline - now;
    if (diff < 0) {
      score += 45;
      reasons.push("deadline geçti");
    } else if (diff < 2 * 3_600_000) {
      score += 32;
      reasons.push("deadline yakın");
    } else if (diff < 8 * 3_600_000) {
      score += 20;
      reasons.push("bugün deadline");
    } else if (diff < 24 * 3_600_000) {
      score += 12;
    }
  }

  if (isScheduled(task)) {
    const startDiff = task.startTime! - now;
    if (startDiff <= 0 && task.endTime! > now) {
      score += 28;
      reasons.push("şu an planlı");
    } else if (startDiff > 0 && startDiff < 30 * 60_000) {
      score += 20;
      reasons.push("az sonra");
    } else if (startDiff > 0 && startDiff < 3 * 3_600_000) {
      score += 8;
    }
  } else {
    score += 6;
    reasons.push("plansız");
  }

  const delays = task.delayCount ?? 0;
  if (delays > 0) {
    score += Math.min(12, delays * 4);
    reasons.push(`${delays}× ertelendi`);
  }

  const minutes = task.estimatedMinutes ?? 30;
  score += Math.max(0, 10 - minutes / 15);

  return { task, score: Math.round(score), reasons };
}

export default function NowNextCard() {
  const dispatch = useAppDispatch();
  const tasks = useAppSelector((s) => s.routine.currentRoutine?.tasks ?? []);
  const progressive = useAppSelector((s) => s.ui.progressiveLists);
  const focusWork = useAppSelector((s) => s.focus.workMinutes);
  const [open, setOpen] = useState(false);
  const [alternatives, setAlternatives] = useState(false);
  const [limit, setLimit] = useState(5);
  // 3.7 — Bağımlılık uyarısını bilerek geçen görev.
  const [overrideDep, setOverrideDep] = useState<string | null>(null);
  // 2.6 — Başlangıç ritüeli (nefes + tek cümle hedef).
  const [ritual, setRitual] = useState(false);

  const ranked = useMemo(() => {
    const open = tasks.filter((t) => OPEN_STATUSES.includes(t.status));
    return open
      .map(rankTask)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const da = a.task.deadline ?? a.task.endTime ?? Number.MAX_SAFE_INTEGER;
        const db = b.task.deadline ?? b.task.endTime ?? Number.MAX_SAFE_INTEGER;
        return da - db;
      });
  }, [tasks]);

  if (ranked.length === 0) return null;

  // 2.4: aynı anda birden çok görev çalışıyorsa odak dağılır. Paralel
  // işaretlenmemiş aktif görevler için tek tıkla "diğerlerini duraklat".
  const activeTasks = tasks.filter(
    (t) => t.status === "active" && !t.parallel,
  );

  const top = ranked[0];
  const dependency = top.task.dependsOn
    ? tasks.find((t) => t.id === top.task.dependsOn)
    : undefined;
  const blockedBy =
    dependency && dependency.status !== "completed" ? dependency : undefined;
  const depConfirmed = overrideDep === top.task.id;
  const shown = !open
    ? ranked.slice(0, 1)
    : progressive
      ? ranked.slice(0, limit)
      : ranked;
  const remaining = ranked.length - shown.length;

  const meta = (task: TaskBlock) =>
    task.openEnded
      ? "süresiz"
      : isScheduled(task)
        ? `${formatTime(task.startTime)}–${formatTime(task.endTime)}`
        : `~${task.estimatedMinutes ?? 30} dk`;

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <Sparkles size={13} className="text-primary" />
        <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">
          Şimdi ne yapmalıyım?
        </span>
        <button
          onClick={() => {
            setOpen((v) => !v);
            setLimit(5);
          }}
          className="ml-auto flex items-center gap-1 text-[10px] text-text-muted hover:text-text transition-colors"
          title={
            open
              ? "Sadece ilk görevi göster"
              : "Tüm görevleri sırayla listele"
          }
        >
          <ListOrdered size={11} />
          {open ? "Gizle" : `Sırala (${ranked.length})`}
          {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
      </div>

      {activeTasks.length > 1 && (
        <div className="mb-2 rounded-lg border border-warning/40 bg-warning/10 px-2 py-1.5">
          <p className="text-[10px] text-warning leading-snug">
            {activeTasks.length} görev aynı anda çalışıyor. Tek göreve odaklanmak
            için diğerlerini duraklat.
          </p>
          <button
            onClick={() =>
              activeTasks.slice(1).forEach((task) => dispatch(pauseTask(task.id)))
            }
            className="mt-1 text-[10px] font-medium text-warning hover:underline"
          >
            Diğerlerini duraklat
          </button>
        </div>
      )}

      {!open && (
        <>
          <p className="text-sm font-semibold text-text mb-2 break-words">
            {top.task.title}
          </p>
          {top.task.firstAction && (
            <p className="text-[11px] text-text-muted mb-2 leading-snug">
              <span className="text-primary font-medium">İlk adım:</span>{" "}
              {top.task.firstAction}
            </p>
          )}
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            <span className="text-[10px] text-text-muted">
              {meta(top.task)}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary tabular-nums">
              puan {top.score}
            </span>
            {top.reasons.slice(0, 2).map((r) => (
              <span key={r} className="text-[10px] text-text-muted">
                · {r}
              </span>
            ))}
          </div>
          {(top.task.delayCount ?? 0) >= 3 && (
            <p className="text-[10px] text-warning mb-2 leading-snug">
              {top.task.delayCount} kez ertelendi. Bu kadar ertelenen iş genelde
              fazla büyüktür: küçültmeyi veya alt görevlere bölmeyi dene.{" "}
              <button
                onClick={() => dispatch(openEditModal(top.task.id))}
                className="underline hover:no-underline"
              >
                Düzenle
              </button>
            </p>
          )}
          {blockedBy && depConfirmed && (
            <p className="text-[10px] text-warning mb-2 leading-snug">
              “{blockedBy.title}” henüz bitmedi. Yine de başlarsan iki iş birden
              açık kalır.{" "}
              <button
                onClick={() => setOverrideDep(null)}
                className="underline hover:no-underline"
              >
                Vazgeç
              </button>
            </p>
          )}
          <div className="flex items-center gap-2">
            {blockedBy && !depConfirmed ? (
              <button
                onClick={() => setOverrideDep(top.task.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-warning/10 border border-warning/40 text-warning text-xs font-medium hover:bg-warning/20 transition-colors"
                title={`Önce “${blockedBy.title}” tamamlanmalı`}
              >
                <Lock size={13} />
                Önce “{blockedBy.title}” bitmeli
              </button>
            ) : (
              <button
                onClick={() => setRitual(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                <Play size={13} />
                Hemen başla
              </button>
            )}
            <button
              onClick={() => dispatch(openEditModal(top.task.id))}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-surface border border-border text-text-muted hover:text-text text-xs transition-colors"
            >
              Düzenle
              <ArrowRight size={12} />
            </button>
          </div>
          <button
            onClick={() => {
              dispatch(setFocusTask(top.task.id));
              dispatch(startSession());
              dispatch(setActivePage("focus"));
            }}
            className="mt-2 flex items-center gap-1 text-[10px] text-text-muted hover:text-primary transition-colors"
            title="Odak sonunda mola gelir; dakikalar bu göreve işlenir"
          >
            <Timer size={11} />
            {focusWork} dk pomodoro ile başla
          </button>
          {isScheduled(top.task) && top.task.status !== "active" && (
            <button
              onClick={() => {
                dispatch(
                  updateTask({
                    id: top.task.id,
                    updates: { openEnded: true },
                  }),
                );
                dispatch(startTask(top.task.id));
              }}
              className="mt-2 flex items-center gap-1 text-[10px] text-text-muted hover:text-primary transition-colors"
              title="Bitiş saati işlemez; geçen süre sayılır"
            >
              <InfinityIcon size={11} />
              Süresiz başlat (bitiş saati yok, flow modu)
            </button>
          )}
          {ranked.length > 1 && (
            <button
              onClick={() => setAlternatives((v) => !v)}
              className="mt-2 text-[10px] text-text-muted hover:text-text transition-colors"
            >
              {alternatives ? "Vazgeç" : "Başka bir şey yapmak istiyorum"}
            </button>
          )}
          {alternatives && (
            <div className="mt-1.5 space-y-1">
              {ranked.slice(1, 4).map(({ task }) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2 rounded-lg bg-background/70 border border-border/60 px-2 py-1.5"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: task.color }}
                  />
                  <span className="text-[11px] flex-1 min-w-0 truncate text-text">
                    {task.title}
                  </span>
                  <span className="text-[10px] text-text-muted tabular-nums shrink-0">
                    {meta(task)}
                  </span>
                  <button
                    onClick={() => dispatch(startTask(task.id))}
                    className="shrink-0 p-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    title="Bu görevi başlat"
                  >
                    <Play size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {ritual && (
        <StartRitualModal
          task={top.task}
          onClose={() => setRitual(false)}
          onStart={(goal) => {
            if (goal) {
              dispatch(
                updateTask({
                  id: top.task.id,
                  updates: { firstAction: goal },
                }),
              );
            }
            dispatch(startTask(top.task.id));
            setRitual(false);
          }}
        />
      )}

      {open && (
        <div className="space-y-1">
          <p className="text-[10px] text-text-muted mb-1.5">
            Öncelik · deadline · planlı saat · ertelenme puana göre sıralı.
          </p>
          {shown.map(({ task, score, reasons }, i) => {
            const running = task.status === "active" || task.status === "paused";
            return (
              <div
                key={task.id}
                className={`flex items-center gap-2 rounded-lg bg-background/70 border px-2 py-1.5 ${
                  i === 0 && !running ? "border-primary/40" : "border-border/60"
                }`}
              >
                <span className="w-4 text-[10px] tabular-nums text-text-muted shrink-0">
                  {i + 1}
                </span>
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: task.color }}
                />
                <span
                  className="text-xs sm:text-[11px] flex-1 min-w-0 leading-snug line-clamp-2 sm:line-clamp-1 text-text"
                  title={`${task.title} · puan ${score}${
                    reasons.length > 0 ? ` · ${reasons.join(", ")}` : ""
                  }`}
                >
                  {task.title}
                  {running && (
                    <span className="text-[9px] text-success ml-1">● canlı</span>
                  )}
                </span>
                <span className="text-[10px] text-text-muted tabular-nums shrink-0">
                  {meta(task)}
                </span>
                <span className="text-[10px] text-primary tabular-nums shrink-0">
                  {score}
                </span>
                <button
                  onClick={() => dispatch(startTask(task.id))}
                  disabled={running}
                  className="shrink-0 p-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40"
                  title={running ? "Zaten çalışıyor" : "Bu görevi başlat"}
                >
                  <Play size={11} />
                </button>
                <button
                  onClick={() => dispatch(openEditModal(task.id))}
                  className="shrink-0 p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                  title="Düzenle"
                >
                  <ArrowRight size={11} />
                </button>
              </div>
            );
          })}

          {progressive && remaining > 0 && (
            <button
              onClick={() => setLimit((v) => v + 5)}
              className="mt-1 text-[11px] text-primary hover:underline"
            >
              +{Math.min(5, remaining)} görev daha
              {remaining > 5 ? ` (${remaining} kaldı)` : ""}
            </button>
          )}
          {progressive && limit > 5 && (
            <button
              onClick={() => setLimit(5)}
              className="mt-1 ml-3 text-[11px] text-text-muted hover:text-text"
            >
              Daha az göster
            </button>
          )}
        </div>
      )}
    </div>
  );
}
