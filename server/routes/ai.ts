import { Router } from "express";
import { authMiddleware } from "../middleware/auth.js";
import { extractJson, generateText, GeminiError } from "../services/gemini.js";
import { GEMINI_MODEL } from "../config/ai.js";

const router = Router();

const SYSTEM_PROMPT = `Sen Adaptime rutin asistanısın. Kullanıcı doğal dille günlük planını anlatacak.
Sen sadece JSON array döndüreceksin. Başka hiçbir metin yazma.

Kurallar:
- Her görev için { title, startHHMM, endHHMM } formatında JSON dön
- Dinlenme sürelerini %20 olarak ekle (2 saatlik görevden sonra 24dk mola)
- Çakışma yok, saatler çaprazlama olmasın
- Renk verme, frontend kendi atayacak
- Sadece JSON array dön, başka hiçbir şey yazma

Örnek çıktı:
[
  { "title": "Kodlama Çalışması", "startHHMM": "14:00", "endHHMM": "16:00" },
  { "title": "Mola", "startHHMM": "16:00", "endHHMM": "16:20" },
  { "title": "İngilizce", "startHHMM": "16:20", "endHHMM": "18:20" }
]`;

interface GeneratedTask {
  title: string;
  startHHMM: string;
  endHHMM: string;
}

function sanitizeTasks(value: unknown): GeneratedTask[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((t): t is Record<string, unknown> => Boolean(t) && typeof t === "object")
    .map((t) => ({
      title: String(t.title ?? "").slice(0, 120),
      startHHMM: String(t.startHHMM ?? ""),
      endHHMM: String(t.endHHMM ?? ""),
    }))
    .filter(
      (t) =>
        t.title.length > 0 &&
        /^\d{1,2}:\d{2}$/.test(t.startHHMM) &&
        /^\d{1,2}:\d{2}$/.test(t.endHHMM),
    )
    .slice(0, 12);
}

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Prompt gerekli" });
    }

    try {
      const text = await generateText({
        prompt: `${SYSTEM_PROMPT}\n\nKullanıcı: ${prompt.slice(0, 1200)}`,
        temperature: 0.3,
        maxOutputTokens: 1024,
      });

      const parsed = extractJson<unknown>(text);
      const tasks = sanitizeTasks(parsed);
      if (tasks.length === 0) {
        throw new Error("AI geçerli bir plan üretemedi");
      }

      return res.json({ tasks, source: "ai", model: GEMINI_MODEL });
    } catch (aiError) {
      if (aiError instanceof GeminiError && aiError.code === "no_keys") {
        return res.json({ tasks: parseDemoPrompt(prompt), source: "demo" });
      }
      console.warn(
        "AI rutin üretimi başarısız, yerel plana düşülüyor:",
        aiError instanceof Error ? aiError.message : aiError,
      );
      return res.json({ tasks: parseDemoPrompt(prompt), source: "fallback" });
    }
  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

function parseDemoPrompt(prompt: string) {
  const tasks: GeneratedTask[] = [];

  const timeRanges = prompt.match(
    /(\d{1,2})[:\s](\d{2})\s*[-–]\s*(\d{1,2})[:\s](\d{2})/g,
  );

  if (timeRanges) {
    for (const range of timeRanges) {
      const match = range.match(
        /(\d{1,2})[:\s](\d{2})\s*[-–]\s*(\d{1,2})[:\s](\d{2})/,
      );
      if (match) {
        const start = `${match[1].padStart(2, "0")}:${match[2].padStart(2, "0")}`;
        const end = `${match[3].padStart(2, "0")}:${match[4].padStart(2, "0")}`;
        tasks.push({ title: "Görev", startHHMM: start, endHHMM: end });
      }
    }
  }

  if (tasks.length === 0) {
    tasks.push(
      { title: "Kodlama Çalışması", startHHMM: "14:00", endHHMM: "16:00" },
      { title: "Mola", startHHMM: "16:00", endHHMM: "16:20" },
      { title: "İngilizce", startHHMM: "16:20", endHHMM: "18:20" },
    );
  }

  return tasks;
}

export default router;
