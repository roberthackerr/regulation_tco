/**
 * Constantes métier partagées (serveur et client).
 * Toute liste de référence (opérateurs, régions, services, colonnes CSV)
 * est définie ici et uniquement ici.
 */

export const ROLES = ["admin", "operator"] as const;
export type Role = (typeof ROLES)[number];

export const OPERATORS = [
  { code: "YAS", nom: "Yas (ex-Telma)" },
  { code: "ORANGE", nom: "Orange Madagascar" },
  { code: "AIRTEL", nom: "Airtel Madagascar" },
] as const;
export type OperatorCode = (typeof OPERATORS)[number]["code"];

/** Les 23 régions de Madagascar (découpage en vigueur depuis 2021). */
export const REGIONS = [
  "Alaotra-Mangoro",
  "Amoron'i Mania",
  "Analamanga",
  "Analanjirofo",
  "Androy",
  "Anosy",
  "Atsimo-Andrefana",
  "Atsimo-Atsinanana",
  "Atsinanana",
  "Betsiboka",
  "Boeny",
  "Bongolava",
  "Diana",
  "Fitovinany",
  "Haute Matsiatra",
  "Ihorombe",
  "Itasy",
  "Melaky",
  "Menabe",
  "Sava",
  "Sofia",
  "Vakinankaratra",
  "Vatovavy",
] as const;
export type Region = (typeof REGIONS)[number];

export const SERVICES = ["voix", "data", "sms", "mobile_money"] as const;
export type Service = (typeof SERVICES)[number];

export const SERVICE_LABELS: Record<Service, string> = {
  voix: "Voix",
  data: "Data",
  sms: "SMS",
  mobile_money: "Mobile money",
};

/**
 * Cycle de vie d'un import :
 *  recu    → fichier reçu, validation technique réussie, en attente d'approbation admin
 *  valide  → approuvé par l'admin, lignes enregistrées (sera traité par le pipeline en phase 2)
 *  rejete  → erreurs de validation, ou refus de l'admin
 *  traite  → passé dans le pipeline de traitement
 */
export const IMPORT_STATUSES = ["recu", "valide", "rejete", "traite"] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  recu: "Reçu",
  valide: "Validé",
  rejete: "Rejeté",
  traite: "Traité",
};

/** Colonnes du CSV standard, dans l'ordre du modèle téléchargeable. */
export const CSV_COLUMNS = [
  "date",
  "region",
  "service",
  "nb_abonnes",
  "taux_coupure",
  "debit_moyen_mbps",
  "latence_ms",
  "taux_disponibilite",
  "nb_reclamations",
  "tarif_moyen_ar",
] as const;
export type CsvColumn = (typeof CSV_COLUMNS)[number];

/** Colonnes numériques et leurs règles. */
export const NUMERIC_RULES: Record<
  Exclude<CsvColumn, "date" | "region" | "service">,
  { integer: boolean; min: number; max: number; minExclusive?: boolean }
> = {
  nb_abonnes: { integer: true, min: 0, max: 50_000_000 },
  taux_coupure: { integer: false, min: 0, max: 100 },
  debit_moyen_mbps: { integer: false, min: 0, max: 10_000, minExclusive: true },
  latence_ms: { integer: true, min: 1, max: 5000 },
  taux_disponibilite: { integer: false, min: 0, max: 100 },
  nb_reclamations: { integer: true, min: 0, max: 10_000_000 },
  tarif_moyen_ar: { integer: false, min: 0, max: 10_000_000, minExclusive: true },
};

/** Limites d'import. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 Mo
export const MAX_CSV_ROWS = 20_000;

/** Vérifie qu'une chaîne est un code opérateur connu (et la type en conséquence). */
export function isOperatorCode(v: string | null | undefined): v is OperatorCode {
  return !!v && OPERATORS.some((o) => o.code === v);
}
