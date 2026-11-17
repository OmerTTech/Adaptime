import mongoose, { Schema, type Document } from "mongoose";

/**
 * Basit anahtar/değer deposu (ör. VAPID anahtarları).
 * Ortam değişkeni tanımlanmamış kurulumlarda anahtarlar burada kalıcı tutulur.
 */
export interface IAppConfig extends Document {
  key: string;
  value: unknown;
}

const appConfigSchema = new Schema<IAppConfig>(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

export const AppConfig = mongoose.model<IAppConfig>(
  "AppConfig",
  appConfigSchema,
);
