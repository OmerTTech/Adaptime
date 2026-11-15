import {
  AI_GLOBAL_COOLDOWN_MS,
  AI_KEY_COOLDOWN_MS,
  GEMINI_BASE_URL,
  GEMINI_FALLBACK_MODELS,
  GEMINI_MODEL,
  loadGeminiKeys,
} from "../config/ai.js";

/**
 * Gemini çağrıları için anahtar rotasyonu.
 *
 * Kurallar:
 * - İlk istekte sıradaki kullanılabilir anahtar kullanılır.
 * - HTTP 429 / RESOURCE_EXHAUSTED → anahtar geçici olarak devre dışı, sıradaki denenir.
 * - Kota dışı hatalarda (400/404/500, ağ) anahtar değiştirilmez.
 * - Tüm anahtarlar kotadaysa AI tümüyle durur (global cooldown) ve çağıran taraf
 *   yerel kural tabanlı fallback'e düşer.
 * - Anahtar değerleri hiçbir zaman loglanmaz veya API'den dönülmez.
 */

export type GeminiErrorCode =
  | "no_keys"
  | "quota"
  | "model"
  | "network"
  | "bad_response";

export class GeminiError extends Error {
  code: GeminiErrorCode;

  constructor(code: GeminiErrorCode, message: string) {
    super(message);
    this.name = "GeminiError";
    this.code = code;
  }
}

interface RotatorState {
  keys: string[];
  cursor: number;
  disabledUntil: number[];
  lastUsedAt: (number | null)[];
  quotaHits: number[];
  successCount: number[];
  blockedUntil: number;
}

let state: RotatorState | null = null;

function getState(): RotatorState {
  if (!state) {
    const keys = loadGeminiKeys();
    state = {
      keys,
      cursor: 0,
      disabledUntil: keys.map(() => 0),
      lastUsedAt: keys.map(() => null),
      quotaHits: keys.map(() => 0),
      successCount: keys.map(() => 0),
      blockedUntil: 0,
    };
  }
  return state;
}

export interface AiStatus {
  model: string;
  configuredKeys: number;
  availableKeys: number;
  blockedUntil: number | null;
  keys: Array<{
    index: number;
    disabled: boolean;
    disabledUntil: number | null;
    lastUsedAt: number | null;
    quotaHits: number;
    successCount: number;
  }>;
}

export function getAiStatus(): AiStatus {
  const s = getState();
  const now = Date.now();
  return {
    model: GEMINI_MODEL,
    configuredKeys: s.keys.length,
    availableKeys: s.keys.filter((_, i) => s.disabledUntil[i] <= now).length,
    blockedUntil: s.blockedUntil > now ? s.blockedUntil : null,
    keys: s.keys.map((_, i) => ({
      index: i,
      disabled: s.disabledUntil[i] > now,
      disabledUntil: s.disabledUntil[i] > now ? s.disabledUntil[i] : null,
      lastUsedAt: s.lastUsedAt[i],
      quotaHits: s.quotaHits[i],
      successCount: s.successCount[i],
    })),
  };
}

export interface GeminiRequest {
  prompt: string;
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

interface GeminiResponseBody {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

async function callModel(
  key: string,
  model: string,
  req: GeminiRequest,
): Promise<string> {
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: req.prompt }] }],
    generationConfig: {
      temperature: req.temperature ?? 0.5,
      maxOutputTokens: req.maxOutputTokens ?? 512,
    },
  };
  if (req.system) {
    body.systemInstruction = { parts: [{ text: req.system }] };
  }

  let response: Response;
  try {
    response = await fetch(`${GEMINI_BASE_URL}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new GeminiError(
      "network",
      error instanceof Error ? error.message : "Gemini'ye ulaşılamadı",
    );
  }

  if (response.status === 429) {
    throw new GeminiError("quota", "Kota sınırına ulaşıldı (429)");
  }
  if (response.status === 404) {
    throw new GeminiError("model", `Model bulunamadı: ${model}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (text.includes("RESOURCE_EXHAUSTED")) {
      throw new GeminiError("quota", "Kota sınırına ulaşıldı (RESOURCE_EXHAUSTED)");
    }
    if (text.includes("API_KEY_INVALID") || response.status === 400) {
      throw new GeminiError("bad_response", `Gemini isteği reddedildi (${response.status})`);
    }
    throw new GeminiError("bad_response", `Gemini hatası (${response.status})`);
  }

  const data = (await response.json()) as GeminiResponseBody;
  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("")
      .trim() ?? "";

  if (!text) {
    throw new GeminiError("bad_response", "Gemini boş yanıt döndü");
  }
  return text;
}

/**
 * Metin üretir. Kota dışı hata veya tüm anahtarlar tükendiyse GeminiError fırlatır.
 * Çağıran taraf her zaman yerel fallback'e sahip olmalı.
 */
export async function generateText(req: GeminiRequest): Promise<string> {
  const s = getState();
  if (s.blockedUntil > Date.now()) {
    throw new GeminiError("quota", "AI geçici olarak devre dışı (kota)");
  }
  if (s.keys.length === 0) {
    throw new GeminiError("no_keys", "GEMINI anahtarı tanımlı değil");
  }

  const models = [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS];
  let lastError: GeminiError = new GeminiError(
    "quota",
    "Kullanılabilir anahtar kalmadı",
  );
  const attempted = new Set<number>();
  let quotaFailures = 0;

  for (let step = 0; step < s.keys.length; step += 1) {
    const index = (s.cursor + step) % s.keys.length;
    if (attempted.has(index)) continue;
    if (s.disabledUntil[index] > Date.now()) {
      quotaFailures += 1;
      continue;
    }
    attempted.add(index);

    for (const model of models) {
      try {
        const text = await callModel(s.keys[index], model, req);
        s.cursor = (index + 1) % s.keys.length;
        s.successCount[index] += 1;
        s.lastUsedAt[index] = Date.now();
        return text;
      } catch (error) {
        if (error instanceof GeminiError && error.code === "quota") {
          s.quotaHits[index] += 1;
          s.disabledUntil[index] = Date.now() + AI_KEY_COOLDOWN_MS;
          s.lastUsedAt[index] = Date.now();
          quotaFailures += 1;
          lastError = error;
          break; // sıradaki anahtara geç
        }
        if (error instanceof GeminiError && error.code === "model") {
          // Model yok: anahtarı yakma, bir sonraki ücretsiz modeli dene.
          lastError = error;
          continue;
        }
        // Kota dışı hata: anahtar değiştirmeden çık.
        throw error;
      }
    }
  }

  if (quotaFailures >= s.keys.length) {
    s.blockedUntil = Date.now() + AI_GLOBAL_COOLDOWN_MS;
  }
  throw lastError;
}

/** Model yanıtından JSON ayıklar ({...} veya [...]). */
export function extractJson<T>(text: string): T | null {
  const objectMatch = text.match(/\{[\s\S]*\}/);
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  const raw =
    objectMatch && (!arrayMatch || objectMatch.index! < arrayMatch.index!)
      ? objectMatch[0]
      : arrayMatch?.[0];
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
