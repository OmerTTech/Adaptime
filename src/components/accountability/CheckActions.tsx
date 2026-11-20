import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { answerMentorCheck } from "@/store/slices/mentorSlice";
import { completeTask, skipTask, updateTask } from "@/store/slices/routineSlice";
import type { MentorAction, MentorCheck } from "@/types";
import { playSound } from "@/services/sound";
import {
  AlertTriangle,
  ArrowRightCircle,
  CheckCircle2,
  Coffee,
  Loader2,
  Moon,
  Play,
  Send,
  Clock3,
} from "lucide-react";

type ActionIcon = React.ComponentType<{ size?: number | string; className?: string }>;

interface ActionButton {
  action: MentorAction;
  label: string;
  icon: ActionIcon;
  className: string;
  minutes?: number;
}

const BUTTONS: ActionButton[] = [
  {
    action: "start",
    label: "Göreve başla",
    icon: Play,
    className: "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20",
  },
  {
    action: "continue",
    label: "Devam ediyorum",
    icon: ArrowRightCircle,
    className: "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20",
  },
  {
    action: "complete",
    label: "Tamamladım",
    icon: CheckCircle2,
    className: "bg-success/10 text-success border-success/30 hover:bg-success/20",
  },
  {
    action: "rest",
    label: "Dinleniyorum",
    icon: Coffee,
    className: "bg-warning/10 text-warning border-warning/30 hover:bg-warning/20",
    minutes: 30,
  },
  {
    action: "busy",
    label: "Başka işle meşgulüm",
    icon: Clock3,
    className: "bg-surface border-border text-text-muted hover:text-text",
  },
  {
    action: "snooze",
    label: "15 dk ertele",
    icon: Moon,
    className: "bg-surface border-border text-text-muted hover:text-text",
    minutes: 15,
  },
  {
    action: "snooze",
    label: "30 dk ertele",
    icon: Moon,
    className: "bg-surface border-border text-text-muted hover:text-text",
    minutes: 30,
  },
  {
    action: "blocked",
    label: "Engelle karşılaştım",
    icon: AlertTriangle,
    className: "bg-danger/10 text-danger border-danger/30 hover:bg-danger/20",
  },
];

/** Serbest metinden niyet çıkarımı (Türkçe anahtar kelimeler). */
function inferAction(text: string): MentorAction {
  const t = text.toLocaleLowerCase("tr-TR");
  if (/(tamam|bitti|bitird|hallett)/.test(t)) return "complete";
  if (/(dinlen|mola|kafa|uyu)/.test(t)) return "rest";
  if (/(engel|takıl|hata|yardım|bilmiyorum)/.test(t)) return "blocked";
  if (/(ertele|sonra|birazdan)/.test(t)) return "snooze";
  if (/(başla|başlad|üzerindeyim|çalışıyorum)/.test(t)) return "start";
  if (/(toplantı|başka iş|meşgul|telefon)/.test(t)) return "busy";
  return "continue";
}

interface CheckActionsProps {
  check?: MentorCheck | null;
  taskId?: string | null;
  onDone?: () => void;
  /** Uzun yanıt için çok satırlı alan (Ctrl/Cmd+Enter gönderir). */
  multiline?: boolean;
}

export default function CheckActions({
  check,
  taskId,
  onDone,
  multiline = false,
}: CheckActionsProps) {
  const dispatch = useAppDispatch();
  const { token } = useAuth();
  const tasks = useAppSelector((s) => s.routine.currentRoutine?.tasks ?? []);
  const answering = useAppSelector((s) => s.mentor.answering);
  const [note, setNote] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const targetId = taskId ?? check?.taskId ?? undefined;
  const targetTask = tasks.find((t) => t.id === targetId);

  const applyLocalTaskChange = (action: MentorAction, responseNote?: string) => {
    if (!targetId) return;
    switch (action) {
      case "complete":
        dispatch(completeTask(targetId));
        break;
      case "skip":
        dispatch(skipTask(targetId));
        break;
      case "start":
        dispatch(
          updateTask({
            id: targetId,
            updates: {
              status: "active",
              startedAt: targetTask?.startedAt ?? Date.now(),
              pausedAt: undefined,
            },
          }),
        );
        break;
      case "continue":
        dispatch(
          updateTask({
            id: targetId,
            updates: { status: "active", pausedAt: undefined },
          }),
        );
        break;
      case "snooze":
        dispatch(
          updateTask({
            id: targetId,
            updates: { delayCount: (targetTask?.delayCount ?? 0) + 1 },
          }),
        );
        break;
      case "blocked":
        dispatch(
          updateTask({
            id: targetId,
            updates: {
              notes: [targetTask?.notes, responseNote]
                .filter(Boolean)
                .join("\n"),
            },
          }),
        );
        break;
      default:
        break;
    }
  };

  const submit = async (
    action: MentorAction,
    minutes?: number,
    key?: string,
  ) => {
    if (!token || answering) return;
    setPendingKey(key ?? action);
    try {
      const trimmed = note.trim();
      await dispatch(
        answerMentorCheck({
          token,
          checkId: check?._id,
          action,
          note: trimmed ? trimmed : undefined,
          minutes,
          taskId: targetId,
        }),
      ).unwrap();
      applyLocalTaskChange(action, trimmed);
      if (action === "complete") playSound("taskComplete");
      else if (action === "snooze" || action === "rest") playSound("snooze");
      setNote("");
      onDone?.();
    } catch {
      playSound("error");
    } finally {
      setPendingKey(null);
    }
  };

  const handleFreeText = () => {
    const trimmed = note.trim();
    if (!trimmed) return;
    submit(inferAction(trimmed), undefined, "note");
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {BUTTONS.map((btn) => {
          const Icon = btn.icon;
          const key = `${btn.action}-${btn.minutes ?? 0}`;
          const busy = pendingKey === key;
          return (
            <button
              key={key}
              type="button"
              disabled={!token || answering}
              onClick={() => submit(btn.action, btn.minutes, key)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${btn.className}`}
            >
              {busy ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Icon size={12} />
              )}
              {btn.label}
            </button>
          );
        })}
      </div>

      <div className="flex gap-1.5">
        {multiline ? (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleFreeText();
              }
            }}
            placeholder="Şu anda ne yapıyorsun? Kısa bir kelime ya da uzun bir not..."
            maxLength={500}
            rows={2}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-background border border-border text-text text-xs resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        ) : (
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleFreeText();
              }
            }}
            placeholder="Şu anda ne yapıyorsun? Kısaca anlatabilirsin..."
            maxLength={500}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-background border border-border text-text text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        )}
        <button
          type="button"
          onClick={handleFreeText}
          disabled={!note.trim() || !token || answering}
          className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Yanıtla"
        >
          {pendingKey === "note" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
        </button>
      </div>
    </div>
  );
}
