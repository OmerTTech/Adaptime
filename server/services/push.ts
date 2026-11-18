import "dotenv/config";
import * as webpushModule from "web-push";

// web-push CommonJS: ESM altında default export bazen yok, ikisini de destekle.
const webpush =
  (webpushModule as unknown as { default?: typeof webpushModule }).default ??
  webpushModule;
import type mongoose from "mongoose";
import { AppConfig } from "../models/AppConfig.js";
import { PushSubscription } from "../models/PushSubscription.js";
import { FocusSession, MentorSettings } from "../models/Accountability.js";
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
 * Sıra: veritabanında saklanan anahtarlar → `.env` → yeni üretip veritabanına yaz.
 * Veritabanı tek doğruluk kaynağıdır: aynı MongoDB'yi kullanan tüm örnekler
 * (yerel sunucu + Render) aynı çifti kullanır. `.env` yalnızca veritabanı boşsa
 * tohum olur ve oradaki çift veritabanına yazılır. Bu sıra tersine çevrildiğinde
 * env çifti ile veritabanı çifti ayrışıyor ve push servisi 403 veriyordu.
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
    const envKeys: VapidKeys | null =
      envPublic && envPrivate
        ? { publicKey: envPublic, privateKey: envPrivate }
        : null;
    let keys: VapidKeys | null = null;

    try {
      const stored = await AppConfig.findOne({ key: CONFIG_KEY }).lean();
      const value = stored?.value as Partial<VapidKeys> | undefined;
      if (value?.publicKey && value?.privateKey) {
        keys = { publicKey: value.publicKey, privateKey: value.privateKey };
        // Env'de farklı bir çift varsa uyar: tüm örnekler veritabanındakini kullanır.
        if (envKeys && envKeys.publicKey !== keys.publicKey && !failureLogged) {
          failureLogged = true;
          console.warn(
            "[push] .env VAPID_PUBLIC_KEY veritabanındaki anahtarla uyuşmuyor; veritabanındaki kullanılıyor. Yeni abonelikler için env'i güncelle veya boş bırak.",
          );
        }
      } else {
        keys = envKeys ?? webpush.generateVAPIDKeys();
        await AppConfig.findOneAndUpdate(
          { key: CONFIG_KEY },
          { $set: { value: keys } },
          { upsert: true, setDefaultsOnInsert: true },
        );
        console.log(
          envKeys
            ? "[push] VAPID anahtarları .env'den veritabanına kaydedildi"
            : "[push] VAPID anahtarları üretildi ve veritabanına kaydedildi",
        );
      }
    } catch (error) {
      if (!failureLogged) {
        failureLogged = true;
        console.error("[push] VAPID anahtarları hazırlanamadı:", error);
      }
      return { enabled: false, publicKey: null };
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
    // Farklı bir VAPID çiftiyle oluşturulmuş eski abonelik: push servisi 403
    // döndürür. Silinir; istemci bir sonraki açılışta yeni anahtarla yeniden
    // abone olur (bkz. src/services/push.ts).
    if (sub.publicKey && sub.publicKey !== config.publicKey) {
      await PushSubscription.deleteOne({ _id: sub._id });
      console.warn("[push] eski VAPID anahtarıyla oluşturulmuş abonelik silindi");
      continue;
    }
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
        // 403: abonelik başka bir VAPID çiftiyle oluşturulmuş (eski kayıt).
        if (status === 403) {
          await PushSubscription.deleteOne({ _id: sub._id });
          console.warn(
            "[push] VAPID uyuşmazlığı: abonelik silindi, cihaz yeniden abone olacak",
          );
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
  /** Sabah brifingi + gün sonu + haftalık özet gönderim sayısı. */
  summaries: number;
}

/** Ayarlardan açılıp kapanan özet bildirimleri. */
export interface SummarySettings {
  morning?: boolean;
  evening?: boolean;
  weekly?: boolean;
}

const SUMMARY_WINDOW_MS = 30 * 60_000;

function minutesOfDay(tz: string, now: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  }).formatToParts(new Date(now));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function weekdayShort(tz: string, now: number): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: tz,
  }).format(new Date(now));
}

