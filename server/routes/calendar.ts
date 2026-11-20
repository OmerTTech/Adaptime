import { Router } from "express";
import { User } from "../models/User.js";
import { Routine } from "../models/Routine.js";
import { dateKeyInTz } from "../services/time.js";

const router = Router();

function icsDate(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Salt-okunur ICS aboneliği: Google/Apple Takvim bu adresi periyodik okur.
 * Kimlik doğrulama yok; URL'deki rastgele jeton erişim anahtarıdır.
 * Yalnızca saatli, tamamlanmamış görevler dışa aktarılır.
 */
router.get("/:token", async (req, res) => {
  try {
    const token = String(req.params.token ?? "").replace(/\.ics$/i, "");
    if (!token || token.length < 16) {
      return res.status(404).type("text/plain").send("Not found");
    }
    const user = await User.findOne({ calendarToken: token }).select("_id");
    if (!user) return res.status(404).type("text/plain").send("Not found");

    const from = new Date();
    from.setDate(from.getDate() - 30);
    const to = new Date();
    to.setDate(to.getDate() + 60);
    const fromKey = dateKeyInTz(from, "Asia/Baku");
    const toKey = dateKeyInTz(to, "Asia/Baku");

    const routines = await Routine.find({
      userId: user._id,
      date: { $gte: fromKey, $lte: toKey },
    })
      .select("date tasks")
      .limit(120);

    const stamp = icsDate(Date.now());
    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Adaptime//TR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Adaptime",
      "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
      "X-PUBLISHED-TTL:PT15M",
    ];

    for (const routine of routines) {
      for (const task of routine.tasks) {
        if (typeof task.startTime !== "number" || typeof task.endTime !== "number") {
          continue;
        }
        if (task.status === "completed" || task.status === "skipped") continue;
        const id = String((task as { _id?: unknown })._id ?? task.title);
        lines.push(
          "BEGIN:VEVENT",
          `UID:${routine.date}-${id}@adaptime`,
          `DTSTAMP:${stamp}`,
          `DTSTART:${icsDate(task.startTime)}`,
          `DTEND:${icsDate(task.endTime)}`,
          `SUMMARY:${escapeIcs(task.title)}`,
          task.description ? `DESCRIPTION:${escapeIcs(task.description)}` : "",
          "END:VEVENT",
        );
      }
    }

    lines.push("END:VCALENDAR");
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=900");
    res.send(lines.filter(Boolean).join("\r\n"));
  } catch (error) {
    console.error("Calendar ICS error:", error);
    res.status(500).type("text/plain").send("Calendar error");
  }
});

export default router;
