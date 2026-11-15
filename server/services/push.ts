import "dotenv/config";
import * as webpushModule from "web-push";

// web-push CommonJS: ESM altında default export bazen yok, ikisini de destekle.
const webpush =
  (webpushModule as unknown as { default?: typeof webpushModule }).default ??
  webpushModule;
import type mongoose from "mongoose";
import { PushSubscription } from "../models/PushSubscription.js";
import { Routine } from "../models/Routine.js";
import { User } from "../models/User.js";
import { dateKeyInTz } from "./time.js";

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:adaptime@example.com";

/** VAPID anahtarları yoksa arka plan bildirimi sessizce kapanır. */
export const pushEnabled = Boolean(PUBLIC_KEY && PRIVATE_KEY);

if (pushEnabled) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY!, PRIVATE_KEY!);
}

export const vapidPublicKey = PUBLIC_KEY ?? null;

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
  if (!pushEnabled) return { sent: 0, total: 0, enabled: false };

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
  if (!pushEnabled) {
    console.log("[push] VAPID anahtarları yok: arka plan bildirimleri kapalı");
    return;
  }

  const tick = async () => {
    try {
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
      }
    } catch (error) {
      console.error("[push] hatırlatıcı döngüsü:", error);
    }
  };

  void tick();
  setInterval(() => void tick(), 60_000);
  console.log("[push] görev hatırlatıcıları aktif");
}
