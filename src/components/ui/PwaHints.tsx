import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { enablePush, pushSupported } from "@/services/push";
import { requestNotificationPermission } from "@/services/notifications";
import { Bell, Download, Smartphone, X } from "lucide-react";

const INSTALL_KEY = "adaptime-install-hint-dismissed";
const PUSH_KEY = "adaptime-push-hint-dismissed";
const IOS_KEY = "adaptime-ios-hint-dismissed";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

/** 1.5 — Ana ekrana ekleme, iOS rehberi ve bildirim izni ipuçları. */
export default function PwaHints() {
  const { token } = useAuth();
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>(
    (): Record<string, boolean> => {
    try {
      return {
        install: localStorage.getItem(INSTALL_KEY) === "1",
        push: localStorage.getItem(PUSH_KEY) === "1",
        ios: localStorage.getItem(IOS_KEY) === "1",
      };
    } catch {
      return {};
    }
    },
  );
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  const standalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true);
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const permission =
    typeof Notification !== "undefined" ? Notification.permission : "denied";

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = (key: "install" | "push" | "ios") => {
    setDismissed((prev) => ({ ...prev, [key]: true }));
    try {
      localStorage.setItem(
        key === "install" ? INSTALL_KEY : key === "push" ? PUSH_KEY : IOS_KEY,
        "1",
      );
    } catch {
      /* yalnızca bu oturum */
    }
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    dismiss("install");
  };

  const allowPush = async () => {
    if (!token) return;
    const result = await requestNotificationPermission();
    if (result !== "granted") {
      setPushMessage("İzin verilmedi. Tarayıcı ayarlarından açabilirsin.");
      return;
    }
    const res = await enablePush(token).catch(() => null);
    if (res?.ok) dismiss("push");
    else
      setPushMessage(
        res?.message ?? "Cihaz kaydedilemedi. Daha sonra tekrar dene.",
      );
  };

  return (
    <div className="space-y-1.5">
      {!standalone && isIos && !dismissed.ios && (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-surface px-3 py-2">
          <Smartphone size={13} className="text-primary shrink-0 mt-0.5" />
          <p className="text-[11px] text-text-muted flex-1 leading-snug">
            iPhone'da bildirim için: Safari → Paylaş → <strong className="text-text">Ana Ekrana Ekle</strong>,
            sonra uygulamayı ana ekrandan aç.
          </p>
          <button onClick={() => dismiss("ios")} aria-label="Kapat" className="text-text-muted hover:text-text">
            <X size={12} />
          </button>
        </div>
      )}

      {installEvent && !dismissed.install && !standalone && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
          <Download size={13} className="text-primary shrink-0" />
          <p className="text-[11px] text-text flex-1">
            Adaptime'i ana ekrana ekle; uygulama gibi açılsın.
          </p>
          <button
            onClick={install}
            className="px-2 py-1 rounded-lg bg-primary text-white text-[10px] font-medium"
          >
            Ekle
          </button>
          <button onClick={() => dismiss("install")} aria-label="Kapat" className="text-text-muted hover:text-text">
            <X size={12} />
          </button>
        </div>
      )}

      {pushSupported() && permission === "default" && !dismissed.push && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
          <Bell size={13} className="text-warning shrink-0" />
          <p className="text-[11px] text-text flex-1">
            {pushMessage ?? "Görev ve mentor bildirimlerini aç."}
          </p>
          <button
            onClick={allowPush}
            className="px-2 py-1 rounded-lg bg-warning/15 border border-warning/40 text-warning text-[10px] font-medium"
          >
            Aç
          </button>
          <button onClick={() => dismiss("push")} aria-label="Kapat" className="text-text-muted hover:text-text">
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
