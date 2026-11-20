import { generateText, extractJson, GeminiError } from "./gemini.js";

/**
 * Mentor beyni.
 * - Durum tespiti (situation) tamamen uygulama mantığıyla yapılır (ücretsizdir).
 * - Kişiselleştirilmiş mesaj Gemini ile üretilir; AI yoksa/kotadaysa
 *   kural tabanlı mesaj döner. Hiçbir akış AI'ya bağımlı değildir.
 */

export interface MentorTask {
  id: string;
  title: string;
  status: string;
  priority?: string | null;
  startTime?: number | null;
  endTime?: number | null;
  deadline?: number | null;
  estimatedMinutes?: number | null;
  firstAction?: string | null;
  delayCount?: number | null;
  category?: string | null;
}

export interface MentorContext {
  now: number;
  timezone: string;
  localTime: string;
  tone: string;
  tasks: MentorTask[];
  activeTask?: MentorTask | null;
  overdue: MentorTask[];
  dueToday: MentorTask[];
  nextDeadline?: MentorTask | null;
  lastMessage?: string | null;
  lastResponse?: string | null;
  lastActivityKind?: string | null;
  lastActivityAt?: number | null;
  restUntil?: number | null;
  /** Mentor yanıtındaki üst cümle sayısı (kullanıcı ayarı). */
  maxSentences?: number;
  plannedCount: number;
  completedCount: number;
  diary?: {
    dateKey: string;
    highlights: string;
    nextSteps: string;
    learnings: string;
  } | null;
}

export type MentorSituation =
  | "resting"
  | "continuing"
  | "overdue"
  | "deadline_today"
  | "not_started"
  | "no_tasks"
  | "plan_today"
  | "blocked"
  | "success";

const TONE_HINT: Record<string, string> = {
  direct: "Net ve disiplinli konuş. Yumuşatma, mazeret üretme; istenen uzunluğu doldur.",
  balanced: "Net ama destekleyici konuş. Baskı kurmadan yönlendir; istenen uzunluğu doldur.",
  supportive: "Sıcak ve teşvik edici konuş; yine de somut bir sonraki adım ver ve istenen uzunluğu doldur.",
};

const SENTENCE_MIN = 1;
const SENTENCE_MAX = 20;

function clampSentences(value?: number): number {
  const n = Number.isFinite(value) ? Math.round(value as number) : 8;
  return Math.min(SENTENCE_MAX, Math.max(SENTENCE_MIN, n));
}

/**
 * Kullanıcının cümle ayarını modelin gerçekten uyacağı bir talimata çevirir.
 * Eskiden yalnızca "en fazla N cümle" yazıyordu; sistem istemi kısalık
 * istediği için model 2-3 cümlede kalıyordu ve 8-20 ayarı hiç dolmuyordu.
 */
function lengthDirective(
  budget: number,
  kind: "check" | "reply",
): string {
  if (budget <= 1) return "Tam 1 cümle yaz.";
  if (budget <= 2) return `Tam ${budget} cümle yaz; daha uzun yazma.`;
  if (budget <= 4) {
    return `Yaklaşık ${budget} cümle yaz (en fazla ${budget}); tek cümlede kesme.`;
  }
  const content =
    kind === "check"
      ? "Durumu, gerekçeyi, riski ve somut sonraki adımı ayrı cümlelerde anlat."
      : "Kullanıcının cevabını, gerekçesini ve bir sonraki adımı ayrı cümlelerde anlat.";
  // "En fazla N" tek başına modeli kısa tutmaya itiyor. Alt sınır koyunca
  // kullanıcının seçtiği uzunluk gerçekten doluyor, üst sınır yine korunuyor.
  const min = Math.max(3, Math.ceil(budget * 0.7));
  const paragraphs =
    budget >= 10
      ? " Mesajı 4-6 kısa paragrafa böl; her paragrafta 2-4 cümle olsun. Paragraf sayısı cümle sayısı değildir."
      : "";
  return (
    `Toplam ${budget} cümlelik bir mesaj yaz (en az ${min}). ` +
    `Cümle = nokta (.) ile biten ifade; cümleleri say, ${min} cümleden az yazma.${paragraphs} ` +
    `${content} Her cümle yeni bilgi taşısın; aynı fikri tekrar etme, ` +
    `gereksiz övgü veya genel motivasyon cümlesi ekleme.`
  );
}

