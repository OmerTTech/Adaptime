import { Router } from "express";
import mongoose from "mongoose";
import { authMiddleware, type AuthRequest } from "../middleware/auth.js";
import { getAiStatus } from "../services/gemini.js";
import {
  buildContext,
  computeSummary,
  createCheck,
  getOrCreateSettings,
  logActivity,
  nextCheckInfo,
  recordFocusSession,
  respondToCheck,
  sanitizeSettings,
  type SettingsPatch,
} from "../services/accountability.js";
import {
  generateDailyLaunch,
  generateFirstSteps,
  generateSubtasks,
  type MentorAction,
} from "../services/mentor.js";
import { ActivityLog, MentorCheck } from "../models/Accountability.js";
import { Routine } from "../models/Routine.js";
import { isValidTimeZone, dateKeyInTz, nextCheckAt } from "../services/time.js";

const router = Router();

const VALID_ACTIONS: MentorAction[] = [
  "start",
  "continue",
  "complete",
  "rest",
  "busy",
  "free",
  "snooze",
  "blocked",
  "skip",
  "report",
];

function currentDateKey(timezone: string): string {
  return dateKeyInTz(new Date(), timezone);
}

function parseDateKey(raw: unknown, fallback: string): string {
  return typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback;
}

/* ---------------------------- ayarlar ---------------------------- */

