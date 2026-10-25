import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

export const RUN_STATUSES = ["en_cours", "termine", "echec"] as const;
export const STEP_STATUSES = ["attente", "en_cours", "termine", "echec", "ignore"] as const;

/** Une étape du pipeline, avec ses chiffres clés et son journal. */
const StepSchema = new Schema(
  {
    key: { type: String, required: true },
    status: { type: String, enum: STEP_STATUSES, default: "attente" },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
    stats: { type: Schema.Types.Mixed, default: {} },
    logs: { type: [String], default: [] },
  },
  { _id: false },
);

/** Une exécution du pipeline de traitement (automatique après approbation, ou manuelle). */
const PipelineRunSchema = new Schema(
  {
    status: { type: String, enum: RUN_STATUSES, default: "en_cours", index: true },
    trigger: { type: String, enum: ["auto", "manuel"], required: true },
    triggeredBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    importIds: { type: [Schema.Types.ObjectId], default: [] },
    steps: { type: [StepSchema], default: [] },
    datasetVersionId: { type: Schema.Types.ObjectId, ref: "DatasetVersion", default: null },
    // Vrai si les données n'ont pas changé depuis la version précédente (aucune nouvelle version).
    unchanged: { type: Boolean, default: false },
    error: { type: String, default: null },
    startedAt: { type: Date, default: () => new Date() },
    finishedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
  },
  { timestamps: true, collection: "pipeline_runs" },
);

export type PipelineRunDoc = InferSchemaType<typeof PipelineRunSchema>;

export const PipelineRun: Model<PipelineRunDoc> =
  (models.PipelineRun as Model<PipelineRunDoc>) ?? model("PipelineRun", PipelineRunSchema);
