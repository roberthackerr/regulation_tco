import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { REGIONS, SERVICES } from "@/lib/constants";

export const FEEDBACK_STATUSES = ["en_attente", "publie", "rejete"] as const;
export const SENTIMENT_LABELS = ["positif", "neutre", "negatif"] as const;

/**
 * Un avis d'usager sur un opérateur (note 1–5 + commentaire libre en français ou malgache).
 * Le sentiment est calculé par le pipeline (lexique FR/MG) s'il est absent.
 */
const FeedbackSchema = new Schema(
  {
    operatorId: { type: Schema.Types.ObjectId, ref: "Operator", required: true, index: true },
    date: { type: Date, required: true }, // mois concerné (1er du mois, UTC)
    region: { type: String, enum: REGIONS, required: true },
    service: { type: String, enum: SERVICES, required: true },
    note: { type: Number, min: 1, max: 5, required: true },
    commentaire: { type: String, default: "" },
    langue: { type: String, enum: ["fr", "mg", "mixte", "inconnue"], default: null },
    sentiment: {
      type: new Schema(
        {
          label: { type: String, enum: SENTIMENT_LABELS, required: true },
          score: { type: Number, required: true }, // −1 (très négatif) à +1 (très positif)
          source: { type: String, enum: ["lexique", "modele"], required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    status: { type: String, enum: FEEDBACK_STATUSES, default: "publie", index: true },
    source: { type: String, enum: ["public"], required: true }, // formulaire « Donner mon avis »
    ipHash: { type: String, default: null },
    deviceHash: { type: String, default: null },
  },
  { timestamps: true, collection: "feedbacks" },
);

FeedbackSchema.index({ operatorId: 1, date: 1, region: 1, service: 1 });

export type FeedbackDoc = InferSchemaType<typeof FeedbackSchema>;

export const Feedback: Model<FeedbackDoc> =
  (models.Feedback as Model<FeedbackDoc>) ?? model("Feedback", FeedbackSchema);