router.get("/settings", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const settings = await getOrCreateSettings(String(req.userId));
    res.json(sanitizeSettings(settings));
  } catch (error) {
    console.error("Settings read error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

router.put("/settings", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const settings = await getOrCreateSettings(String(req.userId));
    const body = (req.body ?? {}) as SettingsPatch;

    if (typeof body.enabled === "boolean") settings.enabled = body.enabled;
    if (typeof body.aiEnabled === "boolean") settings.aiEnabled = body.aiEnabled;

    if (typeof body.timezone === "string" && body.timezone.trim()) {
      if (!isValidTimeZone(body.timezone.trim())) {
        return res.status(400).json({ error: "Geçersiz saat dilimi" });
      }
      settings.timezone = body.timezone.trim();
    }

    if (Array.isArray(body.hours)) {
      const hours = [...new Set(
        body.hours
          .map((h) => Number(h))
          .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23),
      )].sort((a, b) => a - b);
      settings.hours = hours;
    }

    if (body.summaries && typeof body.summaries === "object") {
      // Alan alan güncellenir: yalnızca "morning" gönderilirse diğerleri korunur.
      settings.summaries = {
        morning: settings.summaries?.morning !== false,
        evening: settings.summaries?.evening !== false,
        weekly: settings.summaries?.weekly !== false,
      };
      for (const key of ["morning", "evening", "weekly"] as const) {
        const value = body.summaries[key];
        if (typeof value === "boolean") settings.summaries[key] = value;
      }
    }

    if (
      body.tone === "direct" ||
      body.tone === "balanced" ||
      body.tone === "supportive"
    ) {
      settings.tone = body.tone;
    }

    if (typeof body.snoozeMinutes === "number") {
      settings.snoozeMinutes = Math.min(180, Math.max(5, Math.round(body.snoozeMinutes)));
    }

    if (typeof body.maxSentences === "number") {
      settings.maxSentences = Math.min(20, Math.max(1, Math.round(body.maxSentences)));
    }

    if (body.restUntil === null) {
      settings.restUntil = null;
      settings.restReason = null;
    } else if (typeof body.restUntil === "number") {
      settings.restUntil = body.restUntil;
    }
    if (typeof body.restReason === "string") settings.restReason = body.restReason;

    await settings.save();

    res.json({
      settings: sanitizeSettings(settings),
      nextCheckAt: nextCheckInfo(settings)?.at ?? null,
    });
  } catch (error) {
    console.error("Settings update error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

/* ----------------------------- durum ----------------------------- */

router.get("/state", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = String(req.userId);
    const settings = await getOrCreateSettings(userId);
    const dateKey = parseDateKey(req.query.date, currentDateKey(settings.timezone));

    const [pending, recentChecks, activities, summary, routine] = await Promise.all([
      MentorCheck.find({ userId, status: "pending" }).sort({ createdAt: -1 }).limit(5),
      MentorCheck.find({ userId, dateKey }).sort({ createdAt: -1 }).limit(20),
      ActivityLog.find({ userId, dateKey }).sort({ startedAt: -1 }).limit(40),
      computeSummary(userId, dateKey),
      Routine.findOne({ userId, date: dateKey }).select("tasks"),
    ]);

    res.json({
      dateKey,
      settings: sanitizeSettings(settings),
      pending,
      checks: recentChecks,
      activities,
      summary,
      nextCheckAt: nextCheckInfo(settings)?.at ?? null,
      serverTime: Date.now(),
      ai: getAiStatus(),
      hasRoutine: Boolean(routine),
    });
  } catch (error) {
    console.error("Accountability state error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

/* -------------------------- manuel kontrol ----------------------- */

/** Aynı saniyedeki çift tıklamayı engeller; bilinçli "yeniden üret" ~1 sn sonra çalışır. */
const MANUAL_COOLDOWN_MS = 1_000;

router.post("/check", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = String(req.userId);
    const settings = await getOrCreateSettings(userId);
    const now = Date.now();
    const dateKey = currentDateKey(settings.timezone);

    const lastManual = await MentorCheck.findOne({ userId, source: "manual" }).sort({
      createdAt: -1,
    });
    const elapsed = lastManual ? now - lastManual.createdAt.getTime() : Number.POSITIVE_INFINITY;
    if (lastManual && elapsed < MANUAL_COOLDOWN_MS) {
      return res.json({
        check: lastManual,
        throttled: true,
        retryAfterMs: Math.max(0, MANUAL_COOLDOWN_MS - elapsed),
      });
    }

    // Yeniden üret, ekrandaki eski bekleyen sorunun yerini alır; böylece
    // arka arkaya basınca kartlar birikmez.
    await MentorCheck.updateMany(
      { userId, status: "pending" },
      { $set: { status: "expired" } },
    );

    const check = await createCheck({
      userId,
      settings,
      dateKey,
      slot: "manual",
      // Her istek benzersiz olmalı; aksi halde createCheck eski mesajı döndürür.
      dedupeKey: `m:${dateKey}:${now}`,
      source: "manual",
    });

    res.json({ check, throttled: false, retryAfterMs: 0 });
  } catch (error) {
    console.error("Manual check error:", error);
    res.status(500).json({ error: "Kontrol oluşturulamadı" });
  }
});

/* --------------------------- cevaplama --------------------------- */

router.post("/respond", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { checkId, action, note, minutes, taskId } = req.body ?? {};

    if (!VALID_ACTIONS.includes(action)) {
      return res.status(400).json({ error: "Geçersiz cevap" });
    }
    if (note !== undefined && typeof note !== "string") {
      return res.status(400).json({ error: "Not metin olmalı" });
    }

    const result = await respondToCheck(String(req.userId), {
      checkId: typeof checkId === "string" ? checkId : undefined,
      action: action as MentorAction,
      note: typeof note === "string" ? note.slice(0, 500) : undefined,
      minutes: typeof minutes === "number" ? minutes : undefined,
      taskId: typeof taskId === "string" ? taskId : undefined,
    });

    if (!result) {
      return res.status(404).json({ error: "Kontrol bulunamadı" });
    }

    res.json(result);
  } catch (error) {
    console.error("Respond error:", error);
    res.status(500).json({ error: "Cevap kaydedilemedi" });
  }
});

/* ------------------------- aktivite kaydı ------------------------ */

router.post("/activity", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { kind, taskId, taskTitle, note } = req.body ?? {};
    const allowed = [
      "working_planned",
      "working_other",
      "resting",
      "free_time",
      "not_started",
      "interrupted",
      "blocked",
      "completed",
      "snoozed",
      "skipped",
    ];
    if (!allowed.includes(kind)) {
      return res.status(400).json({ error: "Geçersiz aktivite" });
    }

    const settings = await getOrCreateSettings(String(req.userId));
    const activity = await logActivity(String(req.userId), settings, {
      kind,
      taskId: typeof taskId === "string" ? taskId : null,
      taskTitle: typeof taskTitle === "string" ? taskTitle : null,
      note: typeof note === "string" ? note.slice(0, 500) : null,
      source: "manual",
    });

    res.json({ activity });
  } catch (error) {
    console.error("Activity error:", error);
    res.status(500).json({ error: "Aktivite kaydedilemedi" });
  }
});

/* --------------------------- daily launch ------------------------ */

router.get("/daily-launch", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = String(req.userId);
    const settings = await getOrCreateSettings(userId);
    const dateKey = currentDateKey(settings.timezone);

    const force =
      req.query.refresh === "1" || req.query.refresh === "true";

    // Kaç maddelik başlangıç: 3 / 5 / 10.
    const requested = Number(req.query.count);
    const count = [3, 5, 10].includes(requested) ? requested : 3;

    const ctx = await buildContext(userId, settings, dateKey);
    const cached = settings.dailyLaunch;

    if (!force && cached?.date === dateKey) {
      // Plan boşken üretilmiş genel metin, sonradan görev eklendiyse yenilenir.
      const staleGeneric = cached.source === "fallback" && ctx.plannedCount > 0;
      // Madde sayısı değiştiyse önbellek geçersiz.
      const countChanged = (cached.count ?? 3) !== count;
      if (!staleGeneric && !countChanged) return res.json({ launch: cached });
    }

    const launch = await generateDailyLaunch(ctx, dateKey, count);

    settings.dailyLaunch = launch;
    await settings.save();

    res.json({ launch });
  } catch (error) {
    console.error("Daily launch error:", error);
    res.status(500).json({ error: "Günlük plan oluşturulamadı" });
  }
});

