/**
 * Définitions du pipeline partagées serveur / client : étapes, features, seuils.
 */

export const PIPELINE_STEPS = [
  { key: "extraction", label: "Extraction", detail: "Indicateurs validés et avis publiés" },
  { key: "nettoyage", label: "Nettoyage", detail: "Types, bornes, doublons, valeurs manquantes" },
  { key: "sentiment", label: "Sentiment", detail: "Analyse des commentaires FR / MG" },
  { key: "normalisation", label: "Normalisation", detail: "Régions, valeurs extrêmes, mise à l'échelle" },
  { key: "features", label: "Features", detail: "Indicateurs dérivés, tendances, marché" },
  { key: "fusion", label: "Fusion & cible", detail: "Avis agrégés → score de satisfaction" },
  { key: "versionnage", label: "Dataset versionné", detail: "Empreinte, statistiques, version vN" },
] as const;

export type StepKey = (typeof PIPELINE_STEPS)[number]["key"];

export type FeatureDef = {
  key: string;
  label: string;
  unit: string;
  digits: number;
  group: "qualite" | "usage" | "marche" | "tendance" | "contexte";
  description: string;
};

/** Features produites par le pipeline (dans l'ordre des colonnes du dataset). */
export const FEATURES: FeatureDef[] = [
  { key: "taux_coupure", label: "Taux de coupure", unit: "%", digits: 2, group: "qualite", description: "Part des appels ou sessions interrompus." },
  { key: "taux_disponibilite", label: "Disponibilité", unit: "%", digits: 2, group: "qualite", description: "Disponibilité du réseau sur le mois." },
  { key: "debit_moyen_mbps", label: "Débit moyen", unit: "Mb/s", digits: 1, group: "qualite", description: "Service data uniquement (vide sinon)." },
  { key: "latence_ms", label: "Latence", unit: "ms", digits: 0, group: "qualite", description: "Vide pour les SMS." },
  { key: "indice_qualite", label: "Indice qualité", unit: "/100", digits: 1, group: "qualite", description: "Rang moyen (percentiles) de coupure, disponibilité, latence et réclamations, à service et mois égaux." },
  { key: "log_abonnes", label: "Abonnés (log)", unit: "", digits: 2, group: "usage", description: "ln(1 + nombre d'abonnés) : écrase les écarts de taille entre régions." },
  { key: "reclamations_pour_1000", label: "Réclamations ‰", unit: "‰", digits: 2, group: "usage", description: "Réclamations pour 1 000 abonnés." },
  { key: "part_de_marche", label: "Part de marché", unit: "%", digits: 1, group: "marche", description: "Abonnés de l'opérateur / total des 3 opérateurs, même région, service et mois." },
  { key: "ecart_tarif_marche", label: "Écart tarif marché", unit: "%", digits: 1, group: "marche", description: "Écart au tarif moyen des opérateurs (positif = plus cher)." },
  { key: "coupure_var_1m", label: "Δ coupure (1 mois)", unit: "pt", digits: 2, group: "tendance", description: "Variation du taux de coupure depuis le mois précédent." },
  { key: "coupure_moy_3m", label: "Coupure (moy. 3 mois)", unit: "%", digits: 2, group: "tendance", description: "Moyenne glissante sur 3 mois." },
  { key: "dispo_moy_3m", label: "Disponibilité (moy. 3 mois)", unit: "%", digits: 2, group: "tendance", description: "Moyenne glissante sur 3 mois." },
  { key: "reclamations_var_1m", label: "Δ réclamations (1 mois)", unit: "‰", digits: 2, group: "tendance", description: "Variation des réclamations pour 1 000 abonnés." },
  { key: "satisfaction_m1", label: "Satisfaction M-1", unit: "/100", digits: 1, group: "tendance", description: "Satisfaction du mois précédent (décalée : pas de fuite de la cible)." },
  { key: "saison_cyclonique", label: "Saison cyclonique", unit: "", digits: 0, group: "contexte", description: "1 de janvier à mars dans les régions de la côte est." },
  { key: "mois_sin", label: "Saison (sin)", unit: "", digits: 3, group: "contexte", description: "Encodage cyclique du mois." },
  { key: "mois_cos", label: "Saison (cos)", unit: "", digits: 3, group: "contexte", description: "Encodage cyclique du mois." },
];

export const FEATURE_KEYS = FEATURES.map((f) => f.key);

export const FEATURE_GROUPS: Record<FeatureDef["group"], string> = {
  qualite: "Qualité de service",
  usage: "Usage",
  marche: "Marché",
  tendance: "Tendances",
  contexte: "Contexte",
};

/** Seuils des classes de satisfaction (score 0–100). */
export const CLASSES = [
  { key: "satisfait", label: "Satisfait", min: 65 },
  { key: "neutre", label: "Neutre", min: 45 },
  { key: "insatisfait", label: "Insatisfait", min: -Infinity },
] as const;
export type ClasseKey = (typeof CLASSES)[number]["key"];

export function classeDe(score: number): ClasseKey {
  return CLASSES.find((c) => score >= c.min)!.key;
}

/** Régions de la côte est exposées aux cyclones (janvier–mars). */
export const REGIONS_COTE_EST = ["Sava", "Analanjirofo", "Atsinanana", "Vatovavy", "Fitovinany", "Atsimo-Atsinanana", "Alaotra-Mangoro"];
