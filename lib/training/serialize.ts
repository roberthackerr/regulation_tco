import "server-only";
import type { MlModelDoc } from "@/models/MlModel";
import type { TrainingJobDoc } from "@/models/TrainingJob";

type WithId<T> = T & { _id: unknown };
const iso = (d: unknown) => (d ? new Date(d as Date).toISOString() : null);

export function serializeJob(j: WithId<TrainingJobDoc>, full = false) {
  const phases = Object.fromEntries(Object.entries((j.phases ?? {}) as Record<string, unknown>).map(([k, v]) => [k, iso(v)]));
  return {
    id: String(j._id),
    status: j.status,
    datasetVersion: j.datasetVersion,
    datasetVersionId: String(j.datasetVersionId),
    kaggleStatus: j.kaggleStatus ?? null,
    kaggleDatasetVersion: j.kaggleDatasetVersion ?? null,
    kaggleKernelVersion: j.kaggleKernelVersion ?? null,
    gpu: Boolean(j.gpu),
    modelId: j.modelId ? String(j.modelId) : null,
    error: j.error ?? null,
    phases,
    startedAt: iso(j.startedAt)!,
    finishedAt: iso(j.finishedAt),
    logs: full ? (j.logs ?? []).map((l) => ({ at: iso(l.at), msg: l.msg ?? "" })) : [],
    kernelLog: full ? j.kernelLog ?? [] : [],
  };
}

type M = Record<string, unknown>;
export function serializeModelSummary(m: WithId<Omit<MlModelDoc, "weights" | "preprocess" | "ranges">>) {
  const k = (m.metrics ?? {}) as M;
  const pick = (key: string) => (typeof k[key] === "number" ? (k[key] as number) : null);
  return {
    id: String(m._id),
    version: m.version,
    active: Boolean(m.active),
    datasetVersion: m.datasetVersion,
    mae: pick("mae"),
    rmse: pick("rmse"),
    r2: pick("r2"),
    baselineMae: pick("baseline_mae"),
    accuracy: pick("accuracy"),
    f1: pick("f1_macro"),
    epochs: pick("epochs"),
    gpu: Boolean(k.gpu),
    durationS: pick("duration_s"),
    createdAt: iso((m as unknown as { createdAt: Date }).createdAt)!,
  };
}

export function serializeModel(m: WithId<MlModelDoc>) {
  return { ...serializeModelSummary(m), metrics: m.metrics, preprocess: m.preprocess, weights: m.weights, ranges: m.ranges ?? {} };
}
