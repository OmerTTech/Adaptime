import mongoose from "mongoose";
import { Routine, type ITaskBlock } from "../models/Routine.js";
import { DiaryEntry } from "../models/Diary.js";
import {
  ActivityLog,
  FocusSession,
  MentorCheck,
  MentorSettings,
  type ActivityKind,
  type IMentorSettings,
  type MentorTone,
} from "../models/Accountability.js";
import {
  composeCheckMessage,
  composeReply,
  detectSituation,
  fallbackCheckMessage,
  type MentorAction,
  type MentorContext,
  type MentorSituation,
  type MentorTask,
} from "./mentor.js";
import { dateKeyInTz, nextCheckAt, timeLabelInTz } from "./time.js";

export const DEFAULT_HOURS = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];

/* ------------------------------------------------------------------ */
/* Ayarlar                                                             */
/* ------------------------------------------------------------------ */

export async function getOrCreateSettings(
  userId: string,
): Promise<IMentorSettings> {
  const existing = await MentorSettings.findOne({ userId });
  if (existing) return existing;
  return MentorSettings.create({ userId });
}

export interface SettingsPatch {
  enabled?: boolean;
  timezone?: string;
  hours?: number[];
  tone?: MentorTone;
  snoozeMinutes?: number;
  maxSentences?: number;
  aiEnabled?: boolean;
  restUntil?: number | null;
  restReason?: string | null;
}

