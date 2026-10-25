import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * Compteur de tentatives par clé (ex. "login:<ip>").
 * L'index TTL supprime automatiquement les compteurs expirés.
 */
const RateLimitSchema = new Schema(
  {
    cle: { type: String, required: true, unique: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { collection: "rate_limits" },
);

export type RateLimitDoc = InferSchemaType<typeof RateLimitSchema>;

export const RateLimit: Model<RateLimitDoc> =
  (models.RateLimit as Model<RateLimitDoc>) ?? model("RateLimit", RateLimitSchema);
