import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { ROLES } from "@/lib/constants";

/**
 * Compte de connexion. Le public (usagers) n'a pas de compte :
 * seuls l'admin (autorité) et les opérateurs se connectent.
 */
const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    nom: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, required: true, enum: ROLES },
    // Renseigné uniquement pour le rôle "operator".
    operatorId: { type: Schema.Types.ObjectId, ref: "Operator", default: null },
    actif: { type: Boolean, default: true },
    lastLogin: { type: Date, default: null },
  },
  { timestamps: true, collection: "users" },
);

// Un seul compte par opérateur (index partiel : ne concerne que les comptes opérateurs).
UserSchema.index(
  { operatorId: 1 },
  { unique: true, partialFilterExpression: { role: "operator" } },
);

export type UserDoc = InferSchemaType<typeof UserSchema>;

export const User: Model<UserDoc> =
  (models.User as Model<UserDoc>) ?? model("User", UserSchema);
