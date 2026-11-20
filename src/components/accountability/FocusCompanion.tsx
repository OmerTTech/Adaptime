import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { requestMentorCheck } from "@/store/slices/mentorSlice";
import CheckActions from "@/components/accountability/CheckActions";
import type { MentorCheck } from "@/types";
import { HeartHandshake, Loader2, MessageCircleQuestion, BellOff } from "lucide-react";

const FIRST_CHECK_MS = 4 * 60_000;
const REPEAT_CHECK_MS = 20 * 60_000;
const MUTE_KEY = "adaptime-companion-muted";

/**
 * Çalışırken kenardan uğrayan eşlikçi: uzun değil, tek kısa soru sorar.
 * Cevaplar tek dokunuşla verilebilir; istenirse kısa/uzun not yazılır.
 */
export default function FocusCompanion() {
  const { token } = useAuth();
  const dispatch = useAppDispatch();
  const tasks = useAppSelector((s) => s.routine.currentRoutine?.tasks ?? []);
  const active = tasks.find((t) => t.status === "active") ?? null;
  const [check, setCheck] = useState<MentorCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  const ask = useCallback(async () => {
    if (!token || busy) return;
    setBusy(true);
    try {
      const result = await dispatch(requestMentorCheck(token)).unwrap();
      if (result.check) setCheck(result.check);
    } catch {
      /* sessiz: eşlikçi hata mesajı göstermez */
    } finally {
      setBusy(false);
    }
  }, [token, busy, dispatch]);

  // Zamanlayıcı eski `ask` kapanışını kullanmasın.
  const askRef = useRef(ask);
  useEffect(() => {
    askRef.current = ask;
  }, [ask]);

  const activeId = active?.id;
  useEffect(() => {
    setCheck(null);
    if (!activeId || muted) return;
    const first = window.setTimeout(() => void askRef.current(), FIRST_CHECK_MS);
    const repeat = window.setInterval(
      () => void askRef.current(),
      REPEAT_CHECK_MS,
    );
    return () => {
      window.clearTimeout(first);
      window.clearInterval(repeat);
    };
  }, [activeId, muted]);

  const toggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      } catch {
        /* yalnızca oturum */
      }
      return next;
    });
  };

  if (!active) return null;

  const start = active.startedAt ?? active.startTime ?? now;
  const elapsedMinutes = Math.max(
    0,
    Math.floor((now - start - (active.pausedDuration ?? 0)) / 60_000),
  );

  return (
    <div className="rounded-xl border border-primary/20 bg-surface p-3">
      <div className="flex items-center gap-2">
        <HeartHandshake size={14} className="text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wide text-primary font-semibold">
            Yanındayım
          </p>
          <p className="text-[11px] text-text-muted truncate">
            {active.title} · {active.openEnded ? "süresiz" : "devam ediyor"} ·{" "}
            {elapsedMinutes} dk
          </p>
        </div>
        <button
          onClick={toggleMute}
          className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] border transition-colors ${
            muted
              ? "bg-background border-border text-text-muted"
              : "bg-primary/10 border-primary/25 text-primary"
          }`}
          title={muted ? "Sessizi aç" : "Beni rahat bırak"}
        >
          <BellOff size={11} />
          {muted ? "Sessiz" : "Sessize al"}
        </button>
      </div>

      <div className="mt-2 rounded-lg bg-background border border-border px-3 py-2">
        <p className="text-xs text-text leading-relaxed">
          {check?.message ??
            (muted
              ? "Sessizdeyim. İstediğinde “Şimdi sor” ile tek soru sorabilirim."
              : "Arada bir uğrayıp tek kısa soru soracağım. İstersen tek kelime yaz, istersen uzun anlat.")}
        </p>
      </div>

      {check ? (
        <div className="mt-2">
          <CheckActions
            check={check}
            taskId={active.id}
            multiline
            onDone={() => setCheck(null)}
          />
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={() => void ask()}
            disabled={busy || !token}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/25 text-primary text-[11px] font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <MessageCircleQuestion size={12} />
            )}
            Şimdi sor
          </button>
          <span className="text-[10px] text-text-muted">
            Kısa cevap yeter; flow bozulmasın.
          </span>
        </div>
      )}
    </div>
  );
}