/**
 * Cümle sayısına göre çıktı token bütçesi.
 * Türkçe bir cümle ~25-35 token tutar; 220 token 8 cümleyi bile zor karşılar.
 */
function outputTokenBudget(sentences: number): number {
  return Math.min(1600, 140 + sentences * 70);
}

function hoursBetween(from: number, to: number): number {
  return Math.max(0, to - from) / 3_600_000;
}

function firstPending(ctx: MentorContext): MentorTask | null {
  const pending = ctx.tasks.filter(
    (t) => t.status === "pending" || t.status === "active" || t.status === "paused",
  );
  if (pending.length === 0) return null;
  return [...pending].sort((a, b) => {
    const da = a.deadline ?? a.endTime ?? Number.MAX_SAFE_INTEGER;
    const db = b.deadline ?? b.endTime ?? Number.MAX_SAFE_INTEGER;
    return da - db;
  })[0];
}

export function detectSituation(ctx: MentorContext): MentorSituation {
  if (ctx.restUntil && ctx.restUntil > ctx.now) return "resting";
  if (ctx.lastActivityKind === "resting" && ctx.lastActivityAt && ctx.now - ctx.lastActivityAt < 45 * 60_000) {
    return "resting";
  }
  if (ctx.activeTask && (ctx.activeTask.status === "active" || ctx.activeTask.status === "paused")) {
    return "continuing";
  }
  if (ctx.tasks.length === 0) return "no_tasks";
  if (ctx.lastActivityKind === "blocked") return "blocked";
  if (ctx.overdue.length > 0) return "overdue";
  if (ctx.dueToday.length > 0) return "deadline_today";
  if (ctx.completedCount > 0 && ctx.completedCount >= ctx.plannedCount) return "success";
  if (ctx.plannedCount > 0) return "not_started";
  return "plan_today";
}

