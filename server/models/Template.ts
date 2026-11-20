import mongoose, { Schema, type Document } from "mongoose";

export interface ITemplateTask {
  title: string;
  estimatedMinutes: number;
  priority: "critical" | "high" | "medium" | "low";
  category: "work" | "study" | "personal" | "health" | "other";
  firstAction?: string;
}

export interface ITemplate extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  description: string;
  tasks: ITemplateTask[];
  createdAt: Date;
  updatedAt: Date;
}

const templateTaskSchema = new Schema<ITemplateTask>(
  {
    title: { type: String, required: true, maxlength: 160 },
    estimatedMinutes: { type: Number, default: 30, min: 1, max: 600 },
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
    firstAction: { type: String, maxlength: 160 },
  },
  { _id: false },
);

const templateSchema = new Schema<ITemplate>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, maxlength: 80 },
    description: { type: String, default: "", maxlength: 200 },
    tasks: { type: [templateTaskSchema], default: [] },
  },
  { timestamps: true },
);

templateSchema.index({ userId: 1, createdAt: -1 });

export const Template = mongoose.model<ITemplate>("Template", templateSchema);
