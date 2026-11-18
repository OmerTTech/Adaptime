import { Router } from "express";
import mongoose from "mongoose";
import { authMiddleware, type AuthRequest } from "../middleware/auth.js";
import { Routine } from "../models/Routine.js";
import { RoutineBackup } from "../models/RoutineBackup.js";

const router = Router();

/** Son 7 günün otomatik yedekleri (en yeni önce). */
router.get("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const items = await RoutineBackup.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(7)
      .select("dateKey createdAt routines");

    res.json({
      items: items.map((backup) => ({
        id: String(backup._id),
        dateKey: backup.dateKey,
        createdAt: backup.createdAt,
        days: backup.routines.length,
        tasks: backup.routines.reduce(
          (total, day) => total + (day.tasks?.length ?? 0),
          0,
        ),
      })),
    });
  } catch (error) {
    console.error("Backup list error:", error);
    res.status(500).json({ error: "Yedekler getirilemedi" });
  }
});

/** Yedeği geri yükle: günler tek tek yazılır, revision artırılır. */
router.post("/:id/restore", authMiddleware, async (req: AuthRequest, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "Geçersiz yedek" });
    }
    const backup = await RoutineBackup.findOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!backup) {
      return res.status(404).json({ error: "Yedek bulunamadı" });
    }

    let restored = 0;
    for (const day of backup.routines) {
      if (!day.date) continue;
      const existing = await Routine.findOne({
        userId: req.userId,
        date: day.date,
      });
      await Routine.findOneAndUpdate(
        { userId: req.userId, date: day.date },
        {
          date: day.date,
          tasks: day.tasks ?? [],
          dayEndTime: day.dayEndTime ?? 0,
          streak: day.streak ?? 0,
          revision: (existing?.revision ?? 0) + 1,
        },
        { upsert: true, runValidators: true },
      );
      restored += 1;
    }

    res.json({ ok: true, restored });
  } catch (error) {
    console.error("Backup restore error:", error);
    res.status(500).json({ error: "Yedek geri yüklenemedi" });
  }
});

export default router;
