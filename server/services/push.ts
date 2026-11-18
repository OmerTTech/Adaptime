import "dotenv/config";
import * as webpushModule from "web-push";

// web-push CommonJS: ESM altında default export bazen yok, ikisini de destekle.
const webpush =
  (webpushModule as unknown as { default?: typeof webpushModule }).default ??
  webpushModule;
import type mongoose from "mongoose";
import { AppConfig } from "../models/AppConfig.js";
import { PushSubscription } from "../models/PushSubscription.js";
import { MentorSettings } from "../models/Accountability.js";
import { Routine } from "../models/Routine.js";
import { User } from "../models/User.js";
import { dateKeyInTz } from "./time.js";

const SUBJECT = process.env.VAPID_SUBJECT || "mailto:adaptime@example.com";
const CONFIG_KEY = "vapid";

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let vapidKeys: VapidKeys | null = null;
let pending: Promise<{ enabled: boolean; publicKey: string | null }> | null =
  null;
let failureLogged = false;

/**
 * VAPID anahtarlarını hazırlar.
 *
 * Sıra: `.env` → veritabanında saklanan anahtarlar → yeni üretip veritabanına yaz.
 * Böylece ortam değişkenleri tanımlanmamış sunucularda (ör. panelden env
 * eklenmemiş dağıtımlar) arka plan bildirimleri yine de çalışır; aynı MongoDB'yi
 * kullanan tüm örnekler aynı anahtar çiftini paylaşır.
 */
export async function ensureVapid(): Promise<{
  enabled: boolean;
  publicKey: string | null;
}> {
  if (vapidKeys) return { enabled: true, publicKey: vapidKeys.publicKey };
  if (pending) return pending;

  pending = (async () => {
    const envPublic = process.env.VAPID_PUBLIC_KEY?.trim();
    const envPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
    let keys: VapidKeys | null =
      envPublic && envPrivate
        ? { publicKey: envPublic, privateKey: envPrivate }
        : null;

    if (!keys) {
      try {
        const stored = await AppConfig.findOne({ key: CONFIG_KEY }).lean();
        const value = stored?.value as Partial<VapidKeys> | undefined;
        if (value?.publicKey && value?.privateKey) {
          keys = { publicKey: value.publicKey, privateKey: value.privateKey };
        } else {
          const generated = webpush.generateVAPIDKeys();
          keys = generated;
          await AppConfig.findOneAndUpdate(
            { key: CONFIG_KEY },
            { $set: { value: generated } },
            { upsert: true, setDefaultsOnInsert: true },
          );
          console.log(
            "[push] VAPID anahtarları üretildi ve veritabanına kaydedildi",
          );
        }
      } catch (error) {
        if (!failureLogged) {
          failureLogged = true;
          console.error("[push] VAPID anahtarları hazırlanamadı:", error);
        }
        return { enabled: false, publicKey: null };
      }
    }

    try {
      webpush.setVapidDetails(SUBJECT, keys.publicKey, keys.privateKey);
    } catch (error) {
      console.error("[push] VAPID anahtarları geçersiz:", error);
      return { enabled: false, publicKey: null };
    }

    vapidKeys = keys;
    failureLogged = false;
    return { enabled: true, publicKey: keys.publicKey };
  })();

  try {
    return await pending;
  } finally {
    pending = null;
  }
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  /** Android/Chrome bildirim düğmeleri (en fazla 2 tane gösterilir). */
  actions?: { action: string; title: string }[];
  /** Düğme → hedef URL eşlemesi; sw.js notificationclick'te okur. */
  actionUrls?: Record<string, string>;
}

/**
 * Kullanıcının tüm cihazlarına bildirim gönderir.
 * Süresi geçmiş abonelikler (404/410) silinir.
 */
