import mongoose, { Schema, type Document } from "mongoose";

export type TaskPriority = "critical" | "high" | "medium" | "low";
export type TaskCategory = "work" | "study" | "personal" | "health" | "other";

export interface ISubtask {
  _id?: unknown;
  title: string;
  done: boolean;
  doneAt?: number;
}

export interface ITaskBlock {
  _id?: unknown;
  title: string;
  description?: string;
  priority?: TaskPriority;
  category?: TaskCategory;
  startTime?: number;
  endTime?: number;
  deadline?: number;
  originalDuration?: number;
  estimatedMinutes?: number;
  color: string;
  status: "pending" | "active" | "paused" | "completed" | "skipped";
  /** Saatsiz görev önceki günden devredildiyse kaynak tarih. */
  carriedFrom?: string;
  startedAt?: number;
  pausedAt?: number;
  pausedDuration: number;
  flowExtensions: number;
  createdAtClient?: number;
  completedAt?: number;
  progress?: number;
  firstAction?: string;
  notes?: string;
  delayCount?: number;
  parallel?: boolean;
  repeat?: "hourly" | "daily" | "weekly" | "monthly" | "custom";
  repeatDays?: number[];
  subtasks?: ISubtask[];
}

export interface IRoutine extends Document {
  userId: mongoose.Types.ObjectId;
  date: string;
  tasks: ITaskBlock[];
  dayEndTime: number;
  streak: number;
  createdAt: Date;
  updatedAt: Date;
}

const subtaskSchema = new Schema<ISubtask>(
  {
    title: { type: String, required: true },
    done: { type: Boolean, default: false },
    doneAt: { type: Number },
  },
  { _id: true },
);

const taskBlockSchema = new Schema<ITaskBlock>(
  {
    title: { type: String, required: true },
    description: { type: String },
    priority: {
      type: String,
      enum: ["critical", "high", "medium", "low"],
      default: "medium",
    },
    category: {
      type: String,
      enum: ["work", "study", "personal", "health", "other"],
      default: "work",
    },
    startTime: { type: Number },
    endTime: { type: Number },
    deadline: { type: Number },
    originalDuration: { type: Number },
    estimatedMinutes: { type: Number },
    color: { type: String, default: "#6366f1" },
    carriedFrom: { type: String },
    status: {
      type: String,
      enum: ["pending", "active", "paused", "completed", "skipped"],
      default: "pending",
    },
    startedAt: { type: Number },
    pausedAt: { type: Number },
    pausedDuration: { type: Number, default: 0 },
    flowExtensions: { type: Number, default: 0 },
    createdAtClient: { type: Number },
    completedAt: { type: Number },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    firstAction: { type: String },
    notes: { type: String },
    delayCount: { type: Number, default: 0 },
    parallel: { type: Boolean, default: false },
    repeat: {
      type: String,
      enum: ["hourly", "daily", "weekly", "monthly", "custom"],
    },
    repeatDays: { type: [Number], default: undefined },
    subtasks: { type: [subtaskSchema], default: [] },
  },
  { _id: true },
);

const routineSchema = new Schema<IRoutine>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: { type: String, required: true },
    tasks: [taskBlockSchema],
    dayEndTime: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
  },
  { timestamps: true },
);

routineSchema.index({ userId: 1, date: 1 }, { unique: true });

export const Routine = mongoose.model<IRoutine>("Routine", routineSchema);
