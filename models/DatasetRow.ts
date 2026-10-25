import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** Une ligne du jeu de données : opérateur × mois × région × service, features + cible. */
const DatasetRowSchema = new Schema(
  {
    versionId: { type: Schema.Types.ObjectId, ref: "DatasetVersion", required: true },
    operateur: { type: String, required: true },
    date: { type: Date, required: true },
    region: { type: String, required: true },
    service: { type: String, required: true },
    features: { type: Schema.Types.Mixed, required: true },
    nbAvis: { type: Number, default: 0 },
    satisfaction: { type: Number, default: null }, // 0–100, null si aucun avis
    classe: { type: String, enum: ["satisfait", "neutre", "insatisfait", null], default: null },
  },
  { collection: "dataset_rows", versionKey: false },
);

DatasetRowSchema.index({ versionId: 1, operateur: 1, date: 1, region: 1, service: 1 });

export type DatasetRowDoc = InferSchemaType<typeof DatasetRowSchema>;

export const DatasetRow: Model<DatasetRowDoc> =
  (models.DatasetRow as Model<DatasetRowDoc>) ?? model("DatasetRow", DatasetRowSchema);
