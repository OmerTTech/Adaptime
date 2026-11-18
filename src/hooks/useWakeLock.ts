import { useEffect } from "react";

interface WakeLockSentinelLike {
  release: () => Promise<void>;
}

interface NavigatorWithWakeLock {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
}

/**
 * Odak sırasında ekranın uyumasını engeller (Screen Wake Lock API).
 * Desteklenmeyen tarayıcılarda sessizce yok sayılır; sekme görünür
 * olduğunda kilit yeniden alınır (tarayıcı görünmezken bırakır).
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as unknown as NavigatorWithWakeLock;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (!nav.wakeLock || document.visibilityState !== "visible") return;
      try {
        const lock = await nav.wakeLock.request("screen");
        if (cancelled) {
          void lock.release().catch(() => undefined);
          return;
        }
        sentinel = lock;
      } catch {
        /* pil/izin kısıtı: odak sayacı çalışmaya devam eder */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && !sentinel) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (sentinel) void sentinel.release().catch(() => undefined);
    };
  }, [active]);
}
