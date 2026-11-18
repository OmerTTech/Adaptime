export type TaskStatus =
  "pending" | "active" | "paused" | "completed" | "skipped";

export type ViewMode = "oclock" | "timeline";

export type PauseMode = "shift" | "cut" | "balance";

export type FlowMode = "shift" | "eatNext" | "balance";

export type EarlyFinishMode = "extendBreak" | "pullForward";

export type TaskPriority = "critical" | "high" | "medium" | "low";

export type TaskCategory = "work" | "study" | "personal" | "health" | "other";

export type RepeatFrequency =
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "custom";

export const REPEAT_LABEL: Record<RepeatFrequency, string> = {
  hourly: "Her saat",
  daily: "Her gün",
  weekly: "Her hafta",
  monthly: "Her ay",
  custom: "Seçili günler",
};

export const WEEKDAY_LABEL = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
/** Hafta pazartesi başlar; değerler WEEKDAY_LABEL indeksidir (0 = Pazar). */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  doneAt?: number;
}

export interface TaskBlock {
  id: string;
  title: string;
  startTime?: number;
  endTime?: number;
  originalDuration?: number;
  color: string;
  status: TaskStatus;
  startedAt?: number;
  pausedAt?: number;
  pausedDuration: number;
  flowExtensions: number;
  estimatedMinutes?: number;
  /* --- AI Accountability alanları (opsiyonel, eski veriler bozulmaz) --- */
  description?: string;
  priority?: TaskPriority;
  category?: TaskCategory;
  deadline?: number;
  createdAtClient?: number;
  completedAt?: number;
  progress?: number;
  firstAction?: string;
  notes?: string;
  delayCount?: number;
  reminderEnabled?: boolean;
  /** Aynı saatte başka bir görevle birlikte yapılıyorsa çakışma uyarısı verilmez. */
  parallel?: boolean;
  /** Tamamlanınca bir sonraki tekrarın otomatik oluşturulması. */
  repeat?: RepeatFrequency;
  /** "custom" için haftanın günleri (0 = Pazar). */
  repeatDays?: number[];
  subtasks?: Subtask[];
  /* --- Devir (carry) alanları --- */
  /** "once": tek seferlik, "rolling": tamamlanana kadar her gün devreder. */
  carryPolicy?: "once" | "rolling";
  /** Devreden görev zincirinin kimliği; başlık değişse de aynı görev sayılır. */
  originId?: string;
  /** Bu görev kaç gündür devrediyor. */
  carryCount?: number;
  /** Hangi günden devredildi (YYYY-MM-DD). */
  carriedFrom?: string;
}

export type ScheduledTask = TaskBlock & {
  startTime: number;
  endTime: number;
  originalDuration: number;
};

export function isScheduled(task: TaskBlock): task is ScheduledTask {
  return (
    typeof task.startTime === "number" &&
    typeof task.endTime === "number" &&
    task.endTime > task.startTime
  );
}

export type DayRoutineDayStatus = "active" | "completed";

export interface DayRoutine {
  id: string;
  date: string;
  tasks: TaskBlock[];
  dayEndTime: number;
  streak: number;
}

export interface PauseImpact {
  mode: PauseMode;
  newDayEndTime: number;
  affectedTasks: { id: string; newStart: number; newEnd: number }[];
  description: string;
  /** Dengele modunda plandaki boşluklardan karşılanan süre aralıkları. */
  bufferSegments?: { start: number; end: number }[];
}

export interface FlowImpact {
  mode: FlowMode;
  extraMinutes: number;
  newDayEndTime: number;
  affectedTasks: { id: string; newStart: number; newEnd: number }[];
  description: string;
}

export interface EarlyFinishImpact {
  mode: EarlyFinishMode;
  savedMinutes: number;
  newDayEndTime: number;
  description: string;
}

export interface PreviewState {
  originalTasks: TaskBlock[];
  modifiedTasks: TaskBlock[];
  newDayEndTime: number;
  description: string;
  source: "pause" | "flow" | "earlyFinish";
}

/* ------------------------------------------------------------------ */
/* AI Accountability tipleri                                           */
/* ------------------------------------------------------------------ */

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  critical: "Kritik",
  high: "Yüksek",
  medium: "Orta",
  low: "Düşük",
};

