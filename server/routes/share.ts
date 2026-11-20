import { Router } from "express";
import { User } from "../models/User.js";
import { Routine } from "../models/Routine.js";
import { sendPushToUser } from "../services/push.js";

const router = Router();

/** Dürtmeler arasında en az 3 saat: tek yönlü, spam korumalı (4.1). */
const NUDGE_COOLDOWN_MS = 3 * 60 * 60 * 1000;

function todayKey(): string {
  return new Date().toLocaleDateString("sv-SE");
}

/**
 * Herkese açık salt-okunur plan (4.1).
 * Yalnızca başlık, saat, durum ve öncelik döner; günlük/not gibi özel
 * alanlar paylaşılmaz.
 */
router.get("/:token", async (req, res) => {
  try {
    const token = String(req.params.token || "");
    if (token.length < 16) {
      return res.status(404).json({ error: "Paylaşım linki geçersiz" });
    }
    const user = await User.findOne({ shareToken: token }).select(
      "name shareToken",
    );
    if (!user) {
      return res.status(404).json({ error: "Paylaşım linki geçersiz" });
    }

    const date =
      typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : todayKey();

    const routine = await Routine.findOne({ userId: user._id, date });
    const tasks = (routine?.tasks ?? []).map((task) => ({
      title: task.title,
      status: task.status,
      priority: task.priority ?? "medium",
      startTime: task.startTime ?? null,
      endTime: task.endTime ?? null,
      estimatedMinutes: task.estimatedMinutes ?? null,
      completedAt: task.completedAt ?? null,
    }));

    const open = tasks.filter(
      (t) => t.status !== "completed" && t.status !== "skipped",
    ).length;
    const done = tasks.filter((t) => t.status === "completed").length;

    res.set("Cache-Control", "no-store");
    res.json({
      owner: user.name,
      date,
      streak: routine?.streak ?? 0,
      counts: { total: tasks.length, open, done },
      tasks,
    });
  } catch (error) {
    console.error("Share view error:", error);
    res.status(500).json({ error: "Plan getirilemedi" });
  }
});

/** Partner dürtmesi: sahibine tek yönlü push gönderir. */
router.post("/:token/nudge", async (req, res) => {
  try {
    const token = String(req.params.token || "");
    const user = await User.findOne({ shareToken: token }).select(
      "name shareNudgeAt",
    );
    if (!user) {
      return res.status(404).json({ error: "Paylaşım linki geçersiz" });
    }

    const last = user.shareNudgeAt?.getTime() ?? 0;
    const waitMs = NUDGE_COOLDOWN_MS - (Date.now() - last);
    if (waitMs > 0) {
      return res.status(429).json({
        error: "Bugün için yeterince dürtüldü.",
        retryInMinutes: Math.ceil(waitMs / 60000),
      });
    }

    user.shareNudgeAt = new Date();
    await user.save();

    const routine = await Routine.findOne({
      userId: user._id,
      date: todayKey(),
    });
    const next = (routine?.tasks ?? []).find(
      (task) =>
        task.status !== "completed" &&
        task.status !== "skipped" &&
        task.startTime,
    );

    await sendPushToUser(String(user._id), {
      title: "Plan ortağın soruyor",
      body: next
        ? `“Başladın mı?” Sıradaki görev: ${next.title}`
        : "“Başladın mı?” Bugünün planına bir göz at.",
      url: "/",
      tag: "partner-nudge",
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("Share nudge error:", error);
    res.status(500).json({ error: "Dürtme gönderilemedi" });
  }
});

export default router;