export async function sendPushToUser(
  userId: string | mongoose.Types.ObjectId,
  payload: PushPayload,
): Promise<{ sent: number; total: number; enabled: boolean }> {
  const config = await ensureVapid();
  if (!config.enabled) return { sent: 0, total: 0, enabled: false };

  const subscriptions = await PushSubscription.find({ userId });
  let sent = 0;

  for (const sub of subscriptions) {
    let delivered = false;
    for (let attempt = 1; attempt <= 3 && !delivered; attempt++) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
          { TTL: 3600 },
        );
        delivered = true;
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
          break;
        }
        if (attempt === 3) {
          console.warn("[push] gönderim hatası:", status ?? error);
        } else {
          // Artan bekleme: 0,5 sn → 1 sn
          await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        }
      }
    }
  }

  return { sent, total: subscriptions.length, enabled: true };
}

const alreadyNotified = new Set<string>();

function rememberKey(key: string) {
  if (alreadyNotified.size > 5000) alreadyNotified.clear();
  alreadyNotified.add(key);
}

/** "45 dk", "2 sa 10 dk" gibi kısa süre metni. */
function humanDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} sa ${rest} dk` : `${hours} sa`;
}

export interface PushTickResult {
  mentor: number;
  due: number;
  overdue: number;
}

let pushTickRunner: (() => Promise<PushTickResult>) | null = null;
let pushInFlight: Promise<PushTickResult> | null = null;

/** Cron ucundan da çağrılabilen tek push turu (aynı anda tek çalışır). */
export function runPushTick(): Promise<PushTickResult> {
  if (pushInFlight) return pushInFlight;
  if (!pushTickRunner)
    return Promise.resolve({ mentor: 0, due: 0, overdue: 0 });
  pushInFlight = pushTickRunner().finally(() => {
    pushInFlight = null;
  });
  return pushInFlight;
}

/**
 * Yaklaşan görev hatırlatıcıları: önümüzdeki 10 dakikada başlayacak
 * planlı görevler için bildirim. Dakikada bir çalışır, idempotenttir.
 */
export function startPushReminders() {
  const tick = async (): Promise<PushTickResult> => {
    const result: PushTickResult = { mentor: 0, due: 0, overdue: 0 };
    try {
      const config = await ensureVapid();
      if (!config.enabled) return result;

      const userIds = await PushSubscription.distinct("userId");
      if (userIds.length === 0) return result;

      const users = await User.find({ _id: { $in: userIds } }).select(
        "timezone focusSeenAt",
      );
      const now = Date.now();

      for (const user of users) {
        // Kullanıcının saat dilimi ve "aktif olduğum saatler" ayarı buradan
        // okunur; gece sessizliği sabit değil, ayarlardaki saatlere uyar.
        const settings = await MentorSettings.findOne({
          userId: user._id,
        }).select("enabled hours timezone");

        const tz =
          settings?.timezone ||
          (user as unknown as { timezone?: string }).timezone ||
          "Asia/Baku";
        const dateKey = dateKeyInTz(new Date(), tz);
        const routine = await Routine.findOne({
          userId: user._id,
          date: dateKey,
        }).select("tasks");
        if (!routine) continue;

        for (const task of routine.tasks) {
          if (task.status !== "pending" || !task.startTime) continue;
          const diff = task.startTime - now;
          if (diff <= 0 || diff > 10 * 60_000) continue;

          const key = `${String(user._id)}:${String((task as { _id?: unknown })._id)}:${task.startTime}`;
          if (alreadyNotified.has(key)) continue;
          rememberKey(key);

          const clock = new Date(task.startTime).toLocaleTimeString("tr-TR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: tz,
          });

          const dueTaskId = String(
            (task as { _id?: unknown })._id ?? "",
          );
          result.due += 1;
          await sendPushToUser(String(user._id), {
            title: "Sıradaki görev",
            body: `${task.title} · ${clock}'de başlıyor`,
            tag: key,
            // Bildirime dokununca ilgili görev vurgulanır.
            url: `/?task=${encodeURIComponent(dueTaskId)}`,
          });
        }

        // Saatlik mentor kontrolü: seçili saatlerin ilk 10 dakikasında,
        // o saatte hâlâ bekleyen iş varsa telefonu dürt.
        const localHour = Number(
          new Intl.DateTimeFormat("en-US", {
            hour: "2-digit",
            hour12: false,
            timeZone: tz,
          }).format(new Date()),
        );
        const localMinute = Number(
          new Intl.DateTimeFormat("en-US", {
            minute: "2-digit",
            timeZone: tz,
          }).format(new Date()),
        );

        // Odak süresi bitti ama görev hâlâ çalışıyor: uygulama kapalıysa
        // uygulama içi alarm çalmaz. Telefona bir kez hatırlatma gönder.
        // Uygulama görünür durumdaysa (son 3 dk içinde sinyal) bildirim yok.
        // Saat aralığı Ayarlar > "Kontrol saatleri"nden gelir; ayar yoksa
        // makul bir varsayılan (08:00–23:00) kullanılır.
        const focusSeenAt =
          (user as unknown as { focusSeenAt?: number }).focusSeenAt ?? 0;
        const appVisible = now - focusSeenAt < 3 * 60_000;
        const activeHours = settings?.hours;
        const withinActiveHours = activeHours
          ? activeHours.includes(localHour)
          : localHour >= 8 && localHour <= 23;
        if (!appVisible && withinActiveHours) {
          for (const task of routine.tasks) {
            if (task.status !== "active" || typeof task.endTime !== "number") {
              continue;
            }
            const late = now - task.endTime;
            if (late < 2 * 60_000 || late > 5 * 60 * 60_000) continue;

            const key = `${String(user._id)}:overrun:${String((task as { _id?: unknown })._id)}:${task.endTime}`;
            if (alreadyNotified.has(key)) continue;
            rememberKey(key);

            const overrunId = String(
              (task as { _id?: unknown })._id ?? "",
            );
            const deepLink = `/?task=${encodeURIComponent(overrunId)}`;
            result.overdue += 1;
            await sendPushToUser(String(user._id), {
              title: "Süre bitti",
              body: `“${task.title}” ${humanDuration(late)} önce bitmişti, hâlâ açık görünüyor. Tamamlandı mı?`,
              tag: key,
              url: deepLink,
              // Bildirimden çıkmadan karar ver: tamamla ya da 10 dk daha.
              actions: [
                { action: "complete", title: "Tamamlandı" },
                { action: "extend", title: "10 dk daha" },
              ],
              actionUrls: {
                complete: `${deepLink}&do=complete`,
                extend: `${deepLink}&do=extend`,
              },
            });
          }
        }

        // Saat başına tek gönderim anahtarı (mentorKey) sayesinde pencereyi
        // saat sonuna kadar açık tutmak güvenli: sunucu uykudan 20:14'te
        // uyanırsa 20:00 kontrolü yine de bir kez gider (telafi).
        if (
          settings?.enabled &&
          settings.hours?.includes(localHour) &&
          localMinute <= 50
        ) {
          const open = routine.tasks.filter(
            (t) => t.status !== "completed" && t.status !== "skipped",
          );
          if (open.length > 0) {
            const mentorKey = `${String(user._id)}:mentor:${dateKey}:${localHour}`;
            if (!alreadyNotified.has(mentorKey)) {
              rememberKey(mentorKey);
              const head = open[0];
              const late = localMinute > 10 ? " (gecikmeli)" : "";
              result.mentor += 1;
              await sendPushToUser(String(user._id), {
                title: "Mentor kontrolü",
                body:
                  (open.length === 1
                    ? `Sırada “${head.title}” var. Başladın mı?`
                    : `${open.length} açık görev var, sıradaki “${head.title}”. Ne durumdasın?`) +
                  late,
                tag: mentorKey,
                url: "/",
              });
            }
          }
        }
      }
    } catch (error) {
      console.error("[push] hatırlatıcı döngüsü:", error);
    }
    return result;
  };

  pushTickRunner = tick;
  void tick();
  setInterval(() => void runPushTick(), 60_000);
  void ensureVapid().then((config) => {
    console.log(
      config.enabled
        ? "[push] görev hatırlatıcıları aktif"
        : "[push] VAPID anahtarları hazırlanamadı: arka plan bildirimleri kapalı",
    );
  });
}
