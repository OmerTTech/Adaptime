import mongoose, { Schema, type Document } from "mongoose";

/**
 * Günlük otomatik yedek (1.1). Kullanıcı başına günde tek kayıt tutulur;
 * 7 günden eski yedekler TTL indeksiyle kendiliğinden silinir.
 */
export interface IBackupRoutine {
  date: string;
  tasks: unknown[];
  dayEndTime: number;
  streak: number;
  revision?: number;
}

export interface IRoutineBackup extends Document {
  userId: mongoose.Types.ObjectId;
  /** Yedeğin alındığı gün (YYYY-MM-DD). */
  dateKey: string;
  routines: IBackupRoutine[];
  createdAt: Date;
}

const backupRoutineSchema = new Schema<IBackupRoutine>(
  {
    date: { type: String, required: true },
    tasks: { type: [Schema.Types.Mixed], default: [] },
    dayEndTime: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    revision: { type: Number },
  },
  { _id: false },
);

const routineBackupSchema = new Schema<IRoutineBackup>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    dateKey: { type: String, required: true },
    routines: { type: [backupRoutineSchema], default: [] },
    createdAt: {
      type: Date,
      default: Date.now,
      // 7 gün sonra otomatik silinir (saniye cinsinden).
      expires: 60 * 60 * 24 * 7,
    },
  },
  { versionKey: false },
);

routineBackupSchema.index({ userId: 1, dateKey: 1 }, { unique: true });

export const RoutineBackup = mongoose.model<IRoutineBackup>(
  "RoutineBackup",
  routineBackupSchema,
);
