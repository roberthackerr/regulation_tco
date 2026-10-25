/**
 * Enrichissement d'une mention : sentiment (lexique FR/MG), thème et région détectés.
 */
import { REGIONS, type Region } from "@/lib/constants";
import { analyserSentiment } from "@/lib/sentiment";
import type { MentionTheme } from "./types";

const THEMES: [MentionTheme, string[]][] = [
  ["mobile_money", ["mvola", "orange money", "airtel money", "transfert", "retrait", "dépôt", "frais de retrait", "vola", "nalefako", "volako", "cash point"]],
  ["internet", ["internet", "4g", "5g", "data", "débit", "connexion", "fibre", "wifi", "méga", "mo ", "go ", "forfait internet", "streaming"]],
  ["tarif", ["prix", "tarif", "cher", "lafo", "promo", "offre", "bonus", "forfait", "recharge", "crédit", "fahafahana", "mora"]],
  ["service_client", ["service client", "hotline", "agence", "conseiller", "attente", "réclamation", "plainte", "mpiasa", "standard", "répondu"]],
  ["reseau", ["réseau", "reseau", "tambajotra", "signal", "couverture", "coupure", "coupé", "tapaka", "antenne", "appel", "antso", "injoignable", "panne"]],
];

/** Villes principales → région (les noms de région sont aussi reconnus directement). */
const VILLES: [string, Region][] = [
  ["antananarivo", "Analamanga"], ["tana", "Analamanga"], ["toamasina", "Atsinanana"], ["tamatave", "Atsinanana"],
  ["mahajanga", "Boeny"], ["majunga", "Boeny"], ["fianarantsoa", "Haute Matsiatra"], ["toliara", "Atsimo-Andrefana"],
  ["tuléar", "Atsimo-Andrefana"], ["antsiranana", "Diana"], ["diego", "Diana"], ["nosy be", "Diana"],
  ["antsirabe", "Vakinankaratra"], ["sambava", "Sava"], ["antalaha", "Sava"], ["morondava", "Menabe"],
  ["taolagnaro", "Anosy"], ["fort-dauphin", "Anosy"], ["ambatondrazaka", "Alaotra-Mangoro"], ["moramanga", "Alaotra-Mangoro"],
  ["ambositra", "Amoron'i Mania"], ["fenoarivo", "Analanjirofo"], ["ambovombe", "Androy"], ["manakara", "Fitovinany"],
  ["mananjary", "Vatovavy"], ["farafangana", "Atsimo-Atsinanana"], ["antsohihy", "Sofia"], ["miarinarivo", "Itasy"],
  ["tsiroanomandidy", "Bongolava"], ["maintirano", "Melaky"], ["ihosy", "Ihorombe"], ["maevatanana", "Betsiboka"],
];

export function detectTheme(texte: string): MentionTheme {
  const t = ` ${texte.toLowerCase()} `;
  let best: MentionTheme = "autre";
  let bestHits = 0;
  for (const [theme, mots] of THEMES) {
    const hits = mots.reduce((n, m) => n + (t.includes(m) ? 1 : 0), 0);
    if (hits > bestHits) {
      best = theme;
      bestHits = hits;
    }
  }
  return best;
}

export function detectRegion(texte: string): Region | null {
  const t = texte.toLowerCase();
  for (const r of REGIONS) if (t.includes(r.toLowerCase())) return r;
  for (const [ville, region] of VILLES) if (t.includes(ville)) return region;
  return null;
}

/**
 * Pour un avis noté (App Store), la note de l'usager fait foi : elle est combinée
 * au texte (70 % note, 30 % lexique), car le lexique seul se trompe sur l'ironie ou l'anglais.
 */
export function enrich(texte: string, note: number | null = null) {
  const s = analyserSentiment(texte);
  let score = s.score;
  let label = s.label;
  if (note != null) {
    score = 0.7 * ((note - 3) / 2) + 0.3 * s.score;
    label = score > 0.2 ? "positif" : score < -0.2 ? "negatif" : "neutre";
  }
  return {
    langue: s.langue,
    sentiment: { label, score: Math.round(score * 1000) / 1000 },
    termes: s.termes.slice(0, 8),
    theme: detectTheme(texte),
    region: detectRegion(texte),
  };
}

/** Pseudonyme stable d'un auteur (on ne conserve jamais le nom ou l'identifiant brut). */
export async function pseudonyme(source: string, id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  const data = new TextEncoder().encode(`${source}:${id}:${process.env.JWT_SECRET ?? ""}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(hash)].slice(0, 3).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `Usager #${hex}`;
}
