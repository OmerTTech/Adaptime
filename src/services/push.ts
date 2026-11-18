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

/** Uint8Array → base64url (applicationServerKey ile karşılaştırmak için). */
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Aboneliğin kullandığı VAPID anahtarı sunucudakiyle aynı mı? */
function sameKey(sub: PushSubscription, publicKey: string): boolean {
  const used = sub.options?.applicationServerKey;
  if (!used) return false;
  return toBase64Url(new Uint8Array(used)) === publicKey.replace(/=+$/, "");
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Push'un neden çalışmadığını tek cümleyle söyler (yoksa null). */
export function pushBlocker(): string | null {
  if (typeof window === "undefined") return null;
  if (!window.isSecureContext) {
    return "Bildirimler yalnız HTTPS veya localhost üzerinde çalışır. Telefonda siteyi https:// adresiyle aç (LAN IP'siyle değil).";
  }
  if (!("serviceWorker" in navigator)) return "Tarayıcı service worker desteklemiyor.";
  if (!("PushManager" in window)) return "Tarayıcı push bildirimlerini desteklemiyor.";
  if (!("Notification" in window)) return "Tarayıcı bildirimlerini desteklemiyor.";
  if (Notification.permission === "denied") {
    return "Bildirim izni tarayıcıda engellenmiş. Site ayarları → Bildirimler → İzin ver.";
  }
  return null;
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
  const blocker = pushBlocker();
  if (blocker) return { ok: false, message: blocker };
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
    return {
      ok: false,
      message:
        "Sunucu arka plan bildirimi anahtarı üretemedi. Sunucu .env dosyasına VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY eklenmeli (veya veritabanı bağlantısı düzelmeli).",
    };
  }

  const reg = await registration();
  let existing = await reg.pushManager.getSubscription();
  // Tarayıcıdaki abonelik eski bir sunucu anahtarıyla oluşturulduysa push
  // servisi 403 verir. Anahtar değiştiyse aboneliği tazele.
  if (existing && !sameKey(existing, publicKey)) {
    try {
      await existing.unsubscribe();
    } catch {
      /* yoksay: yeni abonelik yine de denenir */
    }
    existing = null;
  }
  const subscription =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  await pushApi.subscribe(subscription.toJSON(), token);
  return { ok: true };
}

/**
 * Uygulama açılışında sessiz onarım: tarayıcıdaki abonelik sunucudaki VAPID
 * anahtarıyla oluşturulmadıysa yenilenir ve sunucuya yazılır. Böylece eski
 * anahtarla kalmış cihazlar kullanıcı bir şey yapmadan tekrar çalışır.
 */
export async function refreshPushSubscription(token: string): Promise<void> {
  try {
    if (!pushSupported() || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.getRegistration();
    let existing = await reg?.pushManager.getSubscription();
    if (!existing) return;

    const { publicKey, enabled } = await pushApi.key();
    if (!enabled || !publicKey) return;

    if (!sameKey(existing, publicKey)) {
      await existing.unsubscribe();
      existing = await (await registration()).pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    await pushApi.subscribe(existing.toJSON(), token);
  } catch {
    /* sessiz: bir sonraki açılışta yeniden denenir */
  }
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
