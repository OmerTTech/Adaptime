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
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
        { TTL: 3600 },
      );
      sent += 1;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await PushSubscription.deleteOne({ _id: sub._id });
      } else {
        console.warn("[push] gönderim hatası:", status ?? error);
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

/**
 * Yaklaşan görev hatırlatıcıları: önümüzdeki 10 dakikada başlayacak
 * planlı görevler için bildirim. Dakikada bir çalışır, idempotenttir.
 */
export function startPushReminders() {
  const tick = async () => {
    try {
      const config = await ensureVapid();
      if (!config.enabled) return;

      const userIds = await PushSubscription.distinct("userId");
      if (userIds.length === 0) return;

      const users = await User.find({ _id: { $in: userIds } }).select(
        "timezone",
      );
      const now = Date.now();

      for (const user of users) {
        const tz =
          (user as unknown as { timezone?: string }).timezone || "Asia/Baku";
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

          await sendPushToUser(String(user._id), {
            title: "Sıradaki görev",
            body: `${task.title} · ${clock}'de başlıyor`,
            tag: key,
            url: "/",
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
        const settings = await MentorSettings.findOne({
          userId: user._id,
        }).select("enabled hours");

        if (
          settings?.enabled &&
          settings.hours?.includes(localHour) &&
          localMinute < 10
        ) {
          const open = routine.tasks.filter(
            (t) => t.status !== "completed" && t.status !== "skipped",
          );
          if (open.length > 0) {
            const mentorKey = `${String(user._id)}:mentor:${dateKey}:${localHour}`;
            if (!alreadyNotified.has(mentorKey)) {
              rememberKey(mentorKey);
              const head = open[0];
              await sendPushToUser(String(user._id), {
                title: "Mentor kontrolü",
                body:
                  open.length === 1
                    ? `Sırada “${head.title}” var. Başladın mı?`
                    : `${open.length} açık görev var, sıradaki “${head.title}”. Ne durumdasın?`,
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
  };

  void tick();
  setInterval(() => void tick(), 60_000);
  void ensureVapid().then((config) => {
    console.log(
      config.enabled
        ? "[push] görev hatırlatıcıları aktif"
        : "[push] VAPID anahtarları hazırlanamadı: arka plan bildirimleri kapalı",
    );
  });
}
