import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { requestMentorCheck } from "@/store/slices/mentorSlice";
import { setActivePage } from "@/store/slices/uiSlice";
import { formatClock, formatRelative } from "@/utils";
import CheckActions from "./CheckActions";
import MentorQuickSettings from "./MentorQuickSettings";
import {
  ArrowRight,
  BrainCircuit,
  Loader2,
  RefreshCw,
  Settings,
  Sparkles,
} from "lucide-react";

export default function MentorCard() {
  const { token } = useAuth();
  const dispatch = useAppDispatch();
  const pending = useAppSelector((s) => s.mentor.pending[0] ?? null);
  const summary = useAppSelector((s) => s.mentor.summary);
  const nextCheckAt = useAppSelector((s) => s.mentor.nextCheckAt);
  const reply = useAppSelector((s) => s.mentor.reply);
  const ai = useAppSelector((s) => s.mentor.ai);
  const settings = useAppSelector((s) => s.mentor.settings);
  const [requesting, setRequesting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [checkNotice, setCheckNotice] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const handleCheckNow = async () => {
    if (!token || requesting) return;
    setRequesting(true);
    setCheckNotice(null);
    try {
      const result = await dispatch(requestMentorCheck(token)).unwrap();
      if (result.throttled) {
        setCheckNotice(
          `Yeni mesaj için ${Math.max(1, Math.ceil((result.retryAfterMs ?? 0) / 1000))} sn bekle.`,
        );
      } else if (result.check?.generatedBy !== "ai") {
        setCheckNotice("AI yanıt veremedi; kural tabanlı mesaj üretildi.");
      }
    } catch {
      /* mentor.error */
    } finally {
      setRequesting(false);
    }
  };

  const aiActive = (ai?.availableKeys ?? 0) > 0 && settings?.aiEnabled !== false;

  return (
    <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <BrainCircuit size={16} className="text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text">AI Mentor</h3>
            <p className="text-[10px] text-text-muted">
              {aiActive ? "Gemini · kişiselleştirilmiş" : "Kural tabanlı mesajlar"}
              {nextCheckAt
                ? ` · sonraki kontrol ${formatClock(nextCheckAt)} (${formatRelative(nextCheckAt)})`
                : settings?.enabled === false
                  ? " · kontroller kapalı"
                  : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCheckNow}
            disabled={!token || requesting}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface border border-border text-xs text-text-muted hover:text-text transition-colors disabled:opacity-50"
            title="Şimdi kontrol et"
          >
            {requesting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            Kontrol
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 rounded-lg bg-surface border border-border text-text-muted hover:text-text transition-colors"
            title="Mentor ayarları"
          >
            <Settings size={13} />
          </button>
          <button
            onClick={() => dispatch(setActivePage("mentor"))}
            className="p-1.5 rounded-lg bg-surface border border-border text-text-muted hover:text-text transition-colors"
            title="Mentor ekranını aç"
          >
            <ArrowRight size={13} />
          </button>
        </div>
      </div>

      {pending ? (
        <div className="mt-3 space-y-2.5">
          <div className="rounded-xl bg-surface border border-border p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkles size={11} className="text-warning shrink-0" />
              <span className="text-[10px] uppercase tracking-wide text-text-muted truncate">
                {pending.taskTitle ? pending.taskTitle : "Saatlik kontrol"}
              </span>
              <div className="ml-auto flex items-center gap-1.5 shrink-0">
                <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-border text-text-muted">
                  {pending.generatedBy === "ai" ? "AI" : "kural"}
                </span>
                <button
                  onClick={handleCheckNow}
                  disabled={!token || requesting}
                  className="flex items-center gap-1 text-[10px] font-medium text-primary hover:text-primary/80 disabled:opacity-50 transition-colors"
                  title="Yeni bir mentor mesajı üret"
                >
                  {requesting ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <RefreshCw size={10} />
                  )}
                  Yeniden üret
                </button>
              </div>
            </div>
            <p className="text-sm text-text leading-relaxed whitespace-pre-line">{pending.message}</p>
            {checkNotice && (
              <p className="text-[10px] text-warning mt-1.5">{checkNotice}</p>
            )}
          </div>
          <CheckActions check={pending} />
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-text-muted">
            {summary
              ? `Bugün ${summary.completed}/${summary.planned} görev tamamlandı, ${summary.focusMinutes} dk odak kaydı var.`
              : "Bugünün planını kontrol ediyorum..."}
            {summary && summary.overdue > 0
              ? ` ${summary.overdue} görevin süresi geçmiş durumda.`
              : ""}
          </p>
          <button
            onClick={handleCheckNow}
            disabled={!token || requesting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {requesting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Sparkles size={12} />
            )}
            Şimdi kontrol et
          </button>
        </div>
      )}

      {reply && (
        <div className="mt-2.5 rounded-xl border border-success/25 bg-success/5 p-3">
          <p className="text-[10px] uppercase tracking-wide text-success mb-1">
            Mentor yanıtı
          </p>
          <p className="text-sm text-text leading-relaxed whitespace-pre-line">{reply.message}</p>
        </div>
      )}

      <MentorQuickSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
