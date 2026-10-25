import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { REGIONS } from "@/lib/constants";

export const MENTION_SOURCES = ["app_store", "google_news", "youtube", "facebook", "x"] as const;
export const MENTION_THEMES = ["reseau", "internet", "tarif", "mobile_money", "service_client", "autre"] as const;

/**
 * Une publication, un commentaire ou un avis public RÉEL qui parle d'un opérateur, collecté par la veille.
 * L'auteur est pseudonymisé (empreinte), on ne stocke pas de nom de personne.
 */
const SocialMentionSchema = new Schema(
  {
    operatorId: { type: Schema.Types.ObjectId, ref: "Operator", required: true, index: true },
    source: { type: String, enum: MENTION_SOURCES, required: true },
    externalId: { type: String, required: true },
    auteur: { type: String, default: null },
    texte: { type: String, required: true },
    url: { type: String, default: null },
    publishedAt: { type: Date, required: true, index: true },
    langue: { type: String, enum: ["fr", "mg", "mixte", "inconnue"], default: "inconnue" },
    sentiment: {
      type: new Schema(
        {
          label: { type: String, enum: ["positif", "neutre", "negatif"], required: true },
          score: { type: Number, required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    termes: { type: [{ terme: String, poids: Number, _id: false }], default: [] },
    theme: { type: String, enum: MENTION_THEMES, default: "autre" },
    region: { type: String, enum: [...REGIONS, null], default: null },
    engagement: { type: Number, default: 0 }, // likes + partages + réponses
    note: { type: Number, min: 1, max: 5, default: null }, // avis d'application (App Store)
    runId: { type: Schema.Types.ObjectId, ref: "ScrapeRun", default: null },
  },
  { timestamps: true, collection: "social_mentions" },
);

SocialMentionSchema.index({ operatorId: 1, source: 1, externalId: 1 }, { unique: true });
SocialMentionSchema.index({ operatorId: 1, publishedAt: -1 });

export type SocialMentionDoc = InferSchemaType<typeof SocialMentionSchema>;

export const SocialMention: Model<SocialMentionDoc> =
  (models.SocialMention as Model<SocialMentionDoc>) ?? model("SocialMention", SocialMentionSchema);
