/** Types partagés de la veille (serveur et client). Uniquement des sources réelles. */
import type { OperatorCode } from "@/lib/constants";

export type MentionSource = "app_store" | "google_news" | "youtube" | "facebook" | "x";
export type MentionTheme = "reseau" | "internet" | "tarif" | "mobile_money" | "service_client" | "autre";

export const SOURCE_LABELS: Record<MentionSource, string> = {
  app_store: "Avis App Store",
  google_news: "Presse en ligne",
  youtube: "YouTube",
  facebook: "Facebook",
  x: "X (Twitter)",
};

/** Couleurs fixes par source (palette catégorielle, emplacements 4 à 8). */
export const SOURCE_COLORS: Record<MentionSource, string> = {
  app_store: "#d6458b",
  google_news: "#7c5cc4",
  youtube: "#c9a227",
  facebook: "#4a5bd4",
  x: "#3d3d3a",
};

export const THEME_LABELS: Record<MentionTheme, string> = {
  reseau: "Réseau & couverture",
  internet: "Internet mobile",
  tarif: "Tarifs & offres",
  mobile_money: "Mobile money",
  service_client: "Service client",
  autre: "Autre",
};

/** Mention brute renvoyée par un connecteur, avant enrichissement. */
export type RawMention = {
  externalId: string;
  texte: string;
  url?: string | null;
  auteur?: string | null;
  publishedAt: Date;
  engagement?: number;
  note?: number | null; // note 1–5 (avis d'application)
};

export type SourceMode = "reel" | "off";
export type SourceStatus = { source: MentionSource; mode: SourceMode; detail: string };

/**
 * Expressions de recherche par opérateur : toujours qualifiées (« … Madagascar »)
 * pour éviter les homonymes (« Telma » est aussi un prénom, une entreprise française…).
 */
export const OPERATOR_KEYWORDS: Record<OperatorCode, string[]> = {
  YAS: ["Yas Madagascar", "Telma Madagascar", "MVola"],
  ORANGE: ["Orange Madagascar", "Orange Money Madagascar"],
  AIRTEL: ["Airtel Madagascar", "Airtel Money Madagascar"],
};

/** Mots (ou médias malgaches) qui confirment qu'un texte concerne bien Madagascar. */
export const RELEVANCE_WORDS = ["madagascar", "madagasikara", "malgache", "malagasy", "antananarivo", "tana", "ariary", "newsmada", "capmad", "moov.mg", "2424.mg", "lexpress.mg", "toamasina", "mahajanga", "fianarantsoa", "toliara", "antsirabe"];

/** Recherche presse : requête Google Actualités + marque à retrouver dans le texte (mot entier). */
export const OPERATOR_NEWS: Record<OperatorCode, { query: string; brand: RegExp }> = {
  YAS: { query: "(Yas OR Telma OR MVola) Madagascar", brand: /\b(yas|telma|mvola)\b/i },
  ORANGE: { query: '("Orange Madagascar" OR "Orange Money") Madagascar', brand: /\borange\b/i },
  AIRTEL: { query: '(Airtel OR "Airtel Money") Madagascar', brand: /\bairtel\b/i },
};

/**
 * Applications officielles des opérateurs sur l'App Store (identifiants Apple).
 * `pays` : vitrines lues. Les applis panafricaines ne sont lues que sur la vitrine malgache (mg).
 */
export const OPERATOR_APPS: Record<OperatorCode, { id: number; nom: string; pays: string[] }[]> = {
  YAS: [
    { id: 1496566692, nom: "MVola", pays: ["mg", "fr"] },
    { id: 1433886664, nom: "Yas et moi", pays: ["mg", "fr"] },
    { id: 6743745301, nom: "Yas App", pays: ["mg", "fr"] },
  ],
  ORANGE: [{ id: 1295171817, nom: "Orange Max it - Madagascar", pays: ["mg", "fr"] }],
  AIRTEL: [{ id: 1462268018, nom: "My Airtel Africa", pays: ["mg"] }],
};
