import { Router } from "express";
import { PushSubscription } from "../models/PushSubscription.js";
import { authMiddleware, type AuthRequest } from "../middleware/auth.js";
import {
  pushEnabled,
  sendPushToUser,
  vapidPublicKey,
} from "../services/push.js";

const router = Router();

interface IncomingSubscription {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

// Tarayıcının abone olurken ihtiyaç duyduğu genel anahtar.
router.get("/key", (_req, res) => {
  res.json({ publicKey: vapidPublicKey, enabled: pushEnabled });
});

router.post("/subscribe", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const subscription = req.body?.subscription as IncomingSubscription | undefined;
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const auth = subscription?.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ error: "Geçersiz abonelik" });
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        $set: {
          userId: req.userId,
          endpoint,
          p256dh,
          auth,
          userAgent: req.headers["user-agent"] ?? undefined,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.json({ ok: true, enabled: pushEnabled });
  } catch (error) {
    console.error("Push subscribe error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

router.post("/unsubscribe", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const endpoint = req.body?.endpoint as string | undefined;
    if (endpoint) {
      await PushSubscription.deleteOne({ endpoint, userId: req.userId });
    } else {
      await PushSubscription.deleteMany({ userId: req.userId });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error("Push unsubscribe error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

router.get("/status", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const count = await PushSubscription.countDocuments({ userId: req.userId });
    res.json({ subscribed: count, enabled: pushEnabled });
  } catch (error) {
    console.error("Push status error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Ayarlardan "Test bildirimi" için.
router.post("/test", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = await sendPushToUser(String(req.userId), {
      title: "Adaptime bildirimleri açık",
      body: "Görev saatlerinde burada olacağım. Bu bir test bildirimi.",
      tag: "adaptime-test",
      url: "/",
    });
    if (!result.enabled) {
      return res.status(503).json({
        error: "Sunucuda VAPID anahtarları tanımlı değil.",
      });
    }
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error("Push test error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

export default router;
