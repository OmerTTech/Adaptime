import mongoose, { Schema, type Document } from "mongoose";

/* ------------------------------------------------------------------ */
/* Mentor ayarları                                                     */
/* ------------------------------------------------------------------ */

export type MentorTone = "direct" | "balanced" | "supportive";

export interface IDailyLaunch {
  date: string;
  topTaskTitle: string;
  firstStep: string;
  doneCriteria: string;
  source: "ai" | "fallback";
}

export interface IMentorSettings extends Document {
  userId: mongoose.Types.ObjectId;
  enabled: boolean;
  timezone: string;
  hours: number[];
  tone: MentorTone;
  snoozeMinutes: number;
  aiEnabled: boolean;
  restUntil?: number | null;
  restReason?: string | null;
  dailyLaunch?: IDailyLaunch | null;
  createdAt: Date;
  updatedAt: Date;
}

const mentorSettingsSchema = new Schema<IMentorSettings>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    enabled: { type: Boolean, default: true },
    timezone: { type: String, default: "Asia/Baku" },
    hours: { type: [Number], default: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23] },
    tone: { type: String, enum: ["direct", "balanced", "supportive"], default: "direct" },
    snoozeMinutes: { type: Number, default: 15, min: 5, max: 180 },
    aiEnabled: { type: Boolean, default: true },
    restUntil: { type: Number, default: null },
    restReason: { type: String, default: null },
    dailyLaunch: {
      type: {
        date: String,
        topTaskTitle: String,
        firstStep: String,
        doneCriteria: String,
        source: { type: String, enum: ["ai", "fallback"] },
      },
      default: null,
    },
  },
  { timestamps: true },
);

export const MentorSettings = mongoose.model<IMentorSettings>(
  "MentorSettings",
  mentorSettingsSchema,
);

/* ------------------------------------------------------------------ */
/* Saatlik kontroller                                                  */
/* ------------------------------------------------------------------ */

export type CheckStatus = "pending" | "answered" | "expired";

export interface IMentorCheck extends Document {
  userId: mongoose.Types.ObjectId;
  dateKey: string;
  slot: string;
  dedupeKey: string;
  message: string;
  situation: string;
  source: "ai" | "fallback" | "manual";
  generatedBy: "ai" | "fallback";
  status: CheckStatus;
  taskId?: string | null;
  taskTitle?: string | null;
  response?: string | null;
  responseNote?: string | null;
  followUpAt?: number | null;
  followUpDone?: boolean;
  answeredAt?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const mentorCheckSchema = new Schema<IMentorCheck>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    dateKey: { type: String, required: true },
    slot: { type: String, required: true },
    dedupeKey: { type: String, required: true },
    message: { type: String, required: true },
    situation: { type: String, default: "plan_today" },
    source: { type: String, enum: ["ai", "fallback", "manual"], default: "fallback" },
    generatedBy: { type: String, enum: ["ai", "fallback"], default: "fallback" },
    status: {
      type: String,
      enum: ["pending", "answered", "expired"],
      default: "pending",
    },
    taskId: { type: String, default: null },
    taskTitle: { type: String, default: null },
    response: { type: String, default: null },
    responseNote: { type: String, default: null },
    followUpAt: { type: Number, default: null },
    followUpDone: { type: Boolean, default: false },
    answeredAt: { type: Number, default: null },
  },
  { timestamps: true },
);

mentorCheckSchema.index({ userId: 1, dateKey: 1, createdAt: -1 });
mentorCheckSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });

export const MentorCheck = mongoose.model<IMentorCheck>(
  "MentorCheck",
  mentorCheckSchema,
);

/* ------------------------------------------------------------------ */
/* Aktivite kayıtları (planlanan vs gerçekleşen)                        */
/* ------------------------------------------------------------------ */

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

export interface IActivityLog extends Document {
  userId: mongoose.Types.ObjectId;
  dateKey: string;
  kind: ActivityKind;
  taskId?: string | null;
  taskTitle?: string | null;
  note?: string | null;
  source: "check" | "manual" | "focus";
  startedAt: number;
  endedAt?: number | null;
  durationMs?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    dateKey: { type: String, required: true },
    kind: {
      type: String,
      enum: [
        "working_planned",
        "working_other",
        "resting",
        "free_time",
        "not_started",
        "interrupted",
        "blocked",
        "completed",
        "snoozed",
        "skipped",
      ],
      required: true,
    },
    taskId: { type: String, default: null },
    taskTitle: { type: String, default: null },
    note: { type: String, default: null },
    source: { type: String, enum: ["check", "manual", "focus"], default: "check" },
    startedAt: { type: Number, required: true },
    endedAt: { type: Number, default: null },
    durationMs: { type: Number, default: 0 },
  },
  { timestamps: true },
);

activityLogSchema.index({ userId: 1, dateKey: 1, startedAt: -1 });

export const ActivityLog = mongoose.model<IActivityLog>(
  "ActivityLog",
  activityLogSchema,
);

/* ------------------------------------------------------------------ */
/* Odak (pomodoro) oturumları                                         */
/* ------------------------------------------------------------------ */

export type FocusMode = "focus" | "short_break" | "long_break";

export interface IFocusSession extends Document {
  userId: mongoose.Types.ObjectId;
  dateKey: string;
  taskId?: string | null;
  taskTitle?: string | null;
  mode: FocusMode;
  plannedMinutes: number;
  actualMinutes: number;
  completed: boolean;
  startedAt: number;
  endedAt?: number | null;
  createdAt: Date;
}

const focusSessionSchema = new Schema<IFocusSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    dateKey: { type: String, required: true },
    taskId: { type: String, default: null },
    taskTitle: { type: String, default: null },
    mode: { type: String, enum: ["focus", "short_break", "long_break"], default: "focus" },
    plannedMinutes: { type: Number, default: 25 },
    actualMinutes: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
    startedAt: { type: Number, required: true },
    endedAt: { type: Number, default: null },
  },
  { timestamps: true },
);

focusSessionSchema.index({ userId: 1, dateKey: 1, startedAt: -1 });

export const FocusSession = mongoose.model<IFocusSession>(
  "FocusSession",
  focusSessionSchema,
);
