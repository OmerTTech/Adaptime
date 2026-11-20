import mongoose, { Schema, type Document } from "mongoose";

export interface IArchivedTask extends Document {
  userId: mongoose.Types.ObjectId;
  dateKey: string;
  task: Record<string, unknown>;
  reason: "deleted" | "replaced";
  restoredAt?: Date | null;
  removedAt: Date;
}

const archivedTaskSchema = new Schema<IArchivedTask>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    dateKey: { type: String, required: true },
    task: { type: Schema.Types.Mixed, required: true },
    reason: {
      type: String,
      enum: ["deleted", "replaced"],
      default: "deleted",
    },
    restoredAt: { type: Date, default: null },
    removedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

archivedTaskSchema.index({ userId: 1, removedAt: -1 });
// 180 günden eski silinen görev kayıtları kendiliğinden temizlenir.
archivedTaskSchema.index({ removedAt: 1 }, { expireAfterSeconds: 180 * 24 * 3600 });

export const TaskArchive = mongoose.model<IArchivedTask>(
  "TaskArchive",
  archivedTaskSchema,
);
