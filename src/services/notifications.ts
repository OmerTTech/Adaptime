import type { MentorCheck } from "@/types";

/**
 * Tarayıcı bildirimleri.
 *
 * Gerçeklik sınırı: Service Worker + Push (VAPID) altyapısı olmadan
 * tarayıcı kapalıyken bildirim gönderilemez. Burada yapılan:
 * - Kullanıcı izin verdiyse, uygulama AÇIKKEN gelen mentor kontrollerini
 *   masaüstü bildirimi olarak göstermek.
 * - Aynı kontrol için birden fazla bildirim çıkmasını engellemek.
 * Sunucu tarafındaki saatlik kontrol kayıtları kalıcıdır; uygulama sonra
 * açıldığında bekleyen kontrol uygulama içinde gösterilir.
 */

const STORAGE_KEY = "adaptime-notified-checks";
const MAX_REMEMBERED = 100;

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission():
  | NotificationPermission
  | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function readNotified(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

function rememberNotified(id: string): void {
  try {
    const list = [...readNotified(), id].slice(-MAX_REMEMBERED);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* localStorage kapalı olabilir */
  }
}

export function wasNotified(id: string): boolean {
  return readNotified().includes(id);
}

/**
 * Kontrolü bildirim olarak gösterir. Gösterildiyse true döner.
 * Aynı kontrol id'si için ikinci kez göstermez.
 */
export function showCheckNotification(
  check: MentorCheck,
  onClick: () => void,
): boolean {
  if (notificationPermission() !== "granted") return false;
  // Odak sırasında "bildirimleri sessize al" açıksa uygulama içi bildirim yok.
  if (
    typeof document !== "undefined" &&
    document.documentElement.dataset.focusMuted === "1"
  ) {
    return false;
  }

  const dedupeKey = check._id || `${check.createdAt}-${check.message.slice(0, 24)}`;
  if (wasNotified(dedupeKey)) return false;

  try {
    const notification = new Notification("Adaptime Mentor", {
      body: check.message,
      tag: dedupeKey,
      silent: false,
    });
    notification.onclick = () => {
      window.focus();
      onClick();
      notification.close();
    };
    rememberNotified(dedupeKey);
    return true;
  } catch {
    return false;
  }
}
