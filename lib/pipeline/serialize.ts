import "server-only";

type RunLike = {
  _id: unknown;
  status: string;
  trigger: string;
  importIds?: unknown[];
  steps: { key: string; status: string; startedAt?: Date | null; finishedAt?: Date | null; durationMs?: number | null; stats?: unknown; logs?: string[] }[];
  datasetVersionId?: unknown;
  unchanged?: boolean;
  error?: string | null;
  startedAt: Date;
  finishedAt?: Date | null;
  durationMs?: number | null;
};

/** Passage du pipeline pour l'API (`withLogs` : journal complet de chaque étape). */
export function serializeRun(r: RunLike, versionNumber: number | null, withLogs = false) {
  return {
    id: String(r._id),
    status: r.status,
    trigger: r.trigger,
    imports: r.importIds?.length ?? 0,
    version: versionNumber,
    datasetVersionId: r.datasetVersionId ? String(r.datasetVersionId) : null,
    unchanged: r.unchanged ?? false,
    error: r.error ?? null,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt ?? null,
    durationMs: r.durationMs ?? null,
    steps: r.steps.map((s) => ({
      key: s.key,
      status: s.status,
      startedAt: s.startedAt ?? null,
      finishedAt: s.finishedAt ?? null,
      durationMs: s.durationMs ?? null,
      stats: s.stats ?? {},
      ...(withLogs ? { logs: s.logs ?? [] } : {}),
    })),
  };
}

type VersionLike = {
  _id: unknown;
  version: number;
  nbLignes: number;
  nbEtiquetees: number;
  nbAvis: number;
  features: string[];
  checksum: string;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  couverture?: unknown;
  qualite?: unknown;
  classes?: unknown;
  kaggleVersion?: number | null;
  createdAt?: Date;
};

export function serializeVersion(v: VersionLike) {
  return {
    id: String(v._id),
    version: v.version,
    nbLignes: v.nbLignes,
    nbEtiquetees: v.nbEtiquetees,
    nbAvis: v.nbAvis,
    nbFeatures: v.features.length,
    checksum: v.checksum,
    periodStart: v.periodStart ?? null,
    periodEnd: v.periodEnd ?? null,
    couverture: v.couverture ?? {},
    qualite: v.qualite ?? {},
    classes: v.classes ?? {},
    kaggleVersion: v.kaggleVersion ?? null,
    createdAt: v.createdAt ?? null,
  };
}
