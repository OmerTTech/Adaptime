import { Router } from "express";

const router = Router();

const GEMINI_API_KEYS: string[] = (() => {
  try {
    const raw = process.env.GEMINI_API_KEYS || "[]";
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((k: unknown) => typeof k === "string" && k.length > 0)
      : [];
  } catch {
    return [];
  }
})();

const GEMINI_MODEL = "gemini-3.1-flash-lite";

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

async function callGemini(key: string, prompt: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      contents: [
        { parts: [{ text: `${SYSTEM_PROMPT}\n\nKullanıcı: ${prompt}` }] },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (response.status === 429) {
    return { rateLimited: true as const };
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("AI geçerli JSON üretemedi");
  }

  return { tasks: JSON.parse(jsonMatch[0]) };
}

router.post("/", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt gerekli" });
    }

    if (GEMINI_API_KEYS.length === 0) {
      const demoTasks = parseDemoPrompt(prompt);
      return res.json({ tasks: demoTasks });
    }

    for (const key of GEMINI_API_KEYS) {
      const result = await callGemini(key, prompt);
      if (result.rateLimited) {
        console.warn(`API key rate limited, switching to next key...`);
        continue;
      }
      return res.json(result);
    }

    console.error("All API keys exhausted or rate limited");
    return res
      .status(500)
      .json({ error: "Tüm API anahtarları kota limitine ulaştı" });
  } catch (error) {
    console.error("AI Error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

function parseDemoPrompt(prompt: string) {
  const tasks: Array<{ title: string; startHHMM: string; endHHMM: string }> =
    [];

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
