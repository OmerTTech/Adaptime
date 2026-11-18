import mongoose from "mongoose";
import { runSchedulerTick } from "./accountability.js";
import { runPushTick } from "./push.js";
import { rollForwardTodos } from "../routes/routine.js";
import { Routine } from "../models/Routine.js";
import { User } from "../models/User.js";
import { dateKeyInTz } from "./time.js";
import { createDailyBackups } from "./backup.js";

/**
 * Harici cron (GitHub Actions / cron-job.org) için tek giriş noktası.
 *
 * Render ücretsiz servisi trafik almayınca uyuyor ve sunucu içindeki 60 sn'lik
 * setInterval duruyor. Dışarıdan 10 dakikada bir bu uç çağrılınca süreç uyanır
 * ve kaçırılan saat telafi edilir (push tarafında saat başına tek gönderim).
 */
export function isCronAuthorized(
  secretHeader: string | undefined,
  authorization: string | undefined,
): boolean {
  const expected = process.env.CRON_SECRET;
  // Secret tanımlı değilse uç tamamen kapalıdır (yanlışlıkla açık kalmasın).
  if (!expected) return false;
  const bearer = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : undefined;
  return secretHeader === expected || bearer === expected;
}

export interface CronTickResult {
  ok: boolean;
  checks: number;
  push: { mentor: number; due: number; overdue: number };
  rollover: { users: number; moved: number };
  backup: { users: number; routines: number };
  at: number;
}

/** Gün devri: yerel saat 00:10-00:59 arasında, günde bir kez kullanıcı başına. */
const rolledToday = new Set<string>();

async function rolloverIfMidnight(): Promise<{ users: number; moved: number }> {
  const users = await User.find().select("timezone").limit(5000);
  const now = new Date();
  let moved = 0;
  let count = 0;

  for (const user of users) {
    const tz =
      (user as unknown as { timezone?: string }).timezone || "Asia/Baku";
    const dateKey = dateKeyInTz(now, tz);
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        hour12: false,
        timeZone: tz,
      }).format(now),
    );
    const minute = Number(
      new Intl.DateTimeFormat("en-US", {
        minute: "2-digit",
        timeZone: tz,
      }).format(now),
    );
    if (hour !== 0 || minute < 10) continue;

    const key = `${String(user._id)}:${dateKey}`;
    if (rolledToday.has(key)) continue;
    rolledToday.add(key);
    if (rolledToday.size > 20000) rolledToday.clear();

    try {
      moved += await rollForwardTodos(String(user._id), dateKey);
      count += 1;
    } catch (error) {
      console.warn(
        "[cron] gün devri hatası:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  return { users: count, moved };
}

/** Yedek günde bir kez alınır (03:00'ü kaçırsa ilk tick'te telafi edilir). */
const backedUpDays = new Set<string>();

async function backupIfNeeded(): Promise<{ users: number; routines: number }> {
  const now = new Date();
  const key = `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
  if (backedUpDays.has(key)) return { users: 0, routines: 0 };
  backedUpDays.add(key);
  if (backedUpDays.size > 30) backedUpDays.clear();
  try {
    const result = await createDailyBackups(7);
    return { users: result.users, routines: result.routines };
  } catch (error) {
    console.warn(
      "[cron] yedek hatası:",
      error instanceof Error ? error.message : error,
    );
    return { users: 0, routines: 0 };
  }
}

export async function runCronTick(): Promise<CronTickResult> {
  const empty: CronTickResult = {
    ok: false,
    checks: 0,
    push: { mentor: 0, due: 0, overdue: 0 },
    rollover: { users: 0, moved: 0 },
    backup: { users: 0, routines: 0 },
    at: Date.now(),
  };
  // Soğuk başlangıçta Mongo bağlantısı henüz kurulmamış olabilir: kısa bekle.
  if (mongoose.connection.readyState === 2) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (mongoose.connection.readyState !== 1) return empty;

  const checks = await runSchedulerTick();
  const push = await runPushTick();
  const rollover = await rolloverIfMidnight();
  const backup = await backupIfNeeded();

  return { ok: true, checks, push, rollover, backup, at: Date.now() };
}

/** Aynı anda birden çok cron çağrısı gelirse işi tekilleştir. */
let inFlight: Promise<CronTickResult> | null = null;
export function runCronTickOnce(): Promise<CronTickResult> {
  if (inFlight) return inFlight;
  inFlight = runCronTick().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Yedek/snapshot yardımcısı: son N günün rutinlerini JSON'a çevirir (cron). */
export async function snapshotRecentRoutines(days = 7) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const dateStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
  return Routine.find({ date: { $gte: dateStr } }).lean();
}
