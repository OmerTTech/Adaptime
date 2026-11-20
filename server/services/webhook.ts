import { User } from "../models/User.js";

/**
 * Giden webhook (4.2): görev tamamlandığında kullanıcının verdiği adrese
 * tek bir JSON olayı gönderir. Yanıt beklenmez, hata kullanıcı akışını
 * etkilemez; 5 saniyede kesilir.
 */
export async function sendWebhook(
  userId: string,
  payload: Record<string, unknown>,
): Promise<boolean> {
  try {
    const user = await User.findById(userId).select("webhookUrl");
    const url = user?.webhookUrl;
    if (!url) return false;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Adaptime-Webhook/1.0",
        },
        body: JSON.stringify({
          source: "adaptime",
          sentAt: new Date().toISOString(),
          ...payload,
        }),
        signal: controller.signal,
      });
      return res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    console.error(
      "[webhook] gönderilemedi:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