function timeInZone(ts: number, timeZone: string): string {
  return new Date(ts).toLocaleTimeString("tr-TR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function dateTimeInZone(ts: number, timeZone: string): string {
  return `${new Date(ts).toLocaleDateString("tr-TR", {
    timeZone,
    day: "2-digit",
    month: "short",
  })} ${timeInZone(ts, timeZone)}`;
}

function sentenceCount(text: string): number {
  return text.split(/[.!?…]+/).filter((s) => s.trim().length > 0).length;
}

/** Kural tabanlı mesajın çekirdeği (durum başına 2-3 cümle). */
function baseFallbackMessage(
  ctx: MentorContext,
  situation: MentorSituation,
): string {
  const task = firstPending(ctx);
  const title = task?.title ?? "görevin";
  const hhmm = (ts?: number | null) =>
    ts ? timeInZone(ts, ctx.timezone) : "";

  switch (situation) {
    case "resting": {
      const left = ctx.restUntil
        ? Math.max(0, Math.ceil((ctx.restUntil - ctx.now) / 60_000))
        : 0;
      return left > 0
        ? `Dinlenme modundasın, ${left} dakika daha süren var. Acele etme; süre bitince "${title}" ile devam edeceğiz.`
        : `Dinlenme süren doldu. "${title}" görevine dönmeye hazır mısın? İlk 5 dakikayı yeterli say.`;
    }
    case "continuing": {
      const active = ctx.activeTask ?? task;
      const elapsed = active?.startTime ? Math.round(hoursBetween(active.startTime, ctx.now)) : 0;
      return elapsed >= 1
        ? `"${active?.title ?? title}" üzerinde yaklaşık ${elapsed} saattir çalışıyorsun. Devam ediyor musun, yoksa mola mı?`
        : `"${active?.title ?? title}" üzerinde ilerliyorsun. Bir sonraki küçük adımı tamamlamaya odaklan; molaya ihtiyacın varsa söyle.`;
    }
    case "overdue": {
      const late = ctx.overdue[0];
      return `"${late.title}" görevinin süresi geçti. Bugün onu kapatmadan yenilerine geçmeyelim. Şimdi ilk 5 dakikayı ayır.`;
    }
    case "deadline_today": {
      const due = ctx.dueToday[0];
      return `Bugün bitmesi gereken ${ctx.dueToday.length} görevin var. Önce "${due.title}". Tahmini süresi ${due.estimatedMinutes ?? 30} dakika; şimdi başla.`;
    }
    case "blocked":
      return `Takıldığın yeri biliyorum. Nerede durduğunu kısaca yaz; görevi daha küçük bir adıma bölelim.`;
    case "success":
      return `Bugün ${ctx.completedCount} görevi tamamladın. İyi ilerleme. Sıradaki önceliği belirleyip devam ediyoruz.`;
    case "no_tasks":
      return `Bugün için planlanmış görevin yok. En önemli tek işi ekle; sadece bir tanesiyle başlayalım.`;
    case "not_started": {
      const next = firstPending(ctx);
      const startLabel = hhmm(next?.startTime);
      return startLabel
        ? `Bugün ${ctx.plannedCount} görevin var ve henüz ilerleme bildirmedin. "${next?.title}" ${startLabel}'de başlıyordu. Şimdi ilk 5 dakikayı tamamla.`
        : `Bugün ${ctx.plannedCount} görevin var, henüz başlamadın. "${title}" için ilk 5 dakikayı hedefle.`;
    }
    default:
      return `Bugün ${ctx.plannedCount} görevin var. Hangisiyle başladın? En acil olandan devam edelim.`;
  }
}

/**
 * Kural tabanlı mesajı da kullanıcının cümle ayarına yaklaştırır.
 * AI kapalıyken 20 cümle seçen biri 2 cümle görmesin.
 */
function fallbackDetails(
  ctx: MentorContext,
  situation: MentorSituation,
): string[] {
  const out: string[] = [];
  const next = firstPending(ctx);
  const time = (ts?: number | null) => (ts ? timeInZone(ts, ctx.timezone) : "");

  if (ctx.tasks.length === 0) {
    out.push("Bugünün en önemli tek işini seç.");
    out.push("Görevi 5 dakikada başlanabilecek kadar küçük yaz.");
    out.push("Başlamak için bir saat aralığı belirle.");
    return out;
  }

  if (ctx.overdue.length > 1) {
    const names = ctx.overdue.slice(0, 3).map((t) => `"${t.title}"`).join(", ");
    out.push(`Süresi geçen birkaç görev var: ${names}. Birini seç, gerisi bekleyebilir.`);
  }

  if (next?.endTime) {
    const left = Math.round((next.endTime - ctx.now) / 60_000);
    out.push(
      left > 0
        ? `"${next.title}" için planlanan bitiş ${time(next.endTime)}; ${left} dakika kaldı.`
        : `"${next.title}" için planlanan bitiş ${time(next.endTime)} geçti.`,
    );
  }

  if (next?.deadline) {
    out.push(`Son teslim ${dateTimeInZone(next.deadline, ctx.timezone)}.`);
  }

  if (situation !== "success" && ctx.plannedCount > 0) {
    out.push(`Bugün ${ctx.completedCount}/${ctx.plannedCount} görev tamamlandı.`);
  }

  if (next?.estimatedMinutes && situation !== "deadline_today") {
    out.push(`"${next.title}" için tahmini süre ${next.estimatedMinutes} dakika.`);
  }

  if (next?.firstAction) {
    const action = next.firstAction.trim().replace(/\.+$/, "");
    out.push(`İlk adım: ${action}.`);
  }

  const others = ctx.tasks.filter(
    (t) =>
      t.id !== next?.id &&
      (t.status === "pending" || t.status === "active" || t.status === "paused"),
  );
  for (const t of others.slice(0, 5)) {
    const bits: string[] = [];
    if (t.startTime) bits.push(`${time(t.startTime)}'de başlıyor`);
    if (t.endTime) bits.push(`${time(t.endTime)}'de bitiyor`);
    if (t.estimatedMinutes) bits.push(`tahmini ${t.estimatedMinutes} dakika`);
    if (bits.length > 0) out.push(`"${t.title}" ${bits.join(", ")}.`);
  }

  return out;
}

/** Uzun ayarlarda AI/kural mesajını ayarlanan cümle sayısına yaklaştıran cümleler. */
const FALLBACK_TIPS = [
  "Şu an sadece seçtiğin göreve odaklan; diğerlerini sıraya koy.",
  "Telefonu sessize alıp bildirimleri kapat; ilk 5 dakika bölünmesin.",
  "Görevi bitirmek için gereken en küçük adımı şimdi yap.",
  "Bir sonraki kontrole kadar ilerlemeyi burada bildir; böylece planı birlikte güncelleyelim.",
  "Bugünün en önemli işini bitirmeden küçük işlere geçme.",
  "Süre bitmeden ilerlemeyi kaydet; yarıda kalan işi yarına devralmayalım.",
  "Bir engelle karşılaşırsan görevi daha küçük parçalara böl.",
  "Mola vereceksen süresini şimdi belirle, sonra aynı göreve dön.",
];

/** AI çalışmadığında kullanılacak, duruma uygun kural tabanlı mesaj. */
export function fallbackCheckMessage(
  ctx: MentorContext,
  situation: MentorSituation = detectSituation(ctx),
): string {
  const base = baseFallbackMessage(ctx, situation);
  const budget = clampSentences(ctx.maxSentences);
  let remaining = budget - sentenceCount(base);
  if (remaining <= 0) return base;
  const details = fallbackDetails(ctx, situation).slice(0, remaining);
  remaining -= details.length;
  const tips = remaining > 0 ? FALLBACK_TIPS.slice(0, remaining) : [];
  const parts = [base, ...details, ...tips].filter((p) => p.length > 0);
  return parts.join(" ");
}

function contextPayload(ctx: MentorContext) {
  // Modele ham epoch değerleri vermek yanlış saat/gecikme yorumlarına yol
  // açıyordu. Saatleri kullanıcının diliminde okunabilir biçimde gönder.
  const timeLabel = (ts?: number | null) =>
    ts ? timeInZone(ts, ctx.timezone) : null;
  const dateTimeLabel = (ts?: number | null) =>
    ts ? dateTimeInZone(ts, ctx.timezone) : null;
  const minutesUntil = (ts?: number | null) =>
    ts ? Math.round((ts - ctx.now) / 60_000) : null;

  const trim = (t: MentorTask) => ({
    title: t.title,
    status: t.status,
    priority: t.priority ?? "medium",
    category: t.category ?? null,
    startTime: timeLabel(t.startTime),
    endTime: timeLabel(t.endTime),
    deadline: t.deadline ? dateTimeLabel(t.deadline) : null,
    estimatedMinutes: t.estimatedMinutes ?? null,
    /** Negatif değer: süre/bitiş geçmiş demektir. */
    minutesUntilEnd: minutesUntil(t.endTime),
    minutesUntilDeadline: minutesUntil(t.deadline),
    delayCount: t.delayCount ?? 0,
    firstAction: t.firstAction ?? null,
  });

  return {
    localTime: ctx.localTime,
    timezone: ctx.timezone,
    activeTask: ctx.activeTask ? trim(ctx.activeTask) : null,
    overdue: ctx.overdue.slice(0, 5).map(trim),
    dueToday: ctx.dueToday.slice(0, 5).map(trim),
    tasks: ctx.tasks.slice(0, 10).map(trim),
    lastMentorMessage: ctx.lastMessage ?? null,
    lastUserResponse: ctx.lastResponse ?? null,
    lastReportedActivity: ctx.lastActivityKind ?? null,
    restingUntil: ctx.restUntil ? timeLabel(ctx.restUntil) : null,
    maxSentences: ctx.maxSentences ?? 8,
    plannedCount: ctx.plannedCount,
    completedCount: ctx.completedCount,
    latestDiary: ctx.diary ?? null,
  };
}

const MENTOR_SYSTEM = `Sen Adaptime'ın kişisel hesap verebilirlik mentorüsün. Kullanıcıyla Türkçe konuşursun.
Tarzın: net, stratejik ve kararlı. Gereksiz motivasyon konuşması yapmazsın ama istemde verilen cümle hedefini doldurursun; hedef yüksekse yüzeysel geçmez, ayrıntı verirsin.
Ertelemeyi fark eder, doğrudan ama suçluluk hissettirmeden söylersin.
Kullanıcının yorgunluğunu ve dinlenme durumunu dikkate alırsın.
Uzunluk kuralı: istemdeki cümle hedefi bağlayıcıdır. Hedef 5 cümle veya üzeriyse durumu, gerekçeyi ve planı ayrı ayrı anlat; hedef kısaysa tek cümleye kadar in.
Markdown, emoji, başlık, madde işareti ve numaralı liste kullanma. Gerekirse paragrafları satır sonuyla ayır.
Sayıları her zaman rakamla yaz. Saatleri 24 saat biçiminde ver: "19:00", "14:50". Süre ve adetleri de rakamla yaz: "90 dakika", "8 görev", "5 dakika", "2 adım". "on dokuz", "doksan", "beşer", "on dört elli" gibi yazıyla sayı yazma.
Sadece mesaj metnini döndür; açıklama veya JSON yazma.
Verilmeyen bir şeyi olmuş gibi anlatma; sadece bağlamdaki verilere dayan.
Kullanıcıya görev tamamlama onayı sormadan "tamamladın" deme.`;

/**
 * Gemini bazen cümle hedefinin altında kalıyor (özellikle 10+ ayarlarda).
 * Mesajı yeniden yazdırmak yerine, hedefin alt sınırına ulaşana kadar
 * bağlama uygun kısa cümleler ekler.
 */
function fitAiLength(message: string, budget: number): string {
  if (budget < 6) return message;
  const min = Math.max(3, Math.ceil(budget * 0.7));
  const have = sentenceCount(message);
  if (have >= min) return message;
  const extra = FALLBACK_TIPS.filter((t) => !message.includes(t)).slice(
    0,
    min - have,
  );
  return extra.length > 0 ? `${message}\n\n${extra.join(" ")}` : message;
}

/**
 * Saatlik kontrol / manuel kontrol mesajı üretir.
 */
export async function composeCheckMessage(
  ctx: MentorContext,
): Promise<{ message: string; source: "ai" | "fallback"; situation: MentorSituation }> {
  const situation = detectSituation(ctx);
  const fallback = fallbackCheckMessage(ctx, situation);
  const budget = clampSentences(ctx.maxSentences);

  const prompt = `Şu anki durum (JSON):
${JSON.stringify(contextPayload(ctx))}

Bu bir "${situation}" durumundaki saatlik hesap verebilirlik kontrolü.
Kullanıcıya görevini hatırlatan, gerçek ilerlemeyi soran ve somut bir sonraki küçük adım veren bir mesaj yaz.

Uzunluk: ${lengthDirective(budget, "check")}
Kullanıcı bu uzunluğu kendisi seçti; kısa ve öz olma içgüdüsüne kapılıp cümleleri yarıda kesme.
Cümleleri doldurmak için genel motivasyon veya aynı fikri tekrarlayan cümle yazma; her cümle bağlamdaki farklı bir bilgiyi (görev adı, saat, kalan süre, öncelik, risk, somut adım) kullansın.
Bağlamda olmayan saat, süre veya bitiş bilgisi uydurma; "minutesUntilEnd" negatifse süre geçmiş, pozitifse kalan dakikadır.
Görev çokluğuna, öncelik seviyelerine ve deadline'lara göre karar ver; yetişmesi gereken iş varsa zaman önerisi ver, uygunsa tek cümlelik kısa bir motivasyon ekle.
Sayıları rakamla yaz; saatleri "19:00", süreleri "90 dakika", adetleri "8 görev" biçiminde ver. Yazıyla sayı yazma.
Daha önce söylenen mesajı birebir tekrarlama.`;

  try {
    const text = await generateText({
      prompt,
      system: `${MENTOR_SYSTEM}\n${TONE_HINT[ctx.tone] ?? TONE_HINT.direct}`,
      temperature: 0.7,
      maxOutputTokens: outputTokenBudget(budget),
    });
    const message = text.replace(/^["']|["']$/g, "").trim();
    return { message: fitAiLength(message, budget), source: "ai", situation };
  } catch (error) {
    if (!(error instanceof GeminiError)) {
      console.warn("Mentor AI hatası:", error);
    }
    return { message: fallback, source: "fallback", situation };
  }
}

export type MentorAction =
  | "start"
  | "continue"
  | "complete"
  | "rest"
  | "busy"
  | "free"
  | "snooze"
  | "blocked"
  | "skip"
  | "report";

const ACTION_FALLBACK: Record<MentorAction, (taskTitle: string, minutes: number) => string> = {
  start: (t) => `"${t}" için süre işliyor. İlk 5 dakikayı tamamla, gerisi gelecek.`,
  continue: (t) => `Devam ediyorsun, "${t}" aktif kalıyor. Bir sonraki küçük adıma odaklan.`,
  complete: (t) => `"${t}" tamamlandı olarak kaydedildi. Sıradaki önceliğe geçebiliriz.`,
  rest: (_t, m) => `Dinlenme kaydedildi; ${m} dakika sonra kontrol edeceğim. Telefonu bırak, gerçekten dinlen.`,
  busy: (t) => `Başka bir işle meşgulsün, not aldım. "${t}" beklemede kalıyor; işin bitince ona döneceğiz.`,
  free: (t) => `Boş zaman olarak kaydettim. Planlı mola mı, yoksa "${t}" ertelendi mi? Bir sonraki kontrolde netleşsin.`,
  snooze: (t, m) => `Tamam, ${m} dakika erteleme. Süre bitince "${t}" ile başlıyoruz; başka bahane yok.`,
  blocked: () => `Engel kaydedildi. Takıldığın noktayı tek cümleyle yaz; görevi daha küçük bir adıma bölelim.`,
  skip: (t) => `"${t}" atlandı olarak işaretlendi. Bu bilinçli bir karar mıydı, yoksa erteleme mi?`,
  report: () => `Durumunu kaydettim. Bir sonraki kontrolde bunu dikkate alacağım.`,
};

export async function composeReply(
  action: MentorAction,
  taskTitle: string,
  ctx: MentorContext,
  note?: string,
  minutes = 15,
): Promise<{ message: string; source: "ai" | "fallback" }> {
  const fallback = ACTION_FALLBACK[action](taskTitle, minutes);
  // Yanıtlar kontrol mesajından kısa kalır ama ayar yüksekse yine de
  // tek satırda bırakmayız: 20 → 9 cümleye kadar çıkabilir.
  const budget = clampSentences(ctx.maxSentences);
  const replySentences = Math.max(1, Math.min(budget, 2 + Math.ceil(budget / 3)));

  const prompt = `Kullanıcı az önce şu cevabı verdi:
action="${action}", görev="${taskTitle}", süre=${minutes} dakika, not="${note ?? ""}"

Bağlam (JSON):
${JSON.stringify(contextPayload(ctx))}

Bu cevaba verilecek mentor yanıtını yaz.
Uzunluk: ${lengthDirective(replySentences, "reply")}
Sayıları rakamla yaz; saatleri "19:00", süreleri "15 dakika" biçiminde ver.
Görev tamamlanmadıysa tamamlanmış gibi konuşma. Yeni bir görev başlatma; aktif görevi koru.`;

  try {
    const text = await generateText({
      prompt,
      system: `${MENTOR_SYSTEM}\n${TONE_HINT[ctx.tone] ?? TONE_HINT.direct}`,
      temperature: 0.65,
      maxOutputTokens: outputTokenBudget(replySentences),
    });
    return { message: text.replace(/^["']|["']$/g, "").trim(), source: "ai" };
  } catch {
    return { message: fallback, source: "fallback" };
  }
}

/**
 * "İlk adımlar" — görevi başlatma eşiğini düşüren küçük adımlar.
 * Süre büyüdükçe adım sayısı artar (5 dk → 3 adım, 60 dk → 14, 120 dk → 26).
 */
export async function generateFirstSteps(
  title: string,
  notes?: string | null,
  minutes = 5,
): Promise<{ steps: string[]; source: "ai" | "fallback" }> {
  const totalMinutes = Math.min(240, Math.max(5, Math.round(minutes)));
  const stepCount = Math.min(30, Math.max(3, Math.round(totalMinutes / 5) + 2));
  const perStep = Math.max(1, Math.round(totalMinutes / stepCount));

  const fallback = [
    `"${title}" için gereken dosya/ekranı aç.`,
    `Yapılacak en küçük parçayı seç (tek bir dosya, tek bir paragraf, tek bir komut).`,
    `${perStep} dakika çalış ve dur; nerede kaldığını not et.`,
  ];

  try {
    const text = await generateText({
      prompt:
        `Görev: "${title}"\nNot: "${notes ?? ""}"\n` +
        `Toplam süre: ${totalMinutes} dakika. Tam ${stepCount} adım üret; her adım yaklaşık ${perStep} dakika sürsün. ` +
        `Adımlar sıralı, somut ve hemen yapılabilir olsun, her biri en fazla 12 kelime. ` +
        `Sadece JSON array döndür: ["adım1","adım2", ...]`,
      system:
        "Sen pratik bir üretkenlik koçusun. Kısa, uygulanabilir adımlar verirsin. Sayıları rakamla yaz (19:00, 90 dakika). Sadece JSON döndür.",
      temperature: 0.5,
      maxOutputTokens: Math.min(1600, 120 + stepCount * 45),
    });
    const parsed = extractJson<unknown>(text);
    if (Array.isArray(parsed)) {
      const steps = parsed
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => s.trim())
        .slice(0, stepCount);
      if (steps.length > 0) return { steps, source: "ai" };
    }
    return { steps: fallback, source: "fallback" };
  } catch {
    return { steps: fallback, source: "fallback" };
  }
}

/**
 * Açıklamadan alt görev çıkarır.
 * Açıklama madde madde ya da düz cümle olabilir; AI yoksa kurallı bölme.
 */
export async function generateSubtasks(
  title: string,
  description?: string | null,
): Promise<{ items: string[]; source: "ai" | "fallback" }> {
  const text = (description ?? "").trim();

  const fallback = (): string[] => {
    const cleaned = text
      .replace(/\r/g, "")
      .replace(/^\s*(?:[-*•·]|\d+[.)\-])\s*/gm, "\n")
      .split(/\n|;|\u2022/g)
      .map((s) => s.replace(/^\s*(?:[-*•·]|\d+[.)\-])\s*/, "").trim())
      .filter((s) => s.length >= 3 && s.length <= 120);
    const unique = Array.from(new Set(cleaned)).slice(0, 8);
    if (unique.length >= 2) return unique;
    return [
      `"${title}" için gereken malzemeyi hazırla.`,
      `İlk somut parçayı tamamla.`,
      `Kalanı bitir ve kontrol et.`,
    ];
  };

  try {
    const response = await generateText({
      prompt:
        `Görev: "${title}"\nAçıklama: "${text || "(yok)"}"\n` +
        `Bu görevi yapmak için gereken alt görevleri çıkar. En az 2, en fazla 8 madde. ` +
        `Her madde somut, emir kipi ve en fazla 10 kelime olsun; açıklamada geçen saat/ders/parça bilgilerini koru. ` +
        `Sadece JSON array döndür: ["alt görev1","alt görev2", ...]`,
      system:
        "Sen pratik bir planlama asistanısın. Görevleri yapılabilir alt adımlara bölersin. Sayıları rakamla yaz. Sadece JSON döndür.",
      temperature: 0.3,
      maxOutputTokens: 320,
    });
    const parsed = extractJson<unknown>(response);
    if (Array.isArray(parsed)) {
      const items = parsed
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => s.trim().slice(0, 120))
        .slice(0, 10);
      if (items.length > 0) return { items, source: "ai" };
    }
    return { items: fallback(), source: "fallback" };
  } catch {
    return { items: fallback(), source: "fallback" };
  }
}

export interface DailyLaunchItem {
  title: string;
  firstStep: string;
  doneCriteria: string;
}

export interface DailyLaunchResult {
  date: string;
  topTaskTitle: string;
  firstStep: string;
  doneCriteria: string;
  source: "ai" | "fallback";
  count: number;
  items: DailyLaunchItem[];
}

const LAUNCH_COUNTS = [3, 5, 10];

function pendingTasks(ctx: MentorContext): MentorTask[] {
  const pending = ctx.tasks.filter(
    (t) => t.status === "pending" || t.status === "active" || t.status === "paused",
  );
  return [...pending].sort((a, b) => {
    const da = a.deadline ?? a.endTime ?? Number.MAX_SAFE_INTEGER;
    const db = b.deadline ?? b.endTime ?? Number.MAX_SAFE_INTEGER;
    return da - db;
  });
}

function fallbackItem(task: MentorTask): DailyLaunchItem {
  return {
    title: task.title,
    firstStep: task.firstAction
      ? task.firstAction
      : `"${task.title}" için ilk 5 dakikayı ayır ve en küçük parçayı bitir.`,
    doneCriteria: `"${task.title}" tamamlandığında ortaya çıkan somut çıktı hazır olmalı.`,
  };
}

/** Günün öncelikli görevleri + her biri için ilk adım ve tamamlanma ölçütü. */
export async function generateDailyLaunch(
  ctx: MentorContext,
  dateKey: string,
  requestedCount = 3,
): Promise<DailyLaunchResult> {
  const count = LAUNCH_COUNTS.includes(requestedCount) ? requestedCount : 3;
  const picks = pendingTasks(ctx).slice(0, count);

  const fallbackItems: DailyLaunchItem[] =
    picks.length > 0
      ? picks.map(fallbackItem)
      : [
          {
            title: "Bugünün en önemli işi",
            firstStep: "Bugün için tek bir görev seç ve 5 dakika başla.",
            doneCriteria: "Somut bir çıktı üretilmiş olmalı.",
          },
        ];

  const build = (
    items: DailyLaunchItem[],
    source: "ai" | "fallback",
  ): DailyLaunchResult => ({
    date: dateKey,
    topTaskTitle: items[0]?.title ?? "Bugünün en önemli işi",
    firstStep: items[0]?.firstStep ?? "İlk 5 dakikayı ayır.",
    doneCriteria: items[0]?.doneCriteria ?? "Somut bir çıktı üretilmiş olmalı.",
    source,
    count,
    items,
  });

  if (picks.length === 0) return build(fallbackItems, "fallback");

  try {
    const text = await generateText({
      prompt: `Bağlam (JSON):\n${JSON.stringify(contextPayload(ctx))}\n\nBugünün öncelikli ${count} görevini seç (en fazla ${count}, daha az görev varsa hepsi) ve şu JSON'u döndür:\n{"items":[{"title":"görev adı","firstStep":"ilk 5 dakikada yapılacak tek şey","doneCriteria":"tamamlanma ölçütü"}]}\nKısa tut, her alan tek cümle. Sadece JSON.`,
      system:
        "Sen Adaptime mentorüsün. Gerçekçi, kısa ve uygulanabilir plan yaparsın. Sayıları rakamla yaz (19:00, 90 dakika). Sadece JSON döndür.",
      temperature: 0.4,
      maxOutputTokens: 160 + count * 90,
    });
    const parsed = extractJson<{ items?: Partial<DailyLaunchItem>[] }>(text);
    const items = (parsed?.items ?? [])
      .filter((i) => i?.title)
      .slice(0, count)
      .map((i) => ({
        title: String(i.title).slice(0, 120),
        firstStep: String(i.firstStep ?? "İlk 5 dakikayı ayır.").slice(0, 200),
        doneCriteria: String(i.doneCriteria ?? "Somut çıktı hazır olmalı.").slice(0, 200),
      }));
    if (items.length > 0) return build(items, "ai");
    return build(fallbackItems, "fallback");
  } catch {
    return build(fallbackItems, "fallback");
  }
}
