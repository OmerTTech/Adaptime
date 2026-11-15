import mongoose, { Schema, type Document } from "mongoose";

export interface IDiaryEntry extends Document {
  userId: mongoose.Types.ObjectId;
  dateKey: string;
  mood: number;
  energy: number;
  highlights: string;
  progress: string;
  learnings: string;
  blockers: string;
  nextSteps: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const diaryEntrySchema = new Schema<IDiaryEntry>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    dateKey: { type: String, required: true },
    mood: { type: Number, min: 1, max: 5, default: 3 },
    energy: { type: Number, min: 1, max: 5, default: 3 },
    highlights: { type: String, default: "", maxlength: 4000 },
    progress: { type: String, default: "", maxlength: 4000 },
    learnings: { type: String, default: "", maxlength: 4000 },
    blockers: { type: String, default: "", maxlength: 4000 },
    nextSteps: { type: String, default: "", maxlength: 4000 },
    tags: { type: [String], default: [] },
  },
  { timestamps: true },
);

diaryEntrySchema.index({ userId: 1, dateKey: 1 }, { unique: true });

export const DiaryEntry = mongoose.model<IDiaryEntry>(
  "DiaryEntry",
  diaryEntrySchema,
);
