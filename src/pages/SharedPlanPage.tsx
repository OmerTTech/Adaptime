import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Lock,
  Send,
  Sun,
} from "lucide-react";
import { shareApi, type SharedPlan } from "@/services/api";

/**
 * Salt-okunur plan görünümü (4.1). `?p=<jeton>` ile açılır; oturum gerekmez.
 * Plan ortağı yalnızca başlık, saat ve durum görür.
 */
export default function SharedPlanPage({ token }: { token: string }) {
  const [plan, setPlan] = useState<SharedPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nudging, setNudging] = useState(false);
  const [nudgeMessage, setNudgeMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPlan(await shareApi.view(token));
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Plan yüklenemedi",
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const sendNudge = async () => {
    setNudging(true);
    try {
      await shareApi.nudge(token);
      setNudgeMessage("Başladın mı diye soruldu.");
    } catch (err) {
      setNudgeMessage(
        err instanceof Error ? err.message : "Dürtme gönderilemedi",
      );
    } finally {
      setNudging(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-text">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2 text-xs text-text-muted mb-4">
          <Lock size={13} />
          Salt okunur plan — düzenlenemez
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="animate-spin text-text-muted" size={20} />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-6">
            <p className="text-sm font-medium text-text">{error}</p>
            <p className="text-xs text-text-muted mt-1">
              Bağlantı kapatılmış veya yenilenmiş olabilir.
            </p>
            <button
              onClick={() => void load()}
              className="mt-3 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90"
            >
              Tekrar dene
            </button>
          </div>
        ) : plan ? (
          <>
            <div className="flex items-start gap-3 mb-5">
              <div className="size-10 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                <Sun size={18} />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-text">
                  {plan.owner} — bugünkü plan
                </h1>
                <p className="text-xs text-text-muted mt-0.5">
                  {plan.date} · {plan.counts.total} görev, {plan.counts.done}{" "}
                  tamamlandı, {plan.counts.open} açık
                  {plan.streak > 0 ? ` · ${plan.streak} günlük seri` : ""}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              {plan.tasks.length === 0 && (
                <p className="text-sm text-text-muted py-6">
                  Bugün için plan henüz oluşturulmamış.
                </p>
              )}
              {plan.tasks.map((task, index) => {
                const done = task.status === "completed";
                const skipped = task.status === "skipped";
                const time = task.startTime
                  ? new Date(task.startTime).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : task.estimatedMinutes
                    ? `~${task.estimatedMinutes} dk`
                    : "saatsiz";
                return (
                  <div
                    key={`${task.title}-${index}`}
                    className="flex items-center gap-2.5 rounded-lg bg-surface border border-border px-3 py-2"
                  >
                    {done ? (
                      <CheckCircle2 size={15} className="text-success shrink-0" />
                    ) : (
                      <Circle size={15} className="text-text-muted shrink-0" />
                    )}
                    <span
                      className={`flex-1 min-w-0 truncate text-sm ${
                        done
                          ? "line-through text-text-muted"
                          : skipped
                            ? "text-text-muted"
                            : "text-text"
                      }`}
                    >
                      {task.title}
                    </span>
                    <span className="text-[11px] text-text-muted tabular-nums shrink-0">
                      {time}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button
                onClick={() => void sendNudge()}
                disabled={nudging}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {nudging ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Send size={13} />
                )}
                Başladın mı diye sor
              </button>
              <button
                onClick={() => void load()}
                className="px-3 py-2 rounded-lg border border-border text-text-muted hover:text-text text-xs font-medium"
              >
                Yenile
              </button>
              {nudgeMessage && (
                <span className="text-[11px] text-text-muted">{nudgeMessage}</span>
              )}
            </div>
            <p className="text-[10px] text-text-muted/70 mt-3">
              Dürtmeler 3 saatte bir gönderilebilir; plan arkadaşın push
              bildirimi alır.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
