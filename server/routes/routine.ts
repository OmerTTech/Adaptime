import { Router } from "express";
import { Routine, type ITaskBlock } from "../models/Routine.js";
import { TaskArchive } from "../models/Archive.js";
import { authMiddleware, type AuthRequest } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { sendWebhook } from "../services/webhook.js";

const router = Router();

function plainTask(task: ITaskBlock): Record<string, unknown> {
  const raw = task as unknown as { toObject?: () => Record<string, unknown> };
  const data = typeof raw.toObject === "function" ? raw.toObject() : { ...task };
  delete (data as { _id?: unknown })._id;
  return data;
}

/**
 * Kaydetme sırasında listeden düşen görevleri arşive yazar.
 * Kullanıcı yanlışlıkla silse bile görev kaybolmaz.
 */
async function archiveRemoved(
  userId: string,
  dateKey: string,
  before: ITaskBlock[],
  after: ITaskBlock[],
) {
  const titles = new Set(
    after.map((t) => String(t.title ?? "").trim().toLowerCase()),
  );
  const gone = before.filter(
    (t) => !titles.has(String(t.title ?? "").trim().toLowerCase()),
  );
  if (gone.length === 0) return;
  await TaskArchive.insertMany(
    gone.map((task) => ({
      userId,
      dateKey,
      task: plainTask(task),
      reason: "deleted" as const,
    })),
    { ordered: false },
  );
}

function parseDate(date: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (
    d.getFullYear() !== Number(m[1]) ||
    d.getMonth() !== Number(m[2]) - 1 ||
    d.getDate() !== Number(m[3])
  ) {
    return null;
  }
  return d;
}

function dateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const FREEZES_PER_MONTH = 2;

/**
 * Gerçek streak: bugün ya da dün "completed" görev içeren ve kesintisiz
 * devam eden gün sayısı. Dondurulmuş günler zinciri sürdürür ama sayıya
 * eklenmez (ayda en fazla 2 gün).
 */
