import { Router } from "express";
import { authMiddleware, type AuthRequest } from "../middleware/auth.js";
import { DiaryEntry } from "../models/Diary.js";
import { reflectOnDiary, suggestTasksFromDiary } from "../services/diary.js";
import {
  computeSummary,
  getOrCreateSettings,
} from "../services/accountability.js";
import { dateKeyInTz } from "../services/time.js";

const router = Router();

function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function pickText(value: unknown, max = 4000): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

router.get("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 90);
    const entries = await DiaryEntry.find({ userId: req.userId })
      .sort({ dateKey: -1 })
      .limit(limit)
      .select("-__v");
    res.json(entries);
  } catch (error) {
    console.error("Diary list error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

/* Yeni girişler route sırası nedeniyle /:date'ten önce gelmeli */
router.post("/:date/suggest-tasks", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    if (!validDate(date)) {
      return res.status(400).json({ error: "Geçersiz tarih" });
    }
    const existing = await DiaryEntry.findOne({ userId: req.userId, dateKey: date });
    if (!existing) {
      return res.status(404).json({ error: "Bu tarihte günlük kaydı yok" });
    }

    const result = await suggestTasksFromDiary({
      dateKey: existing.dateKey,
      highlights: existing.highlights,
      progress: existing.progress,
      learnings: existing.learnings,
      blockers: existing.blockers,
      nextSteps: existing.nextSteps,
      tags: existing.tags,
    });

    res.json(result);
  } catch (error) {
    console.error("Diary suggest error:", error);
    res.status(500).json({ error: "Görev önerisi üretilemedi" });
  }
});

router.post("/:date/reflect", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    if (!validDate(date)) {
      return res.status(400).json({ error: "Geçersiz tarih" });
    }
    const existing = await DiaryEntry.findOne({ userId: req.userId, dateKey: date });
    if (!existing) {
      return res.status(404).json({ error: "Bu tarihte günlük kaydı yok" });
    }

    const settings = await getOrCreateSettings(String(req.userId));
    const summary = await computeSummary(String(req.userId), date);
    const todayKey = dateKeyInTz(new Date(), settings.timezone);

    const result = await reflectOnDiary(
      {
        dateKey: existing.dateKey,
        highlights: existing.highlights,
        progress: existing.progress,
        learnings: existing.learnings,
        blockers: existing.blockers,
        nextSteps: existing.nextSteps,
        tags: existing.tags,
      },
      {
        planned: date === todayKey ? summary.planned : 0,
        completed: date === todayKey ? summary.completed : 0,
        focusMinutes: date === todayKey ? summary.focusMinutes : 0,
        overdue: date === todayKey ? summary.overdue : 0,
      },
    );

    res.json(result);
  } catch (error) {
    console.error("Diary reflect error:", error);
    res.status(500).json({ error: "Yorum üretilemedi" });
  }
});

router.get("/:date", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    if (!validDate(date)) {
      return res.status(400).json({ error: "Geçersiz tarih" });
    }
    const entry = await DiaryEntry.findOne({
      userId: req.userId,
      dateKey: date,
    }).select("-__v");
    res.json(entry ?? null);
  } catch (error) {
    console.error("Diary get error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

router.put("/:date", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    if (!validDate(date)) {
      return res.status(400).json({ error: "Geçersiz tarih" });
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const clamp = (value: unknown, fallback: number) => {
      const n = Number(value);
      return Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n))) : fallback;
    };

    const tags = Array.isArray(body.tags)
      ? [...new Set(body.tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim().slice(0, 30)))].slice(0, 10)
      : [];

    const entry = await DiaryEntry.findOneAndUpdate(
      { userId: req.userId, dateKey: date },
      {
        dateKey: date,
        mood: clamp(body.mood, 3),
        energy: clamp(body.energy, 3),
        highlights: pickText(body.highlights),
        progress: pickText(body.progress),
        learnings: pickText(body.learnings),
        blockers: pickText(body.blockers),
        nextSteps: pickText(body.nextSteps),
        tags,
      },
      { new: true, upsert: true, runValidators: true, returnDocument: "after" },
    ).select("-__v");

    res.json(entry);
  } catch (error) {
    console.error("Diary save error:", error);
    res.status(500).json({ error: "Günlük kaydedilemedi" });
  }
});

router.delete("/:date", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    if (!validDate(date)) {
      return res.status(400).json({ error: "Geçersiz tarih" });
    }
    await DiaryEntry.findOneAndDelete({ userId: req.userId, dateKey: date });
    res.json({ success: true });
  } catch (error) {
    console.error("Diary delete error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

export default router;
