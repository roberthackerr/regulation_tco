import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** Journal des actions sensibles (connexion, création de compte, approbation…). */
const AuditLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    action: { type: String, required: true },
    cible: { type: String, default: null },
    details: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "audit_logs" },
);

export type AuditLogDoc = InferSchemaType<typeof AuditLogSchema>;

export const AuditLog: Model<AuditLogDoc> =
  (models.AuditLog as Model<AuditLogDoc>) ?? model("AuditLog", AuditLogSchema);
