import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * Une version du jeu de données d'entraînement (v1, v2…).
 * Les lignes sont dans `dataset_rows` ; ici on garde le résumé : statistiques,
 * corrélations, qualité, empreinte (checksum) pour détecter les versions identiques.
 */
const DatasetVersionSchema = new Schema(
  {
    version: { type: Number, required: true, unique: true },
    runId: { type: Schema.Types.ObjectId, ref: "PipelineRun", required: true },
    importIds: { type: [Schema.Types.ObjectId], default: [] },
    nbLignes: { type: Number, required: true },
    nbEtiquetees: { type: Number, required: true }, // lignes avec une satisfaction calculée
    nbAvis: { type: Number, required: true },
    features: { type: [String], required: true },
    target: { type: String, default: "satisfaction" },
    checksum: { type: String, required: true, index: true },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    couverture: { type: Schema.Types.Mixed, default: {} }, // { operateurs, mois, regions, services }
    qualite: { type: Schema.Types.Mixed, default: {} }, // score, complétude, imputations…
    stats: { type: Schema.Types.Mixed, default: {} }, // par feature : min, max, moyenne, écart-type, histogramme
    correlations: { type: Schema.Types.Mixed, default: {} }, // { keys: string[], matrix: number[][] }
    classes: { type: Schema.Types.Mixed, default: {} }, // { satisfait, neutre, insatisfait }
    scaler: { type: Schema.Types.Mixed, default: {} }, // moyenne / écart-type par feature (normalisation)
    sentiment: { type: Schema.Types.Mixed, default: {} }, // justesse du lexique vs étiquette de référence
    kaggleVersion: { type: Number, default: null }, // renseigné en phase 3
  },
  { timestamps: true, collection: "dataset_versions" },
);

export type DatasetVersionDoc = InferSchemaType<typeof DatasetVersionSchema>;

export const DatasetVersion: Model<DatasetVersionDoc> =
  (models.DatasetVersion as Model<DatasetVersionDoc>) ?? model("DatasetVersion", DatasetVersionSchema);
