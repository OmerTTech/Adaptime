import { pushApi } from "@/services/api";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function registration(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service worker yok");
  }
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return navigator.serviceWorker.ready;
  await navigator.serviceWorker.register(
    import.meta.env.DEV ? "/sw.js?dev=1" : "/sw.js",
  );
  return navigator.serviceWorker.ready;
}

export async function pushSubscriptionState(): Promise<
  "unsupported" | "denied" | "off" | "on"
> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? "on" : "off";
  } catch {
    return "off";
  }
}

/** İzin ister, tarayıcıyı abone eder ve aboneliği sunucuya yazar. */
export async function enablePush(
  token: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!pushSupported()) {
    return { ok: false, message: "Bu tarayıcı arka plan bildirimlerini desteklemiyor." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      message:
        permission === "denied"
          ? "Tarayıcı bildirim iznini engelledi. Site ayarlarından açabilirsin."
          : "Bildirim izni verilmedi.",
    };
  }

  const { publicKey, enabled } = await pushApi.key();
  if (!enabled || !publicKey) {
    return { ok: false, message: "Sunucuda VAPID anahtarı tanımlı değil." };
  }

  const reg = await registration();
  const existing = await reg.pushManager.getSubscription();
  const subscription =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  await pushApi.subscribe(subscription.toJSON(), token);
  return { ok: true };
}

export async function disablePush(token: string): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await pushApi.unsubscribe(sub.endpoint, token);
      await sub.unsubscribe();
    } else {
      await pushApi.unsubscribe(undefined, token);
    }
  } catch {
    /* sessiz: izin yoksa zaten kapalı */
  }
}

export async function sendTestPush(
  token: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await pushApi.test(token);
    return res.sent > 0
      ? { ok: true, message: `Test bildirimi gönderildi (${res.sent} cihaz).` }
      : { ok: false, message: "Kayıtlı cihaz yok. Önce bildirimleri aç." };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Gönderilemedi.",
    };
  }
}
