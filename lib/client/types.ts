/** Formes des réponses API utilisées par les pages (miroir de lib/serialize.ts). */
import type { ImportStatus, OperatorCode, Role, Service } from "@/lib/constants";

export type Issue = { ligne: number | null; colonne: string | null; valeur: string | null; message: string };

export type ImportSummary = {
  id: string;
  operatorCode: OperatorCode | null;
  uploadedBy: string | null;
  fileName: string;
  fileSize: number;
  status: ImportStatus;
  rowCount: number;
  errorCount: number;
  warningCount: number;
  periodStart: string | null;
  periodEnd: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
  erreurs?: Issue[];
  avertissements?: Issue[];
};

export type UserSummary = {
  id: string;
  email: string;
  nom: string;
  role: Role;
  operatorCode: OperatorCode | null;
  actif: boolean;
  lastLogin: string | null;
  createdAt: string;
};

export type MonthMetric = {
  date: string;
  service: Service;
  nb_abonnes: number;
  nb_reclamations: number;
  nb_regions: number;
  debit_moyen_mbps: number | null;
  latence_ms: number | null;
  taux_coupure: number | null;
  taux_disponibilite: number | null;
  tarif_moyen_ar: number | null;
  reclamations_pour_1000: number | null;
};

export type RegionMetric = {
  region: string;
  service: Service;
  nb_abonnes: number;
  nb_reclamations: number;
  taux_coupure: number;
  taux_disponibilite: number;
  debit_moyen_mbps: number | null;
  latence_ms: number | null;
  tarif_moyen_ar: number;
  reclamations_pour_1000: number | null;
};

export type MetricsResponse = {
  operator: OperatorCode;
  dernierMois: string | null;
  parMois: MonthMetric[];
  parRegion: RegionMetric[];
};

export type PublicStats = {
  mois: string | null;
  operateurs: {
    code: OperatorCode;
    nom: string;
    taux_coupure: number | null;
    taux_disponibilite: number | null;
    debit_moyen_mbps: number | null;
    latence_data_ms: number | null;
    regions_couvertes: number;
  }[];
  evolution: { date: string; code: OperatorCode; taux_coupure: number | null }[];
  totaux: { lignes: number; operateurs: number; regions: number; mois: number };
};

/* ------------------------------------------------------------------ Pipeline (phase 2) */

export type StepStatus = "attente" | "en_cours" | "termine" | "echec" | "ignore";

export type PipelineStep = {
  key: string;
  status: StepStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  stats: Record<string, number | boolean | null>;
  logs?: string[];
};

export type PipelineRunSummary = {
  id: string;
  status: "en_cours" | "termine" | "echec";
  trigger: "auto" | "manuel";
  imports: number;
  version: number | null;
  datasetVersionId: string | null;
  unchanged: boolean;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  steps: PipelineStep[];
};

export type DatasetVersionSummary = {
  id: string;
  version: number;
  nbLignes: number;
  nbEtiquetees: number;
  nbAvis: number;
  nbFeatures: number;
  checksum: string;
  periodStart: string | null;
  periodEnd: string | null;
  couverture: { operateurs?: string[]; mois?: number; regions?: number; services?: number };
  qualite: { score?: number; completude?: number; etiquetage?: number; retouchees?: number };
  classes: { satisfait?: number; neutre?: number; insatisfait?: number };
  kaggleVersion: number | null;
  createdAt: string;
};

export type PipelineOverview = {
  current: PipelineRunSummary | null;
  runs: PipelineRunSummary[];
  versions: DatasetVersionSummary[];
  sources: { aTraiter: number; lignes: number; avis: number; avisAnalyses: number };
};

export type FeatureStat = {
  n: number;
  manquants: number;
  min: number;
  max: number;
  moyenne: number;
  ecartType: number;
  mediane: number;
  histogramme: number[];
};

export type DatasetRowView = {
  operateur: OperatorCode;
  date: string;
  region: string;
  service: Service;
  features: Record<string, number | null>;
  nbAvis: number;
  satisfaction: number | null;
  classe: "satisfait" | "neutre" | "insatisfait" | null;
};

export type DatasetDetail = DatasetVersionSummary & {
  features: string[];
  stats: Record<string, FeatureStat>;
  correlations: { keys: string[]; matrix: (number | null)[][] };
  sentiment: { distribution?: Record<string, number>; langues?: Record<string, number>; justesse?: number | null; compares?: number; analyses?: number };
  rowsAvailable: boolean;
  previous: DatasetVersionSummary | null;
  satisfaction: {
    parOpService: { operateur: OperatorCode; service: Service; moyenne: number; n: number }[];
    parMois: { operateur: OperatorCode; date: string; moyenne: number }[];
  };
  rows: DatasetRowView[];
  total: number;
  page: number;
  pageSize: number;
};

/* ------------------------------------------------------------------ Entraînement (phase 3) */

export type JobStatus = "envoi_dataset" | "attente_dataset" | "entrainement" | "recuperation" | "termine" | "echec";

export type TrainingJobView = {
  id: string;
  status: JobStatus;
  datasetVersion: number;
  datasetVersionId: string;
  kaggleStatus: string | null;
  kaggleDatasetVersion: number | null;
  kaggleKernelVersion: number | null;
  gpu: boolean;
  modelId: string | null;
  error: string | null;
  phases: Partial<Record<JobStatus, string | null>>;
  startedAt: string;
  finishedAt: string | null;
  logs: { at: string | null; msg: string }[];
  kernelLog: string[];
};

export type ModelSummary = {
  id: string;
  version: number;
  active: boolean;
  datasetVersion: number;
  mae: number | null;
  rmse: number | null;
  r2: number | null;
  baselineMae: number | null;
  accuracy: number | null;
  f1: number | null;
  epochs: number | null;
  gpu: boolean;
  durationS: number | null;
  createdAt: string;
};

export type ModelMetrics = {
  mae: number;
  rmse: number;
  r2: number;
  baseline_mae: number;
  accuracy: number;
  f1_macro: number;
  confusion: number[][];
  class_names: string[];
  importance: { feature: string; impact: number }[];
  history: { loss: number[]; val_loss: number[]; mae: number[]; val_mae: number[] };
  epochs: number;
  n_train: number;
  n_val: number;
  val_months: string[];
  backend: string;
  keras_version: string;
  gpu: boolean;
  duration_s: number;
};

export type ModelDetail = ModelSummary & {
  metrics: ModelMetrics;
  preprocess: import("@/lib/ml/predict").Preprocess;
  weights: import("@/lib/ml/predict").Weights;
  ranges: Record<string, { min: number; max: number; mediane: number }>;
};

export type TrainingOverview = {
  config: {
    configured: boolean;
    hasCredentials: boolean;
    username: string | null;
    gpu: boolean;
    datasetRef: string | null;
    kernelRef: string | null;
    datasetUrl: string | null;
    kernelUrl: string | null;
  };
  current: TrainingJobView | null;
  jobs: TrainingJobView[];
  models: ModelSummary[];
  versions: { id: string; version: number; nbEtiquetees: number; nbLignes: number; kaggleVersion: number | null }[];
};
