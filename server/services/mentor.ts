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
  direct: "Kısa, net ve disiplinli konuş. Yumuşatma, mazeret üretme.",
  balanced: "Net ama destekleyici konuş. Baskı kurmadan yönlendir.",
  supportive: "Sıcak ve teşvik edici konuş; yine de somut bir sonraki adım ver.",
};

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

/** AI çalışmadığında kullanılacak, duruma uygun kural tabanlı mesaj. */
export function fallbackCheckMessage(
  ctx: MentorContext,
  situation: MentorSituation = detectSituation(ctx),
): string {
  const task = firstPending(ctx);
  const title = task?.title ?? "görevin";
  const hhmm = (ts?: number | null) =>
    ts
      ? new Date(ts).toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "";

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

function contextPayload(ctx: MentorContext) {
  const trim = (t: MentorTask) => ({
    title: t.title,
    status: t.status,
    priority: t.priority ?? "medium",
    deadline: t.deadline ?? null,
    plannedEnd: t.endTime ?? null,
    estimatedMinutes: t.estimatedMinutes ?? null,
    delayCount: t.delayCount ?? 0,
    category: t.category ?? null,
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
    restingUntil: ctx.restUntil ?? null,
    maxSentences: ctx.maxSentences ?? 8,
    plannedCount: ctx.plannedCount,
    completedCount: ctx.completedCount,
    latestDiary: ctx.diary ?? null,
  };
}

const MENTOR_SYSTEM = `Sen Adaptime'ın kişisel hesap verebilirlik mentorüsün. Kullanıcıyla Türkçe konuşursun.
Tarzın: kısa, net, stratejik ve kararlı. Gereksiz motivasyon konuşması yapmazsın.
Ertelemeyi fark eder, doğrudan ama suçluluk hissettirmeden söylersin.
Kullanıcının yorgunluğunu ve dinlenme durumunu dikkate alırsın.
Mesaj uzunluğu istemde verilen cümle sınırına uyar. Markdown, emoji, başlık, madde işareti kullanma.
Sadece mesaj metnini döndür; açıklama veya JSON yazma.
Verilmeyen bir şeyi olmuş gibi anlatma; sadece bağlamdaki verilere dayan.
Kullanıcıya görev tamamlama onayı sormadan "tamamladın" deme.`;

/**
 * Saatlik kontrol / manuel kontrol mesajı üretir.
 */
export async function composeCheckMessage(
  ctx: MentorContext,
): Promise<{ message: string; source: "ai" | "fallback"; situation: MentorSituation }> {
  const situation = detectSituation(ctx);
  const fallback = fallbackCheckMessage(ctx, situation);

  const prompt = `Şu anki durum (JSON):
${JSON.stringify(contextPayload(ctx))}

Bu bir "${situation}" durumundaki saatlik hesap verebilirlik kontrolü.
Kullanıcıya görevini hatırlatan, gerçek ilerlemeyi soran ve somut bir sonraki küçük adım veren bir mesaj yaz.
Mesaj en az 1, en fazla ${Math.min(20, Math.max(1, ctx.maxSentences ?? 8))} cümle olabilir; konuşma uzunluğunu kullanıcının ayarına göre seç.
Görev çokluğuna, öncelik seviyelerine ve deadline'lara göre karar ver; yetişmesi gereken iş varsa zaman önerisi ver, uygunsa tek cümlelik kısa bir motivasyon ekle.
Daha önce söylenen mesajı birebir tekrarlama.`;

  try {
    const text = await generateText({
      prompt,
      system: `${MENTOR_SYSTEM}\n${TONE_HINT[ctx.tone] ?? TONE_HINT.direct}`,
      temperature: 0.7,
      maxOutputTokens: 220,
    });
    return { message: text.replace(/^["']|["']$/g, "").trim(), source: "ai", situation };
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

  const prompt = `Kullanıcı az önce şu cevabı verdi:
action="${action}", görev="${taskTitle}", süre=${minutes} dakika, not="${note ?? ""}"

Bağlam (JSON):
${JSON.stringify(contextPayload(ctx))}

Bu cevaba verilecek 1-2 cümlelik mentor yanıtını yaz.
Görev tamamlanmadıysa tamamlanmış gibi konuşma. Yeni bir görev başlatma; aktif görevi koru.`;

  try {
    const text = await generateText({
      prompt,
      system: `${MENTOR_SYSTEM}\n${TONE_HINT[ctx.tone] ?? TONE_HINT.direct}`,
      temperature: 0.65,
      maxOutputTokens: 160,
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
        "Sen pratik bir üretkenlik koçusun. Kısa, uygulanabilir adımlar verirsin. Sadece JSON döndür.",
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

export interface DailyLaunchResult {
  date: string;
  topTaskTitle: string;
  firstStep: string;
  doneCriteria: string;
  source: "ai" | "fallback";
}

/** Günün en önemli görevi + ilk adım + tamamlanma ölçütü. */
export async function generateDailyLaunch(
  ctx: MentorContext,
  dateKey: string,
): Promise<DailyLaunchResult> {
  const top = firstPending(ctx);
  const fallback: DailyLaunchResult = {
    date: dateKey,
    topTaskTitle: top?.title ?? "Bugünün en önemli işi",
    firstStep: top?.firstAction
      ? top.firstAction
      : top
        ? `"${top.title}" için ilk 5 dakikayı ayır ve en küçük parçayı bitir.`
        : "Bugün için tek bir görev seç ve 5 dakika başla.",
    doneCriteria: top
      ? `"${top.title}" tamamlandığında ortaya çıkan somut çıktı hazır olmalı.`
      : "Somut bir çıktı üretilmiş olmalı.",
    source: "fallback",
  };

  if (!top) return fallback;

  try {
    const text = await generateText({
      prompt: `Bağlam (JSON):\n${JSON.stringify(contextPayload(ctx))}\n\nBugünün en önemli görevini seç ve şu JSON'u döndür:\n{"topTaskTitle":"...","firstStep":"ilk 5 dakikada yapılacak tek şey","doneCriteria":"tamamlanma ölçütü"}\nKısa tut. Sadece JSON.`,
      system:
        "Sen Adaptime mentorüsün. Gerçekçi, kısa ve uygulanabilir plan yaparsın. Sadece JSON döndür.",
      temperature: 0.4,
      maxOutputTokens: 260,
    });
    const parsed = extractJson<Partial<DailyLaunchResult>>(text);
    if (parsed?.topTaskTitle && parsed.firstStep && parsed.doneCriteria) {
      return {
        date: dateKey,
        topTaskTitle: String(parsed.topTaskTitle).slice(0, 120),
        firstStep: String(parsed.firstStep).slice(0, 200),
        doneCriteria: String(parsed.doneCriteria).slice(0, 200),
        source: "ai",
      };
    }
    return fallback;
  } catch {
    return fallback;
  }
}
