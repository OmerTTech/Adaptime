import mongoose, { Schema, type Document } from "mongoose";

export interface IPushSubscription extends Document {
  userId: mongoose.Types.ObjectId;
  endpoint: string;
  p256dh: string;
  auth: string;
  /** Aboneliğin oluşturulduğu VAPID genel anahtarı (uyuşmazlıkta silinir). */
  publicKey?: string;
  userAgent?: string;
  /** Son başarılı bildirim zamanı (Ayarlar'daki bilgi satırı için). */
  lastSentAt?: Date;
  createdAt: Date;
}

const pushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    endpoint: { type: String, required: true, unique: true },
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
    publicKey: { type: String },
    userAgent: { type: String },
    lastSentAt: { type: Date },
  },
  { timestamps: true },
);

// userId ve endpoint indeksleri alan tanımlarında zaten var.

export const PushSubscription = mongoose.model<IPushSubscription>(
  "PushSubscription",
  pushSubscriptionSchema,
);