/* ------------------------- ilk 5 dakika -------------------------- */

router.post("/first-steps", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { taskId, title, notes, minutes } = req.body ?? {};
    const requestedMinutes = Number(minutes);
    const stepMinutes = Number.isFinite(requestedMinutes)
      ? Math.min(240, Math.max(5, Math.round(requestedMinutes)))
      : 5;
    const fallbackTitle = typeof title === "string" ? title.trim().slice(0, 200) : "";
    if (typeof taskId !== "string" && !fallbackTitle) {
      return res.status(400).json({ error: "taskId veya title gerekli" });
    }

    const settings = await getOrCreateSettings(String(req.userId));
    const dateKey = currentDateKey(settings.timezone);
    const routine = await Routine.findOne({
      userId: req.userId,
      date: dateKey,
    });
    // Yeni eklenen görevler henüz sunucudaki _id ile eşleşmeyebilir;
    // bu durumda başlığa göre eşle, o da yoksa başlıkla adım üret.
    const task =
      (typeof taskId === "string"
        ? routine?.tasks.find((t) => String(t._id) === taskId)
        : undefined) ??
      (fallbackTitle
        ? routine?.tasks.find(
            (t) => t.title.trim().toLowerCase() === fallbackTitle.toLowerCase(),
          )
        : undefined);

    const taskTitle = task?.title ?? fallbackTitle;
    if (!taskTitle) {
      return res.status(404).json({ error: "Görev bulunamadı" });
    }

    const result = await generateFirstSteps(
      taskTitle,
      task?.notes ?? (typeof notes === "string" ? notes : null),
      stepMinutes,
    );

    if (task && !task.firstAction) {
      task.firstAction = result.steps[0];
      await routine?.save();
    }

    res.json({ ...result, minutes: stepMinutes });
  } catch (error) {
    console.error("First steps error:", error);
    res.status(500).json({ error: "Adımlar oluşturulamadı" });
  }
});

/* -------------------------- alt görevler ------------------------- */

// Görev başlığı + açıklamasından alt görev listesi çıkarır.
router.post("/subtasks", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const description =
      typeof req.body?.description === "string" ? req.body.description : "";
    if (!title && !description.trim()) {
      return res.status(400).json({ error: "Başlık veya açıklama gerekli" });
    }
    const result = await generateSubtasks(
      title || "Görev",
      description.slice(0, 2000),
    );
    res.json(result);
  } catch (error) {
    console.error("Subtasks error:", error);
    res.status(500).json({ error: "Alt görevler oluşturulamadı" });
  }
});

/* ------------------------- odak oturumları ----------------------- */

router.post("/focus-sessions", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const {
      mode,
      plannedMinutes,
      actualMinutes,
      completed,
      taskId,
      taskTitle,
      startedAt,
      endedAt,
    } = req.body ?? {};

    const session = await recordFocusSession(String(req.userId), {
      mode: mode === "short_break" || mode === "long_break" ? mode : "focus",
      plannedMinutes: Number(plannedMinutes) || 25,
      actualMinutes: Number(actualMinutes) || 0,
      completed: Boolean(completed),
      taskId: typeof taskId === "string" ? taskId : null,
      taskTitle: typeof taskTitle === "string" ? taskTitle : null,
      startedAt: Number(startedAt) || Date.now(),
      endedAt: Number(endedAt) || Date.now(),
    });

    res.json({ session });
  } catch (error) {
    console.error("Focus session error:", error);
    res.status(500).json({ error: "Oturum kaydedilemedi" });
  }
});

/* ------------------------------ AI ------------------------------- */

router.get("/ai-status", authMiddleware, (_req, res) => {
  res.json(getAiStatus());
});

/** Kullanıcının sonraki kontrol zamanı (ayar önizlemesi için). */
router.get("/next-check", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const settings = await getOrCreateSettings(String(req.userId));
    res.json({
      nextCheckAt: nextCheckInfo(settings)?.at ?? null,
      nextCheck: nextCheckAt(settings.hours, settings.timezone),
      enabled: settings.enabled,
    });
  } catch (error) {
    console.error("Next check error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    mongo: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

export default router;
