/**
 * Couleurs des données et définitions des indicateurs affichés.
 *
 * Chaque opérateur a une couleur FIXE (elle suit l'opérateur, jamais son rang).
 * Ce sont les 3 premiers emplacements de la palette catégorielle de référence,
 * validés deux à deux pour la vision normale et les daltonismes (ΔE CVD ≥ 9).
 */
import type { OperatorCode, Service } from "./constants";

export const OPERATOR_COLORS: Record<OperatorCode, string> = {
  YAS: "#2a78d6", // bleu
  ORANGE: "#eb6834", // orange
  AIRTEL: "#1baf7a", // aqua
};

/** Couleurs de structure des graphiques (encre et traits discrets). */
export const CHART = {
  surface: "#fcfcfb",
  grid: "#e4e3dc",
  axis: "#c3c2b7",
  tick: "#6f6e69",
  ink: "#0b0b0b",
  ink2: "#52514e",
  single: "#2a78d6", // série unique
  areaOpacity: 0.1,
};

/** Indicateurs affichables dans les graphiques. */
export type MetricKey =
  | "taux_coupure"
  | "taux_disponibilite"
  | "debit_moyen_mbps"
  | "latence_ms"
  | "reclamations_pour_1000"
  | "tarif_moyen_ar"
  | "nb_abonnes";

export type MetricDef = {
  key: MetricKey;
  label: string;
  short: string;
  unit: string;
  digits: number;
  /** true si une valeur plus basse est meilleure (coupures, latence…). */
  lowerIsBetter: boolean;
  /** Services pour lesquels l'indicateur a un sens. */
  services: readonly Service[];
};

const ALL: readonly Service[] = ["voix", "data", "sms", "mobile_money"];

export const METRICS: Record<MetricKey, MetricDef> = {
  taux_coupure: { key: "taux_coupure", label: "Taux de coupure", short: "Coupures", unit: "%", digits: 2, lowerIsBetter: true, services: ALL },
  taux_disponibilite: { key: "taux_disponibilite", label: "Disponibilité du réseau", short: "Disponibilité", unit: "%", digits: 2, lowerIsBetter: false, services: ALL },
  debit_moyen_mbps: { key: "debit_moyen_mbps", label: "Débit moyen", short: "Débit", unit: "Mb/s", digits: 1, lowerIsBetter: false, services: ["data"] },
  latence_ms: { key: "latence_ms", label: "Latence moyenne", short: "Latence", unit: "ms", digits: 0, lowerIsBetter: true, services: ["voix", "data", "mobile_money"] },
  reclamations_pour_1000: { key: "reclamations_pour_1000", label: "Réclamations pour 1 000 abonnés", short: "Réclamations", unit: "‰", digits: 2, lowerIsBetter: true, services: ALL },
  tarif_moyen_ar: { key: "tarif_moyen_ar", label: "Tarif moyen", short: "Tarif", unit: "Ar", digits: 0, lowerIsBetter: true, services: ALL },
  nb_abonnes: { key: "nb_abonnes", label: "Abonnés", short: "Abonnés", unit: "", digits: 0, lowerIsBetter: false, services: ALL },
};

/** Unité du tarif selon le service (Ar par minute, par Go, par SMS, par transaction). */
export const TARIF_UNIT: Record<Service, string> = {
  voix: "Ar/min",
  data: "Ar/Go",
  sms: "Ar/SMS",
  mobile_money: "Ar/transaction",
};

export function metricsFor(service: Service): MetricDef[] {
  return Object.values(METRICS).filter((m) => m.services.includes(service));
}

export function unitFor(metric: MetricDef, service: Service): string {
  return metric.key === "tarif_moyen_ar" ? TARIF_UNIT[service] : metric.unit;
}
