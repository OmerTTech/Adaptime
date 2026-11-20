import mongoose, { Schema, type Document } from "mongoose";

export interface IUser extends Document {
  googleId?: string;
  firebaseUid?: string;
  email: string;
  name: string;
  avatar?: string;
  /**
   * Odak sayacı açıkken uygulamanın "buradayım" sinyali (ms).
   * Süre bitince uygulama içi alarmın yeterli olup olmadığını anlamak için.
   */
  focusSeenAt?: number;
  /** Seri dondurma için işaretlenen günler (YYYY-MM-DD). Ayda en fazla 2. */
  streakFreezeDates?: string[];
  /** ICS takvim aboneliği jetonu; URL'de taşınır, tahmin edilemez. */
  calendarToken?: string;
  /** Plan paylaşımı (salt okunur) jetonu (4.1). */
  shareToken?: string;
  /** Son partner dürtmesi; 3 saatte bir (spam koruması). */
  shareNudgeAt?: Date;
  /** Görev tamamlandığında olay gönderilecek adres (4.2). */
  webhookUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    googleId: { type: String, unique: true, sparse: true },
    firebaseUid: { type: String, unique: true, sparse: true },
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    avatar: { type: String },
    focusSeenAt: { type: Number },
    streakFreezeDates: { type: [String], default: [] },
    calendarToken: { type: String, unique: true, sparse: true },
    shareToken: { type: String, unique: true, sparse: true },
    shareNudgeAt: { type: Date },
    webhookUrl: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);

export const User = mongoose.model<IUser>("User", userSchema);
