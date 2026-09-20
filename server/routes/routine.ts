import { Router } from "express";
import { Routine, type ITaskBlock } from "../models/Routine.js";
import { authMiddleware, type AuthRequest } from "../middleware/auth.js";

const router = Router();

function parseDate(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (
    d.getFullYear() !== Number(m[1]) ||
    d.getMonth() !== Number(m[2]) - 1 ||
    d.getDate() !== Number(m[3])
  ) {
    return null;
  }
  return d;
}

function dateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Gerçek streak: bugün ya da dün "completed" görev içeren ve
 * kesintisiz devam eden gün sayısı. Bugün (henüz tamamlanmamış olsa bile)
 * seriyi kırmaz; dünden itibaren geriye sayar.
 */
router.get("/streak", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const routines = await Routine.find({ userId: req.userId })
      .sort({ date: -1 })
      .select("date tasks");

    const completedDates = new Set(
      routines
        .filter((r) =>
          r.tasks.some((t: ITaskBlock) => t.status === "completed"),
        )
        .map((r) => r.date),
    );

    const today = new Date();
    const hasToday = completedDates.has(dateString(today));
    let cursor = new Date(today);
    if (!hasToday) cursor.setDate(cursor.getDate() - 1);

    let streak = 0;
    while (completedDates.has(dateString(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    const startedDates = new Set(routines.map((r) => r.date));

    res.json({
      currentStreak: streak,
      completedDates: [...completedDates],
      totalDates: [...startedDates],
      todayIsCompleted: hasToday,
    });
  } catch (error) {
    console.error("Get streak error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Get recent history (last n days)
router.get("/history", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 90);
    const routines = await Routine.find({ userId: req.userId })
      .sort({ date: -1 })
      .limit(limit)
      .select("date tasks dayEndTime streak");

    res.json(routines);
  } catch (error) {
    console.error("Get history error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Get routine for a specific date (must be defined AFTER /streak & /history)
router.get("/:date", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    if (typeof date !== "string" || !parseDate(date)) {
      return res.status(400).json({ error: "Geçersiz tarih formatı" });
    }

    const routine = await Routine.findOne({
      userId: req.userId,
      date,
    }).select("-__v");

    if (!routine) {
      return res.json(null);
    }

    res.json(routine);
  } catch (error) {
    console.error("Get routine error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Create or update routine
router.post("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { date, tasks, dayEndTime, streak } = req.body;
    if (!date) {
      return res.status(400).json({ error: "Tarih gerekli" });
    }

    const routine = await Routine.findOneAndUpdate(
      { userId: req.userId, date },
      {
        date,
        tasks: tasks || [],
        dayEndTime: dayEndTime || 0,
        streak: streak || 0,
      },
      { new: true, upsert: true, runValidators: true },
    ).select("-__v");

    res.json(routine);
  } catch (error) {
    console.error("Save routine error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Update tasks in a routine
router.put("/:date/tasks", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    const { tasks, dayEndTime } = req.body;

    const routine = await Routine.findOneAndUpdate(
      { userId: req.userId, date },
      {
        tasks: tasks || [],
        dayEndTime: dayEndTime || 0,
      },
      { new: true, runValidators: true },
    ).select("-__v");

    if (!routine) {
      return res.status(404).json({ error: "Rutin bulunamadı" });
    }

    res.json(routine);
  } catch (error) {
    console.error("Update tasks error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Delete routine
router.delete("/:date", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    await Routine.findOneAndDelete({ userId: req.userId, date });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete routine error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Delete ALL routines for the user (reset)
router.delete("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    await Routine.deleteMany({ userId: req.userId });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete all routines error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

export default router;
