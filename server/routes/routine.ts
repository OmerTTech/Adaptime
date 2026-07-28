import { Router } from "express";
import { Routine, type ITaskBlock } from "../models/Routine.js";
import { authMiddleware, type AuthRequest } from "../middleware/auth.js";

const router = Router();

// Get routine for a specific date
router.get("/:date", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
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

// Get streak
router.get("/streak", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const routines = await Routine.find({ userId: req.userId })
      .sort({ date: -1 })
      .limit(30)
      .select("date streak tasks");

    const totalStreak = routines.reduce((max, r) => Math.max(max, r.streak), 0);
    const activeDays = routines.filter((r) =>
      r.tasks.some((t: ITaskBlock) => t.status === "completed"),
    ).length;

    res.json({ totalStreak, activeDays });
  } catch (error) {
    console.error("Get streak error:", error);
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

export default router;
