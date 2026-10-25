import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { OPERATORS } from "@/lib/constants";

/** Un opérateur mobile supervisé par l'autorité. */
const OperatorSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      enum: OPERATORS.map((o) => o.code),
    },
    nom: { type: String, required: true },
    actif: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "operators" },
);

export type OperatorDoc = InferSchemaType<typeof OperatorSchema>;

export const Operator: Model<OperatorDoc> =
  (models.Operator as Model<OperatorDoc>) ?? model("Operator", OperatorSchema);
