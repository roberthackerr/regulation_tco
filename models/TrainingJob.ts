import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * Cycle d'un entraînement sur Kaggle, piloté par Next.js :
 *  envoi_dataset   → CSV + meta.json envoyés, version du dataset créée sur Kaggle
 *  attente_dataset → Kaggle traite le dataset (statut « ready » attendu)
 *  entrainement    → notebook poussé, exécution en file puis en cours
 *  recuperation    → téléchargement de metrics.json, preprocess.json, weights.json
 *  termine | echec
 */
export const JOB_STATUSES = ["envoi_dataset", "attente_dataset", "entrainement", "recuperation", "termine", "echec"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const JOB_ACTIVE: JobStatus[] = ["envoi_dataset", "attente_dataset", "entrainement", "recuperation"];

const TrainingJobSchema = new Schema(
  {
    status: { type: String, enum: JOB_STATUSES, default: "envoi_dataset", index: true },
    datasetVersionId: { type: Schema.Types.ObjectId, ref: "DatasetVersion", required: true },
    datasetVersion: { type: Number, required: true },
    triggeredBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    kaggleStatus: { type: String, default: null }, // statut brut renvoyé par Kaggle
    kaggleDatasetVersion: { type: Number, default: null },
    kaggleKernelVersion: { type: Number, default: null },
    gpu: { type: Boolean, default: false },
    modelId: { type: Schema.Types.ObjectId, ref: "MlModel", default: null },
    logs: { type: [{ at: Date, msg: String, _id: false }], default: [] },
    kernelLog: { type: [String], default: [] }, // sortie du notebook (récupérée à la fin)
    error: { type: String, default: null },
    // Horodatages de chaque phase (pour la frise et les durées).
    phases: { type: Schema.Types.Mixed, default: {} },
    lockedUntil: { type: Date, default: null }, // verrou : une seule avancée à la fois
    checkedAt: { type: Date, default: null }, // dernier appel de statut à Kaggle
    startedAt: { type: Date, default: () => new Date() },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: "training_jobs" },
);

export type TrainingJobDoc = InferSchemaType<typeof TrainingJobSchema>;

export const TrainingJob: Model<TrainingJobDoc> =
  (models.TrainingJob as Model<TrainingJobDoc>) ?? model("TrainingJob", TrainingJobSchema);