function clockInTz(ms: number, tz: string): string {
  return new Date(ms).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });
}

interface SummaryContext {
  userId: string;
  tz: string;
  dateKey: string;
  tasks: {
    title: string;
    status: string;
    startTime?: number;
    endTime?: number;
    estimatedMinutes?: number;
  }[];
  streak: number;
  summaries: SummarySettings | undefined;
  now: number;
}

/**
 * Sabah brifingi (08:00), gün sonu özeti (21:30) ve pazar haftalık özeti
 * (20:00). Her biri günde bir kez gider; pencere 30 dakika açık kalır ki
 * Render uykudan geç uyansa da bildirim kaybolmasın.
 */
async function sendSummaries(
  ctx: SummaryContext,
  result: PushTickResult,
): Promise<void> {
  const { userId, tz, dateKey, tasks, streak, summaries, now } = ctx;
  const open = tasks.filter(
    (t) => t.status !== "completed" && t.status !== "skipped",
  );
  const done = tasks.filter((t) => t.status === "completed");
  const minutes = minutesOfDay(tz, now);

  const allowed = (key: keyof SummarySettings) => summaries?.[key] !== false;
  const send = async (
    kind: string,
    title: string,
    body: string,
    extra?: Partial<PushPayload>,
  ): Promise<void> => {
    const key = `${userId}:summary:${kind}:${dateKey}`;
    if (alreadyNotified.has(key)) return;
    rememberKey(key);
    result.summaries += 1;
    await sendPushToUser(userId, {
      title,
      body,
      tag: key,
      url: "/",
      ...extra,
    });
  };

  // 08:00 — günün planı.
  if (allowed("morning") && minutes >= 8 * 60 && minutes < 8 * 60 + 30) {
    if (tasks.length === 0) {
      await send(
        "morning",
        "Günaydın — plan boş",
        "Bugün için henüz görev yok. İlk görevi eklemek için bir dakika ayır.",
      );
    } else {
      const plannedMinutes = Math.round(
        tasks.reduce((total, task) => {
          if (
            task.startTime &&
            task.endTime &&
            task.endTime > task.startTime
          ) {
            return total + (task.endTime - task.startTime) / 60_000;
          }
          return total + (task.estimatedMinutes ?? 30);
        }, 0),
      );
      const firstThree = [...open]
        .sort((a, b) => (a.startTime ?? Infinity) - (b.startTime ?? Infinity))
        .slice(0, 3)
        .map((task) =>
          task.title.length > 28 ? `${task.title.slice(0, 27)}…` : task.title,
        );
      const list = firstThree.map((title) => `“${title}”`).join(", ");
      await send(
        "morning",
        "Günaydın — günün planı",
        `${tasks.length} görev, ${open.length} açık, ~${plannedMinutes} dk odak hedefi. İlk üç: ${list}.`,
      );
    }
  }

  // 21:30 — gün sonu özeti.
  if (
    allowed("evening") &&
    minutes >= 21 * 60 + 30 &&
    minutes < 21 * 60 + 30 + SUMMARY_WINDOW_MS / 60_000
  ) {
    if (tasks.length > 0) {
      await send(
        "evening",
        "Gün sonu özeti",
        `Bugün ${done.length}/${tasks.length} görev tamamlandı.` +
          (open.length > 0
            ? ` ${open.length} görev açık kaldı, yarına taşıyabilirsin.`
            : " Hepsi bitti.") +
          (streak > 0 ? ` Seri: ${streak} gün.` : ""),
        open.length > 0
          ? {
              // Tek dokunuşla açık görevleri yarına devret.
              actions: [
                { action: "carry", title: "Yarına devret" },
                { action: "open", title: "Planı aç" },
              ],
              actionUrls: { carry: "/?do=carry", open: "/" },
            }
          : undefined,
      );
    }
  }

  // Pazar 20:00 — haftalık özet.
  if (
    allowed("weekly") &&
    weekdayShort(tz, now) === "Sun" &&
    minutes >= 20 * 60 &&
    minutes < 20 * 60 + 30
  ) {
    const weekStart = dateKeyInTz(new Date(now - 6 * 86_400_000), tz);
    const rows = await Routine.find({
      userId,
      date: { $gte: weekStart, $lte: dateKey },
    }).select("date tasks.status");

    const sessions = await FocusSession.find({
      userId,
      dateKey: { $gte: weekStart, $lte: dateKey },
      mode: "focus",
    }).select("actualMinutes");
    const focusMinutes = Math.round(
      sessions.reduce((sum, session) => sum + (session.actualMinutes ?? 0), 0),
    );

    let total = 0;
    let completed = 0;
    let bestDay = "";
    let bestCount = 0;
    for (const row of rows) {
      const dayDone = row.tasks.filter((t) => t.status === "completed").length;
      total += row.tasks.length;
      completed += dayDone;
      if (dayDone > bestCount) {
        bestCount = dayDone;
        bestDay = row.date;
      }
    }

    if (total > 0) {
      const pct = Math.round((completed / total) * 100);
      const best = bestDay
        ? ` En çok ${new Intl.DateTimeFormat("tr-TR", {
            weekday: "long",
            timeZone: "UTC",
          }).format(new Date(`${bestDay}T12:00:00Z`))}: ${bestCount} görev.`
        : "";
      const focusText =
        focusMinutes > 0
          ? ` ${Math.floor(focusMinutes / 60)} sa ${focusMinutes % 60} dk odak.`
          : "";
      await send(
        "weekly",
        "Haftalık özet",
        `Bu hafta ${completed}/${total} görev tamamlandı (%${pct}).${focusText}${best}`,
      );
    }
  }
}

