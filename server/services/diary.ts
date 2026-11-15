import { generateText, extractJson } from "./gemini.js";

/**
 * Günlük → görev önerisi ve mentor yorumu.
 * AI yoksa/kotadaysa metin tabanlı yerel çıkarım kullanılır.
 */

export type SuggestedPriority = "critical" | "high" | "medium" | "low";
export type SuggestedCategory = "work" | "study" | "personal" | "health" | "other";

export interface TaskSuggestion {
  title: string;
  reason: string;
  priority: SuggestedPriority;
  estimatedMinutes: number;
  category: SuggestedCategory;
}

export interface DiaryText {
  dateKey: string;
  highlights: string;
  progress: string;
  learnings: string;
  blockers: string;
  nextSteps: string;
  tags: string[];
}

const PRIORITIES: SuggestedPriority[] = ["critical", "high", "medium", "low"];
const CATEGORIES: SuggestedCategory[] = ["work", "study", "personal", "health", "other"];

function sanitizeSuggestion(value: unknown): TaskSuggestion | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const title = String(raw.title ?? "").trim().slice(0, 120);
  if (!title) return null;
  const estimated = Number(raw.estimatedMinutes);
  return {
    title,
    reason: String(raw.reason ?? "").trim().slice(0, 200),
    priority: PRIORITIES.includes(raw.priority as SuggestedPriority)
      ? (raw.priority as SuggestedPriority)
      : "medium",
    estimatedMinutes:
      Number.isFinite(estimated) && estimated > 0
        ? Math.min(480, Math.max(5, Math.round(estimated)))
        : 30,
    category: CATEGORIES.includes(raw.category as SuggestedCategory)
      ? (raw.category as SuggestedCategory)
      : "work",
  };
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n|;|•|\u2022/)
    .map((l) => l.replace(/^\s*[-*\d.)]+\s*/, "").trim())
    .filter((l) => l.length >= 4);
}

function inferCategory(text: string): SuggestedCategory {
  const t = text.toLocaleLowerCase("tr-TR");
  if (/(spor|yürü|uyku|sağlık|su iç|egzersiz|diyet)/.test(t)) return "health";
  if (/(ders|sınav|ödev|kitap|oku|ingilizce|matematik|çalış)/.test(t)) return "study";
  if (/(kod|proje|müşteri|toplantı|rapor|iş|deploy|bug)/.test(t)) return "work";
  if (/(aile|arkadaş|ev|alışveriş|kişisel)/.test(t)) return "personal";
  return "other";
}

function inferPriority(text: string): SuggestedPriority {
  const t = text.toLocaleLowerCase("tr-TR");
  if (/(acil|bugün|hemen|kritik|deadline|son gün)/.test(t)) return "critical";
  if (/(önemli|yarın|bitir|tamamla)/.test(t)) return "high";
  if (/(belki|ileride|zamanı gelince)/.test(t)) return "low";
  return "medium";
}

/** AI olmadan günlük metninden görev çıkarımı. */
export function fallbackSuggestions(diary: DiaryText): TaskSuggestion[] {
  const candidates = [
    ...lines(diary.nextSteps),
    ...lines(diary.blockers),
    ...lines(diary.learnings),
  ].slice(0, 8);

  const suggestions: TaskSuggestion[] = candidates.map((line) => ({
    title: line.slice(0, 120),
    reason: "Günlüğündeki nottan çıkarıldı",
    priority: inferPriority(line),
    estimatedMinutes: 30,
    category: inferCategory(line),
  }));

  if (suggestions.length === 0) {
    suggestions.push({
      title: "Günlüğünü gözden geçir ve bugünün tek önceliğini seç",
      reason: "Günlükte net bir sonraki adım yok",
      priority: "medium",
      estimatedMinutes: 15,
      category: "personal",
    });
  }

  return suggestions.slice(0, 6);
}

export async function suggestTasksFromDiary(diary: DiaryText): Promise<{
  suggestions: TaskSuggestion[];
  source: "ai" | "fallback";
}> {
  const fallback = fallbackSuggestions(diary);

  try {
    const text = await generateText({
      prompt: `Günlük kaydı:
- Tarih: ${diary.dateKey}
- Neler oldu: ${diary.highlights}
- İlerleme: ${diary.progress}
- Öğrendiklerim: ${diary.learnings}
- Engel/tıkanma: ${diary.blockers}
- Sonraki adımlar: ${diary.nextSteps}
- Etiketler: ${diary.tags.join(", ")}

Bu günlükten en fazla 6 somut, bugün/yarın yapılabilir görev çıkar.
Her görev için {"title","reason","priority","estimatedMinutes","category"} alanlarını kullan.
priority: critical|high|medium|low, category: work|study|personal|health|other.
Başlıklar kısa ve eyleme dönük olsun. Sadece JSON döndür: {"tasks":[...]}`,
      system:
        "Sen bir üretkenlik koçusun. Kullanıcının günlüğünden gerçekçi görevler çıkarırsın. Sadece JSON döndür.",
      temperature: 0.5,
      maxOutputTokens: 700,
    });

    const parsed = extractJson<{ tasks?: unknown }>(text);
    const list = Array.isArray(parsed?.tasks) ? parsed.tasks : [];
    const suggestions = list
      .map(sanitizeSuggestion)
      .filter((s): s is TaskSuggestion => Boolean(s))
      .slice(0, 6);

    if (suggestions.length > 0) return { suggestions, source: "ai" };
    return { suggestions: fallback, source: "fallback" };
  } catch {
    return { suggestions: fallback, source: "fallback" };
  }
}

export async function reflectOnDiary(
  diary: DiaryText,
  stats: { planned: number; completed: number; focusMinutes: number; overdue: number },
): Promise<{ message: string; source: "ai" | "fallback" }> {
  const fallback =
    `Bugün ${stats.completed}/${stats.planned} görev tamamladın ve ${stats.focusMinutes} dk odak kaydın var. ` +
    (diary.nextSteps
      ? `Günlüğünde "${lines(diary.nextSteps)[0] ?? diary.nextSteps.slice(0, 80)}" diye not almışsın; yarın ilk adım bu olsun.`
      : "Yarın için tek bir somut adım belirle; günlüğe yazdığın öğrendiklerini göreve dönüştür.");

  try {
    const text = await generateText({
      prompt: `Kullanıcının günlüğü:
Neler oldu: ${diary.highlights}
İlerleme: ${diary.progress}
Öğrendiklerim: ${diary.learnings}
Engel: ${diary.blockers}
Sonraki adımlar: ${diary.nextSteps}

Bugünün sayıları: planlanan ${stats.planned}, tamamlanan ${stats.completed}, odak ${stats.focusMinutes} dk, geciken ${stats.overdue}.

Bu günlüğe 2-3 cümlelik mentor yorumu yaz: gerçek ilerlemeyi fark et, bir öğrenmeyi pekiştir, yarın için tek bir sonraki adım öner.
Markdown ve emoji kullanma. Sadece yorum metnini döndür.`,
      system:
        "Sen kısa, net ve stratejik bir kişisel mentor sün. Sadece metin döndür.",
      temperature: 0.6,
      maxOutputTokens: 240,
    });
    return { message: text.trim(), source: "ai" };
  } catch {
    return { message: fallback, source: "fallback" };
  }
}
