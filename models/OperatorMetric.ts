import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { REGIONS, SERVICES } from "@/lib/constants";

/**
 * Une ligne d'indicateurs validée : un opérateur × un mois × une région × un service.
 * Les valeurs absentes (ex. débit pour la voix) sont stockées à null.
 */
const OperatorMetricSchema = new Schema(
  {
    operatorId: { type: Schema.Types.ObjectId, ref: "Operator", required: true },
    importId: { type: Schema.Types.ObjectId, ref: "Import", required: true, index: true },
    date: { type: Date, required: true },
    region: { type: String, enum: REGIONS, required: true },
    service: { type: String, enum: SERVICES, required: true },
    nb_abonnes: { type: Number, required: true },
    taux_coupure: { type: Number, required: true },
    debit_moyen_mbps: { type: Number, default: null },
    latence_ms: { type: Number, default: null },
    taux_disponibilite: { type: Number, required: true },
    nb_reclamations: { type: Number, required: true },
    tarif_moyen_ar: { type: Number, required: true },
  },
  { timestamps: true, collection: "operator_metrics" },
);

// Interdit deux lignes pour le même opérateur, mois, région et service.
OperatorMetricSchema.index(
  { operatorId: 1, date: 1, region: 1, service: 1 },
  { unique: true },
);

export type OperatorMetricDoc = InferSchemaType<typeof OperatorMetricSchema>;

export const OperatorMetric: Model<OperatorMetricDoc> =
  (models.OperatorMetric as Model<OperatorMetricDoc>) ??
  model("OperatorMetric", OperatorMetricSchema);
