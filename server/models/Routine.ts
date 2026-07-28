import mongoose, { Schema, type Document } from "mongoose";

export interface ITaskBlock {
  title: string;
  startTime: number;
  endTime: number;
  originalDuration: number;
  color: string;
  status: "pending" | "active" | "paused" | "completed" | "skipped";
  pausedDuration: number;
  flowExtensions: number;
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

const taskBlockSchema = new Schema<ITaskBlock>(
  {
    title: { type: String, required: true },
    startTime: { type: Number, required: true },
    endTime: { type: Number, required: true },
    originalDuration: { type: Number, required: true },
    color: { type: String, default: "#6366f1" },
    status: {
      type: String,
      enum: ["pending", "active", "paused", "completed", "skipped"],
      default: "pending",
    },
    pausedDuration: { type: Number, default: 0 },
    flowExtensions: { type: Number, default: 0 },
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
