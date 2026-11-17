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
  },
  { timestamps: true },
);

export const User = mongoose.model<IUser>("User", userSchema);