async function streakData(userId: string) {
  const [routines, user] = await Promise.all([
    Routine.find({ userId }).sort({ date: -1 }).select("date tasks"),
    User.findById(userId).select("streakFreezeDates"),
  ]);

  const completedDates = new Set(
    routines
      .filter((r) =>
        r.tasks.some((t: ITaskBlock) => t.status === "completed"),
      )
      .map((r) => r.date),
  );
  const frozenDates = new Set(user?.streakFreezeDates ?? []);

  const today = new Date();
  const todayKey = dateString(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = dateString(yesterday);

  const hasToday = completedDates.has(todayKey);
  let cursor = new Date(today);
  if (!completedDates.has(todayKey) && !frozenDates.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (
    completedDates.has(dateString(cursor)) ||
    frozenDates.has(dateString(cursor))
  ) {
    if (completedDates.has(dateString(cursor))) streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const monthKey = todayKey.slice(0, 7);
  const usedThisMonth = [...frozenDates].filter((d) =>
    d.startsWith(monthKey),
  ).length;
  const freezesLeft = Math.max(0, FREEZES_PER_MONTH - usedThisMonth);

  // Dün boş kaldıysa ve ondan önceki gün seriye dahilse dondurma anlamlı.
  const beforeYesterday = new Date(today);
  beforeYesterday.setDate(beforeYesterday.getDate() - 2);
  const beforeKey = dateString(beforeYesterday);
  const canFreezeYesterday =
    freezesLeft > 0 &&
    !completedDates.has(yesterdayKey) &&
    !frozenDates.has(yesterdayKey) &&
    (completedDates.has(beforeKey) || frozenDates.has(beforeKey));

  const startedDates = new Set(routines.map((r) => r.date));

  return {
    currentStreak: streak,
    completedDates: [...completedDates],
    totalDates: [...startedDates],
    todayIsCompleted: hasToday,
    frozenDates: [...frozenDates],
    freezesLeft,
    freezesPerMonth: FREEZES_PER_MONTH,
    canFreezeYesterday,
    yesterdayCompleted: completedDates.has(yesterdayKey),
  };
}

router.get("/streak", authMiddleware, async (req: AuthRequest, res) => {
  try {
    res.json(await streakData(String(req.userId)));
  } catch (error) {
    console.error("Get streak error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

/** Ayda 2 hak: dünü (veya son 7 günden birini) dondurup seriyi korur. */
router.post("/streak/freeze", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

    const today = new Date();
    const todayKey = dateString(today);
    const requested =
      typeof req.body?.date === "string" ? req.body.date : undefined;
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const target = requested ?? dateString(yesterday);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(target) || target >= todayKey) {
      return res.status(400).json({ error: "Geçerli bir geçmiş gün seç" });
    }
    const targetDate = new Date(`${target}T00:00:00`);
    const daysAgo = Math.floor(
      (today.getTime() - targetDate.getTime()) / 86_400_000,
    );
    if (daysAgo > 7) {
      return res.status(400).json({ error: "Yalnızca son 7 gün dondurulabilir" });
    }

    const dates = user.streakFreezeDates ?? [];
    if (!dates.includes(target)) {
      const monthKey = target.slice(0, 7);
      const used = dates.filter((d) => d.startsWith(monthKey)).length;
      if (used >= FREEZES_PER_MONTH) {
        return res
          .status(400)
          .json({ error: "Bu ay için 2 dondurma hakkı doldu" });
      }
      user.streakFreezeDates = [...dates, target];
      await user.save();
    }

    res.json(await streakData(String(req.userId)));
  } catch (error) {
    console.error("Streak freeze error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Get recent history (last n days)
router.get("/history", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 90);
    const routines = await Routine.find({ userId: req.userId })
      .sort({ date: -1 })
      .limit(limit)
      .select("date tasks dayEndTime streak");

    res.json(routines);
  } catch (error) {
    console.error("Get history error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Son günlerde tamamlanmamış tekrarlayan görevler (telafi kartı için)
router.get("/missed-repeats", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const days = [];
    for (let i = 1; i <= 3; i += 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(dateString(d));
    }

    const routines = await Routine.find({
      userId: req.userId,
      date: { $in: days },
    });

    const missed = routines.flatMap((routine) =>
      routine.tasks
        .filter(
          (t: ITaskBlock) =>
            Boolean(t.repeat) &&
            t.status !== "completed" &&
            t.status !== "skipped",
        )
        .map((t: ITaskBlock) => ({
          date: routine.date,
          taskId: String((t as { _id?: unknown })._id ?? ""),
          title: t.title,
          color: t.color,
          repeat: t.repeat,
          startTime: t.startTime ?? null,
          endTime: t.endTime ?? null,
          originalDuration: t.originalDuration ?? null,
        })),
    );

    missed.sort((a, b) => a.date.localeCompare(b.date));
    res.json({ missed });
  } catch (error) {
    console.error("Missed repeats error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Kaçırılan tekrar için karar: bugüne taşı / atla / sil
router.post("/:date/missed-action", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    const { taskId, action } = req.body as {
      taskId?: string;
      action?: "move" | "skip" | "delete";
    };
    if (!taskId || !action) {
      return res.status(400).json({ error: "taskId ve action gerekli" });
    }

    const routine = await Routine.findOne({ userId: req.userId, date });
    if (!routine) return res.status(404).json({ error: "Rutin bulunamadı" });

    const task = routine.tasks.find(
      (t: ITaskBlock) => String((t as { _id?: unknown })._id ?? "") === taskId,
    );
    if (!task) return res.status(404).json({ error: "Görev bulunamadı" });

    if (action === "move") {
      const duration =
        task.originalDuration ??
        (task.startTime && task.endTime ? task.endTime - task.startTime : 30 * 60_000);

      // Aynı saat dilimini bugüne taşı; saat geçmişteyse şimdi + 5 dk.
      const now = Date.now();
      let start = Math.floor(now / 60_000) * 60_000 + 5 * 60_000;
      if (task.startTime) {
        const src = new Date(task.startTime);
        const candidate = new Date();
        candidate.setHours(src.getHours(), src.getMinutes(), 0, 0);
        if (candidate.getTime() > now) start = candidate.getTime();
      }

      const todayKey = dateString(new Date());
      await Routine.findOneAndUpdate(
        { userId: req.userId, date: todayKey },
        {
          $setOnInsert: { date: todayKey, streak: 0 },
          $push: {
            tasks: {
              title: task.title,
              description: task.description,
              color: task.color,
              status: "pending",
              priority: task.priority ?? "medium",
              category: task.category ?? "work",
              repeat: task.repeat,
              repeatDays: task.repeatDays,
              parallel: task.parallel,
              estimatedMinutes: task.estimatedMinutes,
              startTime: start,
              endTime: start + duration,
              originalDuration: duration,
              pausedDuration: 0,
              flowExtensions: 0,
              progress: 0,
              delayCount: 0,
              createdAtClient: Date.now(),
              subtasks: (task.subtasks ?? []).map((s) => ({
                title: s.title,
                done: false,
              })),
            },
          },
          $max: { dayEndTime: start + duration },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
      );
      task.status = "skipped";
      await routine.save();
      return res.json({ ok: true, moved: true });
    }

    if (action === "skip") {
      task.status = "skipped";
      await routine.save();
      return res.json({ ok: true });
    }

    routine.tasks = routine.tasks.filter(
      (t: ITaskBlock) => String((t as { _id?: unknown })._id ?? "") !== taskId,
    );
    await routine.save();
    return res.json({ ok: true, deleted: true });
  } catch (error) {
    console.error("Missed action error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

/**
 * Saatsiz ("Yapılacaklar") görevler günü aşar: tamamlanmadıkça her gün
 * bugünün planına devredilir. Kaynak gün "skipped" işaretlenir, böylece
 * iki yerde birden görünmez; silinene veya tamamlanana kadar dolaşım sürer.
 */
export async function rollForwardTodos(
  userId: string,
  todayKey: string,
): Promise<number> {
  const lookback = new Date(`${todayKey}T12:00:00`);
  lookback.setDate(lookback.getDate() - 30);

  const previous = await Routine.find({
    userId,
    date: { $gte: dateString(lookback), $lt: todayKey },
  }).select("date tasks");
  if (previous.length === 0) return 0;

  const todayRoutine = await Routine.findOne({ userId, date: todayKey });

  // Aynı görev zinciri başlıkla değil originId ile eşleşir; böylece aynı
  // başlıklı iki ayrı görev birbirini sessizce yutmaz. originId'si olmayan
  // eski kayıtlar için başlık yedeği korunur.
  const seenOrigins = new Set<string>();
  const seenTitles = new Set<string>();
  for (const t of todayRoutine?.tasks ?? []) {
    const origin = String(t.originId ?? "").trim();
    if (origin) seenOrigins.add(origin);
    else seenTitles.add(String(t.title ?? "").trim().toLowerCase());
  }

  const carry: Record<string, unknown>[] = [];

  for (const past of previous) {
    let changed = false;
    for (const task of past.tasks as ITaskBlock[]) {
      // Tamamlanan görev asla klonlanmaz. Aktif/duraklatılmış görev önce
      // duraklatılır; geçen süre ve ilerleme korunarak taşınır.
      if (
        task.status !== "pending" &&
        task.status !== "active" &&
        task.status !== "paused"
      ) {
        continue;
      }

      // Tekrarlayan (ritüel) görevleri repeat kuralı üretir; devir çalışmaz.
      // Böylece iki mekanizma aynı görevde aynı anda çalışmaz.
      if (task.repeat) continue;

      // Varsayılan: saatsiz todo kalıcı, saatli görev tek seferlik.
      const policy =
        task.carryPolicy ?? (task.startTime ? "once" : "rolling");
      if (policy !== "rolling") continue;

      const origin = String(task.originId ?? "").trim();
      const titleKey = String(task.title ?? "").trim().toLowerCase();
      if (origin ? seenOrigins.has(origin) : seenTitles.has(titleKey)) {
        task.status = "skipped";
        changed = true;
        continue;
      }
      if (origin) seenOrigins.add(origin);
      else seenTitles.add(titleKey);

      let scheduledStart: number | undefined;
      let scheduledEnd: number | undefined;
      if (task.startTime) {
        const originTime = new Date(task.startTime);
        const target = new Date(`${todayKey}T00:00:00`);
        target.setHours(originTime.getHours(), originTime.getMinutes(), 0, 0);
        const duration =
          task.endTime && task.endTime > task.startTime
            ? task.endTime - task.startTime
            : (task.estimatedMinutes ?? 30) * 60_000;
        // Saati geçmişse saatsiz todo olarak devret.
        if (target.getTime() > Date.now()) {
          scheduledStart = target.getTime();
          scheduledEnd = target.getTime() + duration;
        }
      }

      const snapshot = plainTask(task);
      delete snapshot.startTime;
      delete snapshot.endTime;
      delete snapshot.originalDuration;

      carry.push({
        ...snapshot,
        ...(scheduledStart && scheduledEnd
          ? {
              startTime: scheduledStart,
              endTime: scheduledEnd,
              originalDuration: scheduledEnd - scheduledStart,
            }
          : {
              estimatedMinutes:
                task.estimatedMinutes ??
                (task.startTime && task.endTime
                  ? Math.max(
                      5,
                      Math.round((task.endTime - task.startTime) / 60_000),
                    )
                  : 30),
            }),
        status: "pending",
        carriedFrom: past.date,
        originId: origin || String((task as { _id?: unknown })._id ?? titleKey),
        carryPolicy: "rolling",
        carryCount: (task.carryCount ?? 0) + 1,
        pausedAt: undefined,
        startedAt: undefined,
        // Duraklatma süresi ve ilerleme korunur; sıfırlanmaz.
        pausedDuration: task.pausedDuration ?? 0,
        progress: task.progress ?? 0,
      });
      task.status = "skipped";
      changed = true;
    }

    if (changed) {
      past.markModified("tasks");
      await past.save();
    }
  }

  if (carry.length === 0) return 0;

  await Routine.findOneAndUpdate(
    { userId, date: todayKey },
    {
      $setOnInsert: { date: todayKey, streak: 0 },
      $inc: { revision: 1 },
      $push: { tasks: { $each: carry } },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      runValidators: true,
    },
  );

  return carry.length;
}

// Dün(ler)den devam eden görevler: tamamlanmamış planlı/plansız görevler
router.get("/unfinished", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const requested = typeof req.query.date === "string" ? req.query.date : null;
    const base = requested && parseDate(requested) ? new Date(requested) : new Date();
    if (!requested) base.setDate(base.getDate() - 1);
    const date = dateString(base);

    const routine = await Routine.findOne({ userId: req.userId, date });
    const tasks = (routine?.tasks ?? [])
      .filter(
        (t: ITaskBlock) => t.status !== "completed" && t.status !== "skipped",
      )
      .map((t: ITaskBlock) => ({
        date,
        taskId: String((t as { _id?: unknown })._id ?? ""),
        title: t.title,
        color: t.color,
        status: t.status,
        priority: t.priority ?? "medium",
        category: t.category ?? "work",
        startTime: t.startTime ?? null,
        endTime: t.endTime ?? null,
        estimatedMinutes: t.estimatedMinutes ?? null,
        subtaskCount: (t.subtasks ?? []).length,
      }));

    res.json({ date, tasks });
  } catch (error) {
    console.error("Unfinished tasks error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Bir günün tamamlanmamış görevlerini bugüne taşı ya da atla
router.post("/:date/carry-all", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    const { action, targetDate } = req.body as {
      action?: "move" | "skip";
      targetDate?: string;
    };
    if (action !== "move" && action !== "skip") {
      return res.status(400).json({ error: "Geçersiz işlem" });
    }

    const routine = await Routine.findOne({ userId: req.userId, date });
    if (!routine) return res.json({ ok: true, moved: 0 });

    const unfinished = routine.tasks.filter(
      (t: ITaskBlock) => t.status !== "completed" && t.status !== "skipped",
    );

    if (action === "skip") {
      unfinished.forEach((t: ITaskBlock) => {
        t.status = "skipped";
      });
      await routine.save();
      return res.json({ ok: true, skipped: unfinished.length });
    }

    // Hedef gün: akşam özetindeki "yarına devret" yarını gönderir;
    // diğer çağrılar bugüne taşır.
    const todayKey = dateString(new Date());
    const targetKey =
      targetDate && parseDate(targetDate) ? targetDate : todayKey;
    if (targetKey === date) {
      return res.json({ ok: true, moved: 0 });
    }

    const now = Date.now();
    const futureTarget = targetKey > todayKey;
    const clones = unfinished.map((t: ITaskBlock) => {
      const duration =
        t.originalDuration ??
        (t.startTime && t.endTime ? t.endTime - t.startTime : 30 * 60_000);
      let start: number | undefined;
      if (t.startTime) {
        const src = new Date(t.startTime);
        const candidate = new Date(`${targetKey}T00:00:00`);
        candidate.setHours(src.getHours(), src.getMinutes(), 0, 0);
        // Yarın için saat korunur; bugüne taşırken geçmiş saatler atlanır.
        if (futureTarget || candidate.getTime() > now) {
          start = candidate.getTime();
        }
      }
      return {
        title: t.title,
        description: t.description,
        color: t.color,
        status: "pending",
        carriedFrom: date,
        priority: t.priority ?? "medium",
        category: t.category ?? "work",
        repeat: t.repeat,
        repeatDays: t.repeatDays,
        parallel: t.parallel,
        estimatedMinutes: t.estimatedMinutes,
        ...(start
          ? {
              startTime: start,
              endTime: start + duration,
              originalDuration: duration,
            }
          : {}),
        pausedDuration: 0,
        flowExtensions: 0,
        progress: 0,
        delayCount: 0,
        createdAtClient: Date.now(),
        subtasks: (t.subtasks ?? []).map((s) => ({
          title: s.title,
          done: false,
        })),
      };
    });

    const dayEnd = Math.max(
      ...clones.map((c) => c.endTime ?? 0),
      0,
    );

    await Routine.findOneAndUpdate(
      { userId: req.userId, date: targetKey },
      {
        $setOnInsert: { date: targetKey, streak: 0 },
        $push: { tasks: { $each: clones } },
        $max: { dayEndTime: dayEnd },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
    );

    unfinished.forEach((t: ITaskBlock) => {
      t.status = "skipped";
    });
    await routine.save();

    res.json({ ok: true, moved: clones.length });
  } catch (error) {
    console.error("Carry all error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Son silinen görevler (arşiv)
router.get("/archive", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    // Geri yüklenenler listede tekrar görünmesin.
    const items = await TaskArchive.find({ userId: req.userId, restoredAt: null })
      .sort({ removedAt: -1 })
      .limit(limit);
    res.json({
      items: items.map((item) => ({
        id: String(item._id),
        dateKey: item.dateKey,
        removedAt: item.removedAt?.getTime?.() ?? 0,
        title: String((item.task as { title?: unknown }).title ?? ""),
        color: String((item.task as { color?: unknown }).color ?? "#6366f1"),
      })),
    });
  } catch (error) {
    console.error("Archive list error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Arşivden bugüne geri yükle
router.post("/archive/:id/restore", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const item = await TaskArchive.findOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!item) return res.status(404).json({ error: "Kayıt bulunamadı" });

    const snapshot = item.task as Record<string, unknown>;
    const todayKey = dateString(new Date());

    await Routine.findOneAndUpdate(
      { userId: req.userId, date: todayKey },
      {
        $setOnInsert: { date: todayKey, streak: 0 },
        $push: {
          tasks: {
            title: String(snapshot.title ?? "Geri yüklenen görev"),
            description: snapshot.description,
            color: snapshot.color ?? "#6366f1",
            status: "pending",
            priority: snapshot.priority ?? "medium",
            category: snapshot.category ?? "work",
            repeat: snapshot.repeat,
            repeatDays: snapshot.repeatDays,
            parallel: snapshot.parallel,
            estimatedMinutes: snapshot.estimatedMinutes,
            pausedDuration: 0,
            flowExtensions: 0,
            progress: 0,
            delayCount: 0,
            createdAtClient: Date.now(),
            subtasks: Array.isArray(snapshot.subtasks)
              ? (snapshot.subtasks as Array<{ title?: string; done?: boolean }>).map(
                  (s) => ({ title: String(s.title ?? ""), done: Boolean(s.done) }),
                )
              : [],
          },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
    );

    item.restoredAt = new Date();
    await item.save();

    res.json({ ok: true });
  } catch (error) {
    console.error("Archive restore error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Önümüzdeki günlerin ufku (varsayılan 7 gün, yarından başlar)
router.get("/horizon", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 14);
    const base = new Date();
    const dates: string[] = [];
    for (let i = 1; i <= days; i += 1) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      dates.push(dateString(d));
    }

    const routines = await Routine.find({
      userId: req.userId,
      date: { $in: dates },
    }).select("date tasks");

    const byDate = new Map(
      routines.map((r) => [r.date, r.tasks as ITaskBlock[]]),
    );

    res.json({
      days: dates.map((date) => ({
        date,
        tasks: (byDate.get(date) ?? []).map((t: ITaskBlock) => ({
          title: t.title,
          color: t.color,
          status: t.status,
          startTime: t.startTime ?? null,
          endTime: t.endTime ?? null,
          estimatedMinutes: t.estimatedMinutes ?? null,
        })),
      })),
    });
  } catch (error) {
    console.error("Horizon error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Takvim özeti: ay ızgarası veya yıl görünümü için gün başına sayılar.
router.get("/calendar", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const view = req.query.view === "year" ? "year" : "month";
    const anchor = typeof req.query.anchor === "string" && parseDate(req.query.anchor)
      ? req.query.anchor
      : dateString(new Date());
    const [ay, am, ad] = anchor.split("-").map(Number);

    const start = view === "year"
      ? new Date(ay, 0, 1)
      : new Date(ay, am - 1, 1);
    const end = view === "year"
      ? new Date(ay, 11, 31, 23, 59, 59, 999)
      : new Date(ay, am, 0, 23, 59, 59, 999);

    const routines = await Routine.find({
      userId: req.userId,
      date: { $gte: dateString(start), $lte: dateString(end) },
    }).select("date tasks");

    const buckets = new Map<
      string,
      { planned: number; done: number; open: number; repeats: number; total: number }
    >();
    for (const routine of routines) {
      const tasks = routine.tasks as ITaskBlock[];
      buckets.set(routine.date, {
        planned: tasks.filter((t) => t.startTime).length,
        done: tasks.filter((t) => t.status === "completed").length,
        open: tasks.filter((t) => t.status !== "completed" && t.status !== "skipped").length,
        repeats: tasks.filter((t) => Boolean(t.repeat)).length,
        total: tasks.length,
      });
    }

    // Tekrarlayan görevler ay ızgarasında da görünsün: her gün için sanal sayım.
    if (view === "month") {
      const lookback = new Date(start);
      lookback.setDate(lookback.getDate() - 60);
      const sources = await Routine.find({
        userId: req.userId,
        date: { $gte: dateString(lookback), $lte: dateString(end) },
      }).select("date tasks");

      const repeatTasks = new Map<string, ITaskBlock>();
      for (const source of sources) {
        for (const task of source.tasks as ITaskBlock[]) {
          if (!task.repeat) continue;
          const key = task.title.trim().toLowerCase();
          if (!repeatTasks.has(key)) repeatTasks.set(key, task);
        }
      }

      const titlesByDate = new Map<string, Set<string>>();
      for (const source of sources) {
        titlesByDate.set(
          source.date,
          new Set(
            (source.tasks as ITaskBlock[]).map((t) =>
              t.title.trim().toLowerCase(),
            ),
          ),
        );
      }

      for (let d = 1; d <= end.getDate(); d += 1) {
        const day = new Date(ay, am - 1, d);
        const key = dateString(day);
        const bucket = buckets.get(key) ?? {
          planned: 0,
          done: 0,
          open: 0,
          repeats: 0,
          total: 0,
        };
        const titles = titlesByDate.get(key) ?? new Set<string>();
        for (const [title, task] of repeatTasks) {
          if (titles.has(title)) continue;
          if (!repeatMatches(task, day)) continue;
          bucket.total += 1;
          bucket.open += 1;
          bucket.repeats += 1;
        }
        if (bucket.total > 0) buckets.set(key, bucket);
      }
    }

    if (view === "year") {
      const months = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        planned: 0,
        done: 0,
        open: 0,
        total: 0,
      }));
      for (const [key, value] of buckets) {
        const m = Number(key.split("-")[1]) - 1;
        if (!months[m]) continue;
        months[m].planned += value.planned;
        months[m].done += value.done;
        months[m].open += value.open;
        months[m].total += value.total;
      }
      return res.json({ view, year: ay, months, today: dateString(new Date()) });
    }

    res.json({
      view,
      year: ay,
      month: am,
      today: dateString(new Date()),
      days: [...buckets.entries()].map(([date, value]) => ({ date, ...value })),
    });
  } catch (error) {
    console.error("Calendar error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

/** Tekrarlayan görev bu güne denk geliyor mu? */
function repeatMatches(task: ITaskBlock, target: Date): boolean {
  if (!task.repeat) return false;
  const originMs = task.startTime ?? task.createdAtClient ?? Date.now();
  const origin = new Date(originMs);
  const originDay = new Date(origin).setHours(0, 0, 0, 0);
  const targetDay = new Date(target).setHours(0, 0, 0, 0);
  if (targetDay <= originDay) return false;
  switch (task.repeat) {
    case "daily":
    case "hourly":
      return true;
    case "weekly":
      return target.getDay() === origin.getDay();
    case "monthly":
      return target.getDate() === origin.getDate();
    case "custom":
      return (task.repeatDays ?? []).includes(target.getDay());
    default:
      return false;
  }
}

// Takvimde seçilen günün tam planı: kayıtlı görevler + tekrarlardan gelenler.
router.get("/day-full", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const requested = typeof req.query.date === "string" && parseDate(req.query.date)
      ? req.query.date
      : dateString(new Date());
    const target = new Date(`${requested}T12:00:00`);

    if (requested === dateString(new Date())) {
      await rollForwardTodos(String(req.userId), requested);
    }

    const routine = await Routine.findOne({ userId: req.userId, date: requested }).select("-__v");
    const stored = (routine?.tasks ?? []) as ITaskBlock[];

    const lookback = new Date(target);
    lookback.setDate(lookback.getDate() - 60);

    const previous = await Routine.find({
      userId: req.userId,
      date: { $gte: dateString(lookback), $lt: requested },
    }).select("date tasks");

    const storedTitles = new Set(stored.map((t) => t.title.trim().toLowerCase()));
    const virtual: Array<Record<string, unknown>> = [];

    for (const past of previous) {
      for (const task of past.tasks as ITaskBlock[]) {
        if (!task.repeat) continue;
        if (!repeatMatches(task, target)) continue;
        const key = task.title.trim().toLowerCase();
        if (storedTitles.has(key)) continue;
        storedTitles.add(key);

        let startTime: number | null = null;
        let endTime: number | null = null;
        if (task.startTime) {
          const origin = new Date(task.startTime);
          const shifted = new Date(target);
          shifted.setHours(origin.getHours(), origin.getMinutes(), 0, 0);
          startTime = shifted.getTime();
          const duration = task.endTime ? task.endTime - task.startTime : 30 * 60_000;
          endTime = startTime + duration;
        }

        virtual.push({
          id: `virtual-${String((task as { _id?: unknown })._id ?? key)}`,
          title: task.title,
          color: task.color,
          status: "pending",
          startTime,
          endTime,
          estimatedMinutes: task.estimatedMinutes ?? null,
          priority: task.priority ?? "medium",
          category: task.category ?? "work",
          repeat: task.repeat ?? null,
          sourceDate: past.date,
          virtual: true,
        });
      }
    }

    res.json({
      date: requested,
      dayEndTime: routine?.dayEndTime ?? 0,
      streak: routine?.streak ?? 0,
      isToday: requested === dateString(new Date()),
      tasks: [
        ...stored.map((t) => ({
          id: String((t as { _id?: unknown })._id ?? ""),
          title: t.title,
          color: t.color,
          status: t.status,
          startTime: t.startTime ?? null,
          endTime: t.endTime ?? null,
          estimatedMinutes: t.estimatedMinutes ?? null,
          priority: t.priority ?? "medium",
          category: t.category ?? "work",
          repeat: t.repeat ?? null,
          subtaskCount: (t.subtasks ?? []).length,
          virtual: false,
        })),
        ...virtual,
      ],
    });
  } catch (error) {
    console.error("Day full error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Seçili gündeki tek görevi güncelle (takvim görünümü için).
router.post("/:date/task-update", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    const { taskId, patch } = req.body as {
      taskId?: string;
      patch?: {
        status?: string;
        title?: string;
        startTime?: number | null;
        endTime?: number | null;
        estimatedMinutes?: number | null;
        /** Verilirse görev bu güne taşınır. */
        date?: string;
      };
    };
    if (!taskId || !patch) return res.status(400).json({ error: "Eksik bilgi" });

    const routine = await Routine.findOne({ userId: req.userId, date });
    if (!routine) return res.status(404).json({ error: "Gün bulunamadı" });

    const task = (routine.tasks as ITaskBlock[]).find(
      (t) => String((t as { _id?: unknown })._id) === taskId,
    );
    if (!task) return res.status(404).json({ error: "Görev bulunamadı" });

    const wasCompleted = task.status === "completed";
    if (patch.status) task.status = patch.status as ITaskBlock["status"];
    if (patch.title) task.title = patch.title;
    if (patch.startTime !== undefined) {
      task.startTime = patch.startTime ?? undefined;
      if (!patch.startTime) task.endTime = undefined;
    }
    if (patch.endTime !== undefined) {
      task.endTime = patch.endTime ?? undefined;
    }
    if (patch.estimatedMinutes !== undefined) {
      task.estimatedMinutes = patch.estimatedMinutes ?? undefined;
    }
    if (task.startTime && task.endTime && task.endTime > task.startTime) {
      task.originalDuration = task.endTime - task.startTime;
    }

    // Günü değiştirme: görev kaynak günden çıkar, hedef güne eklenir.
    if (patch.date && patch.date !== date) {
      if (!parseDate(patch.date)) {
        return res.status(400).json({ error: "Geçersiz tarih" });
      }

      const snapshot = plainTask(task);
      delete snapshot._id;
      // Taşınan görev yeni günde yeniden açılır: atlanmış görev "bekliyor" olur.
      snapshot.status = task.status === "completed" ? "completed" : "pending";
      snapshot.pausedDuration = 0;
      delete snapshot.startedAt;
      delete snapshot.pausedAt;

      await Routine.updateOne(
        { _id: routine._id },
        { $pull: { tasks: { _id: taskId } } },
      );

      await Routine.findOneAndUpdate(
        { userId: req.userId, date: patch.date },
        {
          $setOnInsert: { date: patch.date, streak: 0 },
          $push: { tasks: snapshot },
          $max: { dayEndTime: Number(task.endTime) || 0 },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
          runValidators: true,
        },
      );

      return res.json({ ok: true, movedTo: patch.date });
    }

    routine.markModified("tasks");
    await routine.save();

    // 4.2 — görev tamamlandığında dışarıya olay gönder (varsa).
    if (!wasCompleted && task.status === "completed" && req.userId) {
      void sendWebhook(String(req.userId), {
        event: "task.completed",
        date,
        task: {
          id: taskId,
          title: task.title,
          priority: task.priority ?? "medium",
          category: task.category ?? "other",
          startTime: task.startTime ?? null,
          endTime: task.endTime ?? null,
          completedAt: task.completedAt ?? Date.now(),
        },
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("Task update error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Seçili gündeki bir görevi kopyala (kopya saatsiz/yapılacak olarak eklenir).
router.post("/:date/task-duplicate", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    const taskId = req.body?.taskId as string | undefined;
    if (!taskId) return res.status(400).json({ error: "Görev gerekli" });

    const routine = await Routine.findOne({ userId: req.userId, date });
    if (!routine) return res.status(404).json({ error: "Gün bulunamadı" });

    const task = (routine.tasks as ITaskBlock[]).find(
      (t) => String((t as { _id?: unknown })._id) === taskId,
    );
    if (!task) return res.status(404).json({ error: "Görev bulunamadı" });

    const minutes =
      task.startTime && task.endTime
        ? Math.max(5, Math.round((task.endTime - task.startTime) / 60_000))
        : (task.estimatedMinutes ?? 30);

    const snapshot = plainTask(task);
    delete snapshot._id;
    delete snapshot.startTime;
    delete snapshot.endTime;
    delete snapshot.originalDuration;
    delete snapshot.startedAt;
    delete snapshot.pausedAt;
    delete snapshot.completedAt;

    await Routine.updateOne(
      { _id: routine._id },
      {
        $push: {
          tasks: {
            ...snapshot,
            title: `${task.title} (kopya)`,
            status: "pending",
            pausedDuration: 0,
            flowExtensions: 0,
            progress: 0,
            delayCount: 0,
            estimatedMinutes: minutes,
            createdAtClient: Date.now(),
            subtasks: (task.subtasks ?? []).map((s) => ({
              title: s.title,
              done: false,
            })),
          },
        },
      },
    );

    res.json({ ok: true });
  } catch (error) {
    console.error("Task duplicate error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Seçili günden tek görevi sil (arşive de yazar).
router.post("/:date/task-delete", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    const taskId = req.body?.taskId as string | undefined;
    if (!taskId) return res.status(400).json({ error: "Görev gerekli" });

    const routine = await Routine.findOne({ userId: req.userId, date });
    if (!routine) return res.status(404).json({ error: "Gün bulunamadı" });

    const task = (routine.tasks as ITaskBlock[]).find(
      (t) => String((t as { _id?: unknown })._id) === taskId,
    );
    if (!task) return res.status(404).json({ error: "Görev bulunamadı" });

    await TaskArchive.create({
      userId: req.userId,
      dateKey: String(date),
      task: plainTask(task),
      reason: "deleted",
    });

    await Routine.updateOne(
      { _id: routine._id },
      { $pull: { tasks: { _id: taskId } } },
    );

    res.json({ ok: true });
  } catch (error) {
    console.error("Task delete error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Get routine for a specific date (must be defined AFTER /streak & /history)
router.get("/:date", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    if (typeof date !== "string" || !parseDate(date)) {
      return res.status(400).json({ error: "Geçersiz tarih formatı" });
    }

    // Yeni güne geçildiyse saatsiz görevler bugüne devredilir.
    if (date === dateString(new Date())) {
      await rollForwardTodos(String(req.userId), date);
    }

    const routine = await Routine.findOne({
      userId: req.userId,
      date,
    }).select("-__v");

    if (!routine) {
      return res.json(null);
    }

    res.json(routine);
  } catch (error) {
    console.error("Get routine error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Create or update routine
router.post("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { date, tasks, dayEndTime, streak, baseRevision } = req.body;
    if (!date) {
      return res.status(400).json({ error: "Tarih gerekli" });
    }

    // Silinen görevler arşive gider: yanlışlıkla silme geri alınabilir olsun.
    const existing = await Routine.findOne({ userId: req.userId, date });

    // Revision çakışması: günü başka bir cihaz (ya da gece devri) değiştirdiyse
    // istemci körlemesine üzerine yazmaz; önce kullanıcıya sorulur.
    if (
      existing &&
      typeof baseRevision === "number" &&
      (existing.revision ?? 0) !== baseRevision
    ) {
      return res.status(409).json({
        error: "Plan başka bir cihazda değişti",
        conflict: true,
        revision: existing.revision ?? 0,
        // İstemci "bu cihazda ne farklı" özetini gösterebilsin diye sade liste.
        serverTasks: existing.tasks.map((task) => ({
          id: String((task as { _id?: unknown })._id ?? ""),
          title: task.title,
          status: task.status,
        })),
      });
    }

    if (existing) {
      await archiveRemoved(
        String(req.userId),
        date,
        existing.tasks,
        (tasks || []) as ITaskBlock[],
      );
    }

    const routine = await Routine.findOneAndUpdate(
      { userId: req.userId, date },
      {
        date,
        tasks: tasks || [],
        dayEndTime: dayEndTime || 0,
        streak: streak || 0,
        revision: (existing?.revision ?? 0) + 1,
      },
      { new: true, upsert: true, runValidators: true },
    ).select("-__v");

    res.json(routine);
  } catch (error) {
    console.error("Save routine error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Update tasks in a routine
router.put("/:date/tasks", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    const { tasks, dayEndTime } = req.body;

    const existing = await Routine.findOne({ userId: req.userId, date });
    if (existing) {
      await archiveRemoved(
        String(req.userId),
        String(date),
        existing.tasks,
        (tasks || []) as ITaskBlock[],
      );
    }

    const routine = await Routine.findOneAndUpdate(
      { userId: req.userId, date },
      {
        tasks: tasks || [],
        dayEndTime: dayEndTime || 0,
      },
      { new: true, runValidators: true },
    ).select("-__v");

    if (!routine) {
      return res.status(404).json({ error: "Rutin bulunamadı" });
    }

    res.json(routine);
  } catch (error) {
    console.error("Update tasks error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Tekrarlayan görevin sonraki örneğini bir güne ekle
router.post("/:date/append-task", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    const { task } = req.body;
    if (!task || typeof task.title !== "string" || !task.title.trim()) {
      return res.status(400).json({ error: "Görev gerekli" });
    }

    const routine = await Routine.findOneAndUpdate(
      { userId: req.userId, date },
      {
        $setOnInsert: { date, streak: 0 },
        $push: { tasks: task },
        $max: { dayEndTime: Number(task.endTime) || 0 },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    ).select("-__v");

    res.json({ ok: true, date: routine?.date ?? date });
  } catch (error) {
    console.error("Append task error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Delete routine
router.delete("/:date", authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { date } = req.params;
    await Routine.findOneAndDelete({ userId: req.userId, date });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete routine error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Delete ALL routines for the user (reset)
router.delete("/", authMiddleware, async (req: AuthRequest, res) => {
  try {
    await Routine.deleteMany({ userId: req.userId });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete all routines error:", error);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

export default router;
