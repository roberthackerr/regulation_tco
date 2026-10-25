import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** Une exécution de la veille (collecte) pour un opérateur, avec le bilan de chaque source. */
const ScrapeRunSchema = new Schema(
  {
    operatorId: { type: Schema.Types.ObjectId, ref: "Operator", required: true, index: true },
    lanceePar: { type: Schema.Types.ObjectId, ref: "User", default: null },
    status: { type: String, enum: ["en_cours", "termine", "erreur"], default: "en_cours" },
    sources: {
      type: [
        {
          source: String,
          collectes: Number,
          nouveaux: Number,
          erreur: { type: String, default: null },
          dureeMs: Number,
          _id: false,
        },
      ],
      default: [],
    },
    nouveaux: { type: Number, default: 0 },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "scrape_runs" },
);

export type ScrapeRunDoc = InferSchemaType<typeof ScrapeRunSchema>;

export const ScrapeRun: Model<ScrapeRunDoc> = (models.ScrapeRun as Model<ScrapeRunDoc>) ?? model("ScrapeRun", ScrapeRunSchema);
