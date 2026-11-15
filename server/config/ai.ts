/**
 * AI configuration — tek merkez.
 * Model değiştirmek için sadece burası (veya GEMINI_MODEL env'i) yeterli.
 */

const DEFAULT_MODEL = "gemini-3.5-flash-lite";

/**
 * Ücretsiz (lite / flash-lite) yedek modeller.
 * Yalnızca birincil model "bulunamadı" (404) dönerse kullanılır.
 * Kota dolduğunda ASLA model değiştirilmez.
 */
const DEFAULT_FALLBACK_MODELS = ["gemini-2.5-flash-lite"];

function parseKeyList(raw: string | undefined): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // JSON array formatı: ["key1","key2"]
  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter(Boolean);
      }
      return [];
    } catch {
      return [];
    }
  }

  // Virgülle ayrılmış liste de desteklenir.
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Anahtarlar iki biçimde okunur (ikisi birlikte de kullanılabilir):
 *   GEMINI_API_KEYS=["key1","key2"]
 *   GEMINI_API_KEY_1=key1 ... GEMINI_API_KEY_4=key4
 */
export function loadGeminiKeys(): string[] {
  const keys = [...parseKeyList(process.env.GEMINI_API_KEYS)];
  for (let i = 1; i <= 10; i += 1) {
    const key = process.env[`GEMINI_API_KEY_${i}`];
    if (key && key.trim()) keys.push(key.trim());
  }
  return [...new Set(keys)];
}

export const GEMINI_MODEL =
  (process.env.GEMINI_MODEL || "").trim() || DEFAULT_MODEL;

export const GEMINI_FALLBACK_MODELS: string[] = (() => {
  const raw = (process.env.GEMINI_FALLBACK_MODELS || "").trim();
  const list = raw
    ? raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_FALLBACK_MODELS;
  return list.filter((m) => m !== GEMINI_MODEL);
})();

export const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

/** Kota hatası alan anahtar bu süre boyunca denenmez. */
export const AI_KEY_COOLDOWN_MS = 60_000;

/** Tüm anahtarlar kotadaysa AI bu süre boyunca hiç denenmez (boşa istek yok). */
export const AI_GLOBAL_COOLDOWN_MS = 5 * 60_000;
