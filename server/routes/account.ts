import { Router } from "express";
import { authMiddleware, type AuthRequest } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Routine } from "../models/Routine.js";
import { RoutineBackup } from "../models/RoutineBackup.js";
import { DiaryEntry } from "../models/Diary.js";
import { PushSubscription } from "../models/PushSubscription.js";
import { TaskArchive } from "../models/Archive.js";
import {
  ActivityLog,
  FocusSession,
  MentorCheck,
  MentorSettings,
} from "../models/Accountability.js";
import { sendWebhook } from "../services/webhook.js";

const router = Router();

/** Takvim aboneliği için kalıcı, tahmin edilemez jeton. */
router.get("/calendar-token", authMiddleware, async (req: AuthRequest, res) => {
  try {
    let user = await User.findById(req.userId).select("calendarToken");
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    if (!user.calendarToken) {
      user.calendarToken = crypto.randomUUID().replace(/-/g, "");
      await user.save();
    }
    res.json({ token: user.calendarToken });
  } catch (error) {
    console.error("Calendar token error:", error);
    res.status(500).json({ error: "Takvim jetonu üretilemedi" });
  }
});

/** Jetonu yenile: eski abonelik linkleri geçersiz olur. */
router.post("/calendar-token/rotate", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.userId).select("calendarToken");
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    user.calendarToken = crypto.randomUUID().replace(/-/g, "");
    await user.save();
    res.json({ token: user.calendarToken });
  } catch (error) {
    console.error("Calendar rotate error:", error);
    res.status(500).json({ error: "Jeton yenilenemedi" });
  }
});

/** Plan paylaşımı: salt-okunur jeton (yoksa üretilir). */
router.get("/share-token", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.userId).select("shareToken");
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    if (!user.shareToken) {
      user.shareToken = crypto.randomUUID().replace(/-/g, "");
      await user.save();
    }
    res.json({ token: user.shareToken });
  } catch (error) {
    console.error("Share token error:", error);
    res.status(500).json({ error: "Paylaşım jetonu üretilemedi" });
  }
});

/** Jetonu yenile: eski paylaşım linkleri geçersiz olur. */
router.post("/share-token/rotate", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.userId).select("shareToken");
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    user.shareToken = crypto.randomUUID().replace(/-/g, "");
    await user.save();
    res.json({ token: user.shareToken });
  } catch (error) {
    console.error("Share rotate error:", error);
    res.status(500).json({ error: "Paylaşım jetonu yenilenemedi" });
  }
});

/** Paylaşımı kapat: linki tamamen geçersiz kılar. */
router.delete("/share-token", authMiddleware, async (req: AuthRequest, res) => {
  try {
    await User.updateOne({ _id: req.userId }, { $unset: { shareToken: 1 } });
    res.json({ ok: true });
  } catch (error) {
    console.error("Share disable error:", error);
    res.status(500).json({ error: "Paylaşım kapatılamadı" });
  }
});

/** Giden webhook adresi (4.2). */
router.get("/webhook", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.userId).select("webhookUrl");
    res.json({ url: user?.webhookUrl ?? null });
  } catch (error) {
    console.error("Webhook read error:", error);
    res.status(500).json({ error: "Webhook okunamadı" });
  }
});

router.put("/webhook", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const raw = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    if (!raw) return res.status(400).json({ error: "Adres gerekli" });
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      return res.status(400).json({ error: "Geçersiz adres" });
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return res.status(400).json({ error: "Yalnızca http(s) adresleri" });
    }
    await User.updateOne({ _id: req.userId }, { webhookUrl: raw });
    res.json({ url: raw });
  } catch (error) {
    console.error("Webhook save error:", error);
    res.status(500).json({ error: "Webhook kaydedilemedi" });
  }
});

router.delete("/webhook", authMiddleware, async (req: AuthRequest, res) => {
  try {
    await User.updateOne({ _id: req.userId }, { $unset: { webhookUrl: 1 } });
    res.json({ ok: true });
  } catch (error) {
    console.error("Webhook delete error:", error);
    res.status(500).json({ error: "Webhook kaldırılamadı" });
  }
});

/** Kayıtlı adrese örnek bir olay gönderir. */
router.post("/webhook/test", authMiddleware, async (req: AuthRequest, res) => {
  const ok = await sendWebhook(String(req.userId), {
    event: "webhook.test",
    message: "Adaptime webhook bağlantısı çalışıyor.",
  });
  res.json({ ok });
});

/**
 * Hesabı ve tüm verileri siler (KVKK/GDPR). Geri alınamaz.
 * İstemci bunun öncesinde açık onay ister.
 */
router.delete("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: "Yetkisiz" });

    await Promise.all([
      Routine.deleteMany({ userId }),
      RoutineBackup.deleteMany({ userId }),
      DiaryEntry.deleteMany({ userId }),
      PushSubscription.deleteMany({ userId }),
      TaskArchive.deleteMany({ userId }),
      MentorCheck.deleteMany({ userId }),
      ActivityLog.deleteMany({ userId }),
      FocusSession.deleteMany({ userId }),
      MentorSettings.deleteMany({ userId }),
    ]);
    await User.deleteOne({ _id: userId });
    res.json({ ok: true });
  } catch (error) {
    console.error("Account delete error:", error);
    res.status(500).json({ error: "Hesap silinemedi" });
  }
});

export default router;