export function sanitizeSettings(settings: IMentorSettings) {
  return {
    enabled: settings.enabled,
    timezone: settings.timezone,
    hours: [...(settings.hours ?? DEFAULT_HOURS)].sort((a, b) => a - b),
    tone: settings.tone,
    snoozeMinutes: settings.snoozeMinutes,
    maxSentences: settings.maxSentences ?? 8,
    aiEnabled: settings.aiEnabled,
    restUntil: settings.restUntil ?? null,
    restReason: settings.restReason ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Görevler / bağlam                                                   */
/* ------------------------------------------------------------------ */

function taskIdOf(task: ITaskBlock): string {
  return String((task as { _id?: unknown })._id ?? "");
}

function toMentorTask(task: ITaskBlock): MentorTask {
  return {
    id: taskIdOf(task),
    title: task.title,
    status: task.status,
    priority: task.priority ?? "medium",
    startTime: task.startTime ?? null,
    endTime: task.endTime ?? null,
    deadline: task.deadline ?? null,
    estimatedMinutes: task.estimatedMinutes ?? null,
    firstAction: task.firstAction ?? null,
    delayCount: task.delayCount ?? 0,
    category: task.category ?? null,
  };
}

export async function buildContext(
  userId: string,
  settings: IMentorSettings,
  dateKey: string,
  now = Date.now(),
): Promise<MentorContext> {
  const routine = await Routine.findOne({ userId, date: dateKey });
  const tasks = (routine?.tasks ?? []).map(toMentorTask);

  const activeTask =
    tasks.find((t) => t.status === "active") ??
    tasks.find((t) => t.status === "paused") ??
    null;

  const overdue = tasks.filter((t) => {
    if (t.status === "completed" || t.status === "skipped") return false;
    const dueByDeadline = typeof t.deadline === "number" && t.deadline < now;
    const dueByPlan =
      t.status === "pending" &&
      typeof t.endTime === "number" &&
      t.endTime < now;
    return Boolean(dueByDeadline || dueByPlan);
  });

  const dueToday = tasks.filter(
    (t) =>
      t.status !== "completed" &&
      t.status !== "skipped" &&
      typeof t.deadline === "number" &&
      dateKeyInTz(new Date(t.deadline), settings.timezone) === dateKey,
  );

  const nextDeadlineTask =
    [...dueToday].sort((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0))[0] ??
    [...tasks]
      .filter((t) => typeof t.deadline === "number" && t.status !== "completed")
      .sort((a, b) => (a.deadline ?? 0) - (b.deadline ?? 0))[0] ??
    null;

  const [lastCheck, lastActivity, diary] = await Promise.all([
    MentorCheck.findOne({ userId, status: "answered" }).sort({ answeredAt: -1 }),
    ActivityLog.findOne({ userId }).sort({ startedAt: -1 }),
    DiaryEntry.findOne({ userId }).sort({ dateKey: -1 }).select(
      "dateKey highlights nextSteps learnings",
    ),
  ]);

  return {
    now,
    timezone: settings.timezone,
    localTime: timeLabelInTz(new Date(now), settings.timezone),
    tone: settings.tone,
    tasks,
    activeTask,
    overdue,
    dueToday,
    nextDeadline: nextDeadlineTask,
    lastMessage: lastCheck?.message ?? null,
    lastResponse: lastCheck?.response ?? null,
    lastActivityKind: lastActivity?.kind ?? null,
    lastActivityAt: lastActivity?.startedAt ?? null,
    restUntil: settings.restUntil ?? null,
    maxSentences: settings.maxSentences ?? 8,
    plannedCount: tasks.length,
    completedCount: tasks.filter((t) => t.status === "completed").length,
    diary: diary
      ? {
          dateKey: diary.dateKey,
          highlights: diary.highlights?.slice(0, 400) ?? "",
          nextSteps: diary.nextSteps?.slice(0, 400) ?? "",
          learnings: diary.learnings?.slice(0, 400) ?? "",
        }
      : null,
  };
}

function pickFocusTask(ctx: MentorContext): MentorTask | null {
  return (
    ctx.activeTask ??
    ctx.overdue[0] ??
    ctx.dueToday[0] ??
    ctx.tasks.find((t) => t.status === "pending") ??
    null
  );
}

/* ------------------------------------------------------------------ */
/* Kontrol oluşturma                                                   */
/* ------------------------------------------------------------------ */

export interface CreateCheckInput {
  userId: string;
  settings: IMentorSettings;
  dateKey: string;
  slot: string;
  dedupeKey: string;
  source: "scheduler" | "manual" | "followup";
}

export async function createCheck(input: CreateCheckInput) {
  const { userId, settings, dateKey, slot, dedupeKey, source } = input;

  // Idempotency: aynı saat için ikinci kez mesaj üretme / AI çağırma.
  const existing = await MentorCheck.findOne({ userId, dedupeKey });
  if (existing) return existing;

  const ctx = await buildContext(userId, settings, dateKey);
  const task = pickFocusTask(ctx);

  let message: string;
  let situation: MentorSituation = detectSituation(ctx);
  let messageSource: "ai" | "fallback" | "manual" = "fallback";

  if (!settings.aiEnabled) {
    message = fallbackCheckMessage(ctx, situation);
  } else {
    const result = await composeCheckMessage(ctx);
    message = result.message;
    situation = result.situation;
    messageSource = result.source;
  }

  try {
    return await MentorCheck.create({
      userId,
      dateKey,
      slot,
      dedupeKey,
      message,
      situation,
      source: source === "manual" ? "manual" : messageSource,
      generatedBy: messageSource === "ai" ? "ai" : "fallback",
      status: "pending",
      taskId: task?.id ?? null,
      taskTitle: task?.title ?? null,
    });
  } catch (error) {
    // Aynı anda iki istek geldiyse unique index devreye girer: mevcut kaydı dön.
    const raced = await MentorCheck.findOne({ userId, dedupeKey });
    if (raced) return raced;
    throw error;
  }
}

export function nextCheckInfo(settings: IMentorSettings, now = Date.now()) {
  if (!settings.enabled) return null;
  const next = nextCheckAt(settings.hours ?? DEFAULT_HOURS, settings.timezone, now);
  return next ? { at: next.at, hour: next.hour } : null;
}

/* ------------------------------------------------------------------ */
/* Saatlik zamanlayıcı                                                 */
/* ------------------------------------------------------------------ */

async function processSettings(settings: IMentorSettings): Promise<number> {
  if (!settings.enabled) return 0;

  const now = Date.now();
  const dateKey = dateKeyInTz(new Date(now), settings.timezone);
  const { hour, minute } = (() => {
    const label = timeLabelInTz(new Date(now), settings.timezone);
    const [h, m] = label.split(":").map(Number);
    return { hour: h, minute: m };
  })();

  let created = 0;

  // 1) Planlı saatlik kontrol (dinlenme modunda değilse)
  const resting = typeof settings.restUntil === "number" && settings.restUntil > now;
  const hours = settings.hours ?? DEFAULT_HOURS;
  if (!resting && hours.includes(hour) && minute <= 45) {
    const dedupeKey = `h:${dateKey}:${hour}`;
    const exists = await MentorCheck.findOne({
      userId: settings.userId,
      dedupeKey,
    });
    if (!exists) {
      await createCheck({
        userId: String(settings.userId),
        settings,
        dateKey,
        slot: `h${hour}`,
        dedupeKey,
        source: "scheduler",
      });
      created += 1;
    }
  }

  // 2) Ertelenen / dinlenme sonrası takipler
  const dueFollowUps = await MentorCheck.find({
    userId: settings.userId,
    followUpAt: { $ne: null, $lte: now },
    followUpDone: false,
  }).limit(3);

  for (const previous of dueFollowUps) {
    const dedupeKey = `f:${String(previous._id)}`;
    const exists = await MentorCheck.findOne({
      userId: settings.userId,
      dedupeKey,
    });
    if (!exists) {
      await createCheck({
        userId: String(settings.userId),
        settings,
        dateKey,
        slot: "followup",
        dedupeKey,
        source: "followup",
      });
      created += 1;
    }
    previous.followUpDone = true;
    await previous.save();
  }

  return created;
}

export async function runSchedulerTick(): Promise<number> {
  if (mongoose.connection.readyState !== 1) return 0;
  const settingsList = await MentorSettings.find({ enabled: true }).limit(500);
  let created = 0;
  for (const settings of settingsList) {
    try {
      created += await processSettings(settings);
    } catch (error) {
      console.warn(
        "[accountability] kontrol üretilemedi:",
        error instanceof Error ? error.message : error,
      );
    }
  }
  return created;
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let schedulerBootTimer: ReturnType<typeof setTimeout> | null = null;
let ticking = false;

export function startScheduler(intervalMs = 60_000): void {
  if (schedulerTimer) return;

  const tick = () => {
    if (ticking) return;
    ticking = true;
    runSchedulerTick()
      .then((created) => {
        if (created > 0) {
          console.log(`[accountability] ${created} yeni kontrol oluşturuldu`);
        }
      })
      .catch((error) => {
        console.warn(
          "[accountability] scheduler hatası:",
          error instanceof Error ? error.message : error,
        );
      })
      .finally(() => {
        ticking = false;
      });
  };

  schedulerBootTimer = setTimeout(tick, 8_000);
  schedulerTimer = setInterval(tick, intervalMs);
  schedulerTimer.unref?.();
  schedulerBootTimer.unref?.();
  console.log(
    `[accountability] hourly scheduler aktif (her ${Math.round(intervalMs / 1000)}s)`,
  );
}

/* ------------------------------------------------------------------ */
/* Aktivite kaydı                                                      */
/* ------------------------------------------------------------------ */

const ACTION_ACTIVITY: Record<MentorAction, ActivityKind> = {
  start: "working_planned",
  continue: "working_planned",
  complete: "completed",
  rest: "resting",
  busy: "working_other",
  free: "free_time",
  snooze: "snoozed",
  blocked: "blocked",
  skip: "skipped",
  report: "working_other",
};

export async function logActivity(
  userId: string,
  settings: IMentorSettings,
  input: {
    kind: ActivityKind;
    taskId?: string | null;
    taskTitle?: string | null;
    note?: string | null;
    source?: "check" | "manual" | "focus";
    startedAt?: number;
  },
) {
  const now = Date.now();
  const open = await ActivityLog.findOne({ userId, endedAt: null }).sort({
    startedAt: -1,
  });
  if (open) {
    open.endedAt = now;
    open.durationMs = Math.min(now - open.startedAt, 8 * 3_600_000);
    await open.save();
  }

  const startedAt = input.startedAt ?? now;
  return ActivityLog.create({
    userId,
    dateKey: dateKeyInTz(new Date(startedAt), settings.timezone),
    kind: input.kind,
    taskId: input.taskId ?? null,
    taskTitle: input.taskTitle ?? null,
    note: input.note ?? null,
    source: input.source ?? "check",
    startedAt,
    endedAt: input.source === "focus" ? now : null,
    durationMs: input.source === "focus" ? Math.max(0, now - startedAt) : 0,
  });
}

/* ------------------------------------------------------------------ */
/* Görev durumu güncelleme (kullanıcı onayıyla)                        */
/* ------------------------------------------------------------------ */

export interface TaskActionResult {
  id: string;
  title: string;
  status: string;
  completedAt?: number | null;
}

export async function applyTaskAction(
  userId: string,
  dateKey: string,
  taskId: string | null | undefined,
  action: MentorAction,
  now = Date.now(),
): Promise<TaskActionResult | null> {
  const routine = await Routine.findOne({ userId, date: dateKey });
  if (!routine || routine.tasks.length === 0) return null;

  let task: ITaskBlock | undefined;
  if (taskId) {
    task = routine.tasks.find((t) => taskIdOf(t) === taskId);
  }
  if (!task) {
    task =
      routine.tasks.find((t) => t.status === "active") ??
      routine.tasks.find((t) => t.status === "paused") ??
      routine.tasks.find((t) => t.status === "pending");
  }
  if (!task) return null;

  switch (action) {
    case "start":
      task.status = "active";
      task.startedAt = task.startedAt ?? now;
      task.pausedAt = undefined;
      break;
    case "continue":
      if (task.status === "paused" && task.pausedAt) {
        task.pausedDuration += Math.max(0, now - task.pausedAt);
        task.pausedAt = undefined;
      }
      task.status = "active";
      task.startedAt = task.startedAt ?? now;
      break;
    case "complete":
      task.status = "completed";
      task.completedAt = now;
      task.progress = 100;
      break;
    case "skip":
      task.status = "skipped";
      break;
    case "snooze":
      task.delayCount = (task.delayCount ?? 0) + 1;
      break;
    case "blocked":
      task.notes = [task.notes, `[${new Date(now).toLocaleString("tr-TR")}] Engel: engel bildirildi.`]
        .filter(Boolean)
        .join("\n");
      break;
    case "rest":
    case "busy":
    case "free":
    case "report":
      break;
  }

  await routine.save();

  return {
    id: taskIdOf(task),
    title: task.title,
    status: task.status,
    completedAt: task.completedAt ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Kullanıcı cevabı                                                    */
/* ------------------------------------------------------------------ */

export interface RespondResult {
  check: unknown;
  reply: string;
  replySource: "ai" | "fallback";
  activityKind: ActivityKind;
  task: TaskActionResult | null;
  followUpAt: number | null;
}

export async function respondToCheck(
  userId: string,
  options: {
    checkId?: string;
    action: MentorAction;
    note?: string;
    minutes?: number;
    taskId?: string;
  },
): Promise<RespondResult | null> {
  const settings = await getOrCreateSettings(userId);
  const now = Date.now();
  const dateKey = dateKeyInTz(new Date(now), settings.timezone);

  const check = options.checkId
    ? await MentorCheck.findOne({ _id: options.checkId, userId })
    : await MentorCheck.findOne({ userId, status: "pending" }).sort({
        createdAt: -1,
      });
  if (options.checkId && !check) return null;

  const minutes =
    options.minutes ??
    (options.action === "snooze" ? settings.snoozeMinutes : options.action === "rest" ? 30 : 15);

  const taskResult = await applyTaskAction(
    userId,
    dateKey,
    options.taskId ?? check?.taskId ?? null,
    options.action,
    now,
  );

  const activityKind = ACTION_ACTIVITY[options.action];
  const activity = await logActivity(userId, settings, {
    kind: activityKind,
    taskId: taskResult?.id ?? check?.taskId ?? null,
    taskTitle: taskResult?.title ?? check?.taskTitle ?? null,
    note: options.note ?? null,
    source: "check",
  });

  let followUpAt: number | null = null;
  if (options.action === "snooze") {
    followUpAt = now + minutes * 60_000;
  } else if (options.action === "rest") {
    settings.restUntil = now + minutes * 60_000;
    settings.restReason = options.note ?? "kullanıcı dinleniyor";
    followUpAt = settings.restUntil;
  } else {
    settings.restUntil = null;
    settings.restReason = null;
  }
  await settings.save();

  if (check) {
    check.status = "answered";
    check.response = options.action;
    check.responseNote = options.note?.slice(0, 500) ?? null;
    check.answeredAt = now;
    if (followUpAt) check.followUpAt = followUpAt;
    await check.save();
  }

  const ctx = await buildContext(userId, settings, dateKey, now);
  const reply = await composeReply(
    options.action,
    taskResult?.title ?? check?.taskTitle ?? "görevin",
    ctx,
    options.note,
    minutes,
  );

  return {
    check,
    reply: reply.message,
    replySource: reply.source,
    activityKind: activity.kind,
    task: taskResult,
    followUpAt,
  };
}

/* ------------------------------------------------------------------ */
/* Özet / analitik                                                     */
/* ------------------------------------------------------------------ */

export interface AccountabilitySummary {
  dateKey: string;
  planned: number;
  completed: number;
  overdue: number;
  delayed: number;
  activeTaskTitle: string | null;
  nextDeadline: number | null;
  plannedMinutes: number;
  focusMinutes: number;
  restMinutes: number;
  completedFocusSessions: number;
  checksSent: number;
  checksAnswered: number;
  activities: number;
  workingMinutes: number;
  otherMinutes: number;
  freeMinutes: number;
  completionRate: number;
  deadlineSuccessRate: number;
}

export async function computeSummary(
  userId: string,
  dateKey: string,
): Promise<AccountabilitySummary> {
  const now = Date.now();
  const [routine, sessions, activities, checks] = await Promise.all([
    Routine.findOne({ userId, date: dateKey }),
    FocusSession.find({ userId, dateKey }).select("mode actualMinutes completed"),
    ActivityLog.find({ userId, dateKey }).select(
      "kind startedAt endedAt durationMs",
    ),
    MentorCheck.find({ userId, dateKey }).select("status"),
  ]);

  const tasks = routine?.tasks ?? [];
  const completed = tasks.filter((t) => t.status === "completed");
  const overdue = tasks.filter(
    (t) =>
      t.status !== "completed" &&
      t.status !== "skipped" &&
      ((typeof t.deadline === "number" && t.deadline < now) ||
        (t.status === "pending" &&
          typeof t.endTime === "number" &&
          t.endTime < now)),
  );

  const plannedMinutes = tasks.reduce((acc, t) => {
    if (typeof t.startTime === "number" && typeof t.endTime === "number") {
      return acc + Math.max(0, (t.endTime - t.startTime) / 60_000);
    }
    return acc + (t.estimatedMinutes ?? 0);
  }, 0);

  const focusMinutes = sessions
    .filter((s) => s.mode === "focus")
    .reduce((acc, s) => acc + (s.actualMinutes ?? 0), 0);

  const restMinutes = activities
    .filter((a) => a.kind === "resting")
    .reduce((acc, a) => {
      const duration = a.endedAt
        ? a.durationMs ?? 0
        : Math.max(0, now - a.startedAt);
      return acc + duration / 60_000;
    }, 0);

  const sumKind = (kind: ActivityKind) =>
    activities
      .filter((a) => a.kind === kind)
      .reduce((acc, a) => {
        const duration = a.endedAt ? a.durationMs ?? 0 : Math.max(0, now - a.startedAt);
        return acc + duration / 60_000;
      }, 0);

  const withDeadline = tasks.filter((t) => typeof t.deadline === "number");
  const onTime = withDeadline.filter(
    (t) =>
      t.status === "completed" &&
      typeof t.completedAt === "number" &&
      typeof t.deadline === "number" &&
      t.completedAt <= t.deadline,
  );

  const activeTask =
    tasks.find((t) => t.status === "active") ??
    tasks.find((t) => t.status === "paused") ??
    null;

  return {
    dateKey,
    planned: tasks.length,
    completed: completed.length,
    overdue: overdue.length,
    delayed: tasks.filter((t) => (t.delayCount ?? 0) > 0).length,
    activeTaskTitle: activeTask?.title ?? null,
    nextDeadline:
      tasks
        .filter((t) => typeof t.deadline === "number" && t.status !== "completed")
        .map((t) => t.deadline as number)
        .sort((a, b) => a - b)[0] ?? null,
    plannedMinutes: Math.round(plannedMinutes),
    focusMinutes: Math.round(focusMinutes),
    restMinutes: Math.round(restMinutes),
    completedFocusSessions: sessions.filter((s) => s.completed && s.mode === "focus").length,
    checksSent: checks.length,
    checksAnswered: checks.filter((c) => c.status === "answered").length,
    activities: activities.length,
    workingMinutes: Math.round(sumKind("working_planned")),
    otherMinutes: Math.round(sumKind("working_other")),
    freeMinutes: Math.round(sumKind("free_time")),
    completionRate:
      tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0,
    deadlineSuccessRate:
      withDeadline.length > 0
        ? Math.round((onTime.length / withDeadline.length) * 100)
        : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Odak oturumu kaydı                                                  */
/* ------------------------------------------------------------------ */

export async function recordFocusSession(
  userId: string,
  input: {
    mode: "focus" | "short_break" | "long_break";
    plannedMinutes: number;
    actualMinutes: number;
    completed: boolean;
    taskId?: string | null;
    taskTitle?: string | null;
    startedAt: number;
    endedAt?: number;
  },
) {
  const settings = await getOrCreateSettings(userId);
  const startedAt = input.startedAt || Date.now();
  return FocusSession.create({
    userId,
    dateKey: dateKeyInTz(new Date(startedAt), settings.timezone),
    mode: input.mode,
    plannedMinutes: Math.max(1, Math.round(input.plannedMinutes)),
    actualMinutes: Math.max(0, Math.round(input.actualMinutes)),
    completed: Boolean(input.completed),
    taskId: input.taskId ?? null,
    taskTitle: input.taskTitle ?? null,
    startedAt,
    endedAt: input.endedAt ?? Date.now(),
  });
}

export { fallbackCheckMessage, detectSituation, nextCheckAt };
