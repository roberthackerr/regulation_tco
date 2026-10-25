import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * Un modèle entraîné sur Kaggle. Les poids (MLP de quelques milliers de paramètres)
 * sont stockés ici : l'inférence se fait directement en TypeScript, sans TensorFlow.
 */
const MlModelSchema = new Schema(
  {
    version: { type: Number, required: true, unique: true },
    jobId: { type: Schema.Types.ObjectId, ref: "TrainingJob", required: true },
    datasetVersionId: { type: Schema.Types.ObjectId, ref: "DatasetVersion", required: true },
    datasetVersion: { type: Number, required: true },
    active: { type: Boolean, default: false, index: true },
    metrics: { type: Schema.Types.Mixed, required: true }, // metrics.json
    preprocess: { type: Schema.Types.Mixed, required: true }, // preprocess.json
    weights: { type: Schema.Types.Mixed, required: true }, // weights.json : couches denses
    ranges: { type: Schema.Types.Mixed, default: {} }, // min / max / médiane par feature (simulateur)
  },
  { timestamps: true, collection: "models" },
);

export type MlModelDoc = InferSchemaType<typeof MlModelSchema>;

export const MlModel: Model<MlModelDoc> = (models.MlModel as Model<MlModelDoc>) ?? model("MlModel", MlModelSchema);