let pushTickRunner: (() => Promise<PushTickResult>) | null = null;
let pushInFlight: Promise<PushTickResult> | null = null;

/** Cron ucundan da çağrılabilen tek push turu (aynı anda tek çalışır). */
export function runPushTick(): Promise<PushTickResult> {
  if (pushInFlight) return pushInFlight;
  if (!pushTickRunner)
    return Promise.resolve({ mentor: 0, due: 0, overdue: 0, summaries: 0 });
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
    const result: PushTickResult = { mentor: 0, due: 0, overdue: 0, summaries: 0 };
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
        })        .select("enabled hours timezone summaries lastMentorSlot");

        const tz =
          settings?.timezone ||
          (user as unknown as { timezone?: string }).timezone ||
          "Asia/Baku";
        const dateKey = dateKeyInTz(new Date(), tz);
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

        const routine = await Routine.findOne({
          userId: user._id,
          date: dateKey,
        }).select("tasks streak");

        // Özetler plan boşken de anlamlı: görev yoksa da kullanıcı bilgilendirilir.
        await sendSummaries(
          {
            userId: String(user._id),
            tz,
            dateKey,
            tasks: routine?.tasks ?? [],
            streak: routine?.streak ?? 0,
            summaries: settings?.summaries,
            now,
          },
          result,
        );

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

        // Saat başına en fazla bir gönderim. Slot veritabanında tutulur:
        // Render uykuya dalıp 20:47'de uyansa bile 20:00 kontrolü gider;
        // aynı saat içinde ikinci kez (restart/cron) gitmez. Pencere saat
        // sonuna kadar açık olduğu için kaçırma riski azalır.
        if (settings?.enabled && settings.hours?.includes(localHour)) {
          const open = routine.tasks.filter(
            (t) => t.status !== "completed" && t.status !== "skipped",
          );
          if (open.length > 0) {
            const mentorKey = `${String(user._id)}:mentor:${dateKey}:${localHour}`;
            const slotKey = `${dateKey}:${localHour}`;
            if (
              !alreadyNotified.has(mentorKey) &&
              settings.lastMentorSlot !== slotKey
            ) {
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
              await MentorSettings.updateOne(
                { userId: user._id },
                { $set: { lastMentorSlot: slotKey, lastMentorAt: now } },
              );
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
