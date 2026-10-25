import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { IMPORT_STATUSES } from "@/lib/constants";

/** Une anomalie détectée pendant la validation (erreur bloquante ou avertissement). */
const IssueSchema = new Schema(
  {
    ligne: { type: Number, default: null }, // numéro de ligne dans le fichier (en-tête = 1)
    colonne: { type: String, default: null },
    valeur: { type: String, default: null },
    message: { type: String, required: true },
  },
  { _id: false },
);

/**
 * Un fichier CSV envoyé par un opérateur.
 * Les lignes valides sont gardées dans `rows` tant que l'admin n'a pas approuvé
 * l'import ; à l'approbation elles sont copiées dans `operator_metrics` et
 * retirées d'ici.
 */
const ImportSchema = new Schema(
  {
    operatorId: { type: Schema.Types.ObjectId, ref: "Operator", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    fileName: { type: String, required: true },
    fileHash: { type: String, required: true }, // SHA-256 du contenu, pour détecter un renvoi
    fileSize: { type: Number, required: true },
    status: { type: String, enum: IMPORT_STATUSES, required: true, default: "recu", index: true },
    rowCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    warningCount: { type: Number, default: 0 },
    erreurs: { type: [IssueSchema], default: [] },
    avertissements: { type: [IssueSchema], default: [] },
    // Période couverte par le fichier (premier et dernier mois).
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    rows: { type: [Schema.Types.Mixed], default: undefined, select: false },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    rejectReason: { type: String, default: null },
  },
  { timestamps: true, collection: "imports" },
);

ImportSchema.index({ operatorId: 1, fileHash: 1 });

export type ImportDoc = InferSchemaType<typeof ImportSchema>;

export const Import: Model<ImportDoc> =
  (models.Import as Model<ImportDoc>) ?? model("Import", ImportSchema);
