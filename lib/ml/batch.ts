import "server-only";
import { connectDb } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { featureApplies, predict, type Preprocess, type Weights } from "@/lib/ml/predict";
import { DatasetRow } from "@/models/DatasetRow";
import { DatasetVersion } from "@/models/DatasetVersion";
import { MlModel } from "@/models/MlModel";

/**
 * Prédictions en lot : le modèle actif est appliqué à toutes les lignes du dernier dataset
 * (opérateur × mois × région × service). Le résultat est gardé en mémoire tant que le
 * modèle actif et la version du dataset ne changent pas.
 */

export type PredRow = {
  operateur: string;
  date: string; // AAAA-MM-01
  region: string;
  service: string;
  score: number;
  classe: string;
  probas: Record<string, number>;
  observe: number | null; // satisfaction calculée à partir des avis (si disponible)
  nbAvis: number;
  features: Record<string, number | null>;
};

export type Ranges = Record<string, { min: number; max: number; mediane: number }>;

export type BatchResult = {
  key: string;
  model: { id: string; version: number; mae: number | null; r2: number | null; accuracy: number | null; datasetVersion: number };
  dataset: { id: string; version: number };
  preprocess: Preprocess;
  weights: Weights;
  ranges: Ranges;
  rows: PredRow[];
  months: string[];
};

const g = globalThis as unknown as { __predCache?: BatchResult };

export async function getBatch(): Promise<BatchResult> {
  await connectDb();
  const [model, dataset] = await Promise.all([
    MlModel.findOne({ active: true }).lean(),
    DatasetVersion.findOne({}, { version: 1 }).sort({ version: -1 }).lean(),
  ]);
  if (!model) throw new HttpError(404, "Aucun modèle actif : entraînez d'abord un modèle (Modèle IA → Entraîner sur Kaggle).");
  if (!dataset) throw new HttpError(404, "Aucun dataset : lancez d'abord le pipeline de traitement.");

  const key = `${model._id}:${dataset._id}`;
  if (g.__predCache?.key === key) return g.__predCache;

  const preprocess = model.preprocess as Preprocess;
  const weights = model.weights as Weights;
  const ranges = (model.ranges ?? {}) as Ranges;
  const metrics = (model.metrics ?? {}) as Record<string, unknown>;
  const num = (k: string) => (typeof metrics[k] === "number" ? (metrics[k] as number) : null);

  const raw = await DatasetRow.find({ versionId: dataset._id }).lean();
  const rows: PredRow[] = raw.map((r) => {
    const features = (r.features ?? {}) as Record<string, number | null>;
    const p = predict(preprocess, weights, { operateur: r.operateur, service: r.service, region: r.region, features });
    return {
      operateur: r.operateur,
      date: new Date(r.date).toISOString().slice(0, 10),
      region: r.region,
      service: r.service,
      score: Math.round(p.score * 10) / 10,
      classe: p.classe,
      probas: p.probas,
      observe: r.satisfaction ?? null,
      nbAvis: r.nbAvis ?? 0,
      features,
    };
  });

  const result: BatchResult = {
    key,
    model: { id: String(model._id), version: model.version, mae: num("mae"), r2: num("r2"), accuracy: num("accuracy"), datasetVersion: model.datasetVersion },
    dataset: { id: String(dataset._id), version: dataset.version },
    preprocess,
    weights,
    ranges,
    rows,
    months: [...new Set(rows.map((r) => r.date))].sort(),
  };
  g.__predCache = result;
  return result;
}

/**
 * Explication d'une prédiction : pour chaque indicateur, on le remplace par sa valeur
 * médiane (situation « typique ») et on mesure l'écart de score.
 * contribution > 0 : l'indicateur tire la satisfaction vers le haut.
 */
export function explain(b: BatchResult, row: PredRow) {
  const base = { operateur: row.operateur, service: row.service, region: row.region };
  const contributions = b.preprocess.features
    .filter((f) => b.ranges[f] && featureApplies(f, row.service) && row.features[f] != null)
    .map((f) => {
      const typique = b.ranges[f].mediane;
      const sans = predict(b.preprocess, b.weights, { ...base, features: { ...row.features, [f]: typique } }).score;
      return { feature: f, valeur: row.features[f] as number, typique, contribution: Math.round((row.score - sans) * 100) / 100 };
    })
    .sort((a, c) => Math.abs(c.contribution) - Math.abs(a.contribution));

  const typiqueScore = predict(b.preprocess, b.weights, {
    ...base,
    features: Object.fromEntries(b.preprocess.features.map((f) => [f, featureApplies(f, row.service) && b.ranges[f] ? b.ranges[f].mediane : null])),
  }).score;

  // Scénario « tout ramener au moins à la médiane » sur les indicateurs qui pénalisent.
  const leviers = contributions.filter((c) => c.contribution < -0.3 && !["mois_sin", "mois_cos", "saison_cyclonique", "satisfaction_m1", "log_abonnes", "part_de_marche"].includes(c.feature));
  const corrige = { ...row.features };
  for (const l of leviers) corrige[l.feature] = l.typique;
  const potentiel = leviers.length ? predict(b.preprocess, b.weights, { ...base, features: corrige }).score : row.score;

  return {
    contributions: contributions.slice(0, 12),
    typique: Math.round(typiqueScore * 10) / 10,
    leviers: leviers.slice(0, 4).map((l) => ({ feature: l.feature, valeur: l.valeur, cible: l.typique, gain: -l.contribution })),
    potentiel: Math.round(potentiel * 10) / 10,
  };
}
