import { Router } from "express";
import { isCronAuthorized, runCronTickOnce } from "../services/cron.js";

const router = Router();

/**
 * Harici zamanlayıcı ucu (GitHub Actions / cron-job.org).
 * `x-cron-secret` başlığı ya da `Authorization: Bearer <CRON_SECRET>` gerekir.
 */
async function handleTick(
  req: import("express").Request,
  res: import("express").Response,
) {
  const secret = req.headers["x-cron-secret"] as string | undefined;
  if (!isCronAuthorized(secret, req.headers.authorization)) {
    return res.status(401).json({ error: "Yetkisiz" });
  }
  try {
    const result = await runCronTickOnce();
    res.json(result);
  } catch (error) {
    console.error("Cron tick error:", error);
    res.status(500).json({ error: "Cron çalıştırılamadı" });
  }
}

router.get("/tick", handleTick);
router.post("/tick", handleTick);

export default router;
