import mongoose, { Schema, type Document } from "mongoose";

export interface IUser extends Document {
  googleId?: string;
  email: string;
  name: string;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    googleId: { type: String, unique: true, sparse: true },
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    avatar: { type: String },
  },
  { timestamps: true },
);

export const User = mongoose.model<IUser>("User", userSchema);