export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export const CATEGORY_LABEL: Record<TaskCategory, string> = {
  work: "İş",
  study: "Ders",
  personal: "Kişisel",
  health: "Sağlık",
  other: "Diğer",
};

export type MentorTone = "direct" | "balanced" | "supportive";

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

export interface MentorSettings {
  enabled: boolean;
  timezone: string;
  hours: number[];
  tone: MentorTone;
  snoozeMinutes: number;
  /** Mentor yanıtlarının üst cümle sınırı (1-20). */
  maxSentences: number;
  aiEnabled: boolean;
  restUntil: number | null;
  restReason: string | null;
}

export interface MentorCheck {
  _id: string;
  dateKey: string;
  slot: string;
  message: string;
  situation: MentorSituation | string;
  source: "ai" | "fallback" | "manual";
  generatedBy?: "ai" | "fallback";
  status: "pending" | "answered" | "expired";
  taskId?: string | null;
  taskTitle?: string | null;
  response?: string | null;
  responseNote?: string | null;
  followUpAt?: number | null;
  answeredAt?: number | null;
  createdAt: string;
}

export type ActivityKind =
  | "working_planned"
  | "working_other"
  | "resting"
  | "free_time"
  | "not_started"
  | "interrupted"
  | "blocked"
  | "completed"
  | "snoozed"
  | "skipped";

export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  working_planned: "Planlanan görev",
  working_other: "Başka iş",
  resting: "Dinlenme",
  free_time: "Boş zaman",
  not_started: "Başlamadı",
  interrupted: "Kesildi",
  blocked: "Engel",
  completed: "Tamamlandı",
  snoozed: "Ertelendi",
  skipped: "Atlandı",
};

export interface ActivityLogEntry {
  _id: string;
  dateKey: string;
  kind: ActivityKind;
  taskId?: string | null;
  taskTitle?: string | null;
  note?: string | null;
  source: "check" | "manual" | "focus";
  startedAt: number;
  endedAt?: number | null;
  durationMs?: number | null;
}

export interface FocusSessionRecord {
  _id: string;
  dateKey: string;
  mode: "focus" | "short_break" | "long_break";
  plannedMinutes: number;
  actualMinutes: number;
  completed: boolean;
  taskId?: string | null;
  taskTitle?: string | null;
  startedAt: number;
  endedAt?: number | null;
}

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

export interface AiKeyStatus {
  index: number;
  disabled: boolean;
  disabledUntil: number | null;
  lastUsedAt: number | null;
  quotaHits: number;
  successCount: number;
}

export interface AiStatus {
  model: string;
  configuredKeys: number;
  availableKeys: number;
  blockedUntil: number | null;
  keys: AiKeyStatus[];
}

export interface DailyLaunchItem {
  title: string;
  firstStep: string;
  doneCriteria: string;
}

export interface DailyLaunch {
  date: string;
  topTaskTitle: string;
  firstStep: string;
  doneCriteria: string;
  source: "ai" | "fallback";
  /** Kaç maddelik başlangıç istendiği (3/5/10). */
  count?: number;
  /** Maddeler; eski kayıtlarda yoksa tek görev alanları kullanılır. */
  items?: DailyLaunchItem[];
}

/* ------------------------------------------------------------------ */
/* Günlük (Diary)                                                      */
/* ------------------------------------------------------------------ */

export interface DiaryEntry {
  _id?: string;
  dateKey: string;
  mood: number;
  energy: number;
  highlights: string;
  progress: string;
  learnings: string;
  blockers: string;
  nextSteps: string;
  tags: string[];
  updatedAt?: string;
}

export interface TaskSuggestion {
  title: string;
  reason: string;
  priority: TaskPriority;
  estimatedMinutes: number;
  category: TaskCategory;
}

export interface AccountabilityState {
  dateKey: string;
  settings: MentorSettings;
  pending: MentorCheck[];
  checks: MentorCheck[];
  activities: ActivityLogEntry[];
  summary: AccountabilitySummary;
  nextCheckAt: number | null;
  serverTime: number;
  ai: AiStatus;
  hasRoutine: boolean;
}
