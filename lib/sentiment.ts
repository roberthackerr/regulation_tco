/**
 * Analyse de sentiment par lexique, en français et en malgache.
 *
 * Solution de secours tant que le modèle BiLSTM (phase 3) n'est pas disponible.
 * Principe :
 *  1. on repère d'abord les expressions (« aucune coupure », « tsy mandeha »…) ;
 *  2. puis les mots isolés, avec gestion de la négation (pas, jamais, tsy…)
 *     et des intensifs (très, trop, be, loatra, mihitsy…) ;
 *  3. les marqueurs de nuance (parfois, moyen, antonony, indraindray…) ramènent vers le neutre ;
 *  4. après « mais » / « fa », la seconde moitié de la phrase pèse plus.
 *
 * Fonction pure, sans dépendance : utilisable côté serveur comme côté client.
 */

export type SentimentLabel = "positif" | "neutre" | "negatif";
export type Langue = "fr" | "mg" | "mixte" | "inconnue";

export type SentimentResult = {
  label: SentimentLabel;
  /** −1 (très négatif) à +1 (très positif). */
  score: number;
  langue: Langue;
  /** Termes reconnus et leur poids (pour expliquer le résultat). */
  termes: { terme: string; poids: number }[];
};

/** Expressions : reconnues en priorité, avant les mots isolés. */
const EXPRESSIONS: [string, number][] = [
  // Français — positif
  ["rien à redire", 2],
  ["aucune coupure", 2],
  ["aucun problème", 2],
  ["aucun souci", 2],
  ["rapport qualité-prix", 0.5],
  ["marche bien", 2],
  ["marche très bien", 2.5],
  ["fonctionne bien", 2],
  ["je suis satisfait", 2],
  ["je suis satisfaite", 2],
  // Français — négatif
  ["pas de réseau", -2.5],
  ["aucune réponse", -2],
  ["ne partent pas", -2],
  ["ne marche pas", -2],
  ["ne fonctionne pas", -2],
  ["n'arrive pas", -2],
  ["n'arrivent pas", -2],
  ["jamais reçu", -2.5],
  ["se vide trop vite", -2],
  ["trop cher", -1.5],
  ["en retard", -1],
  ["frais sont élevés", -1],
  ["pas de liquidité", -1],
  ["sans plus", 0],
  ["ça marche", 1],
  ["ça dépend", 0],
  // Malagasy — positif
  ["tsy misy tapaka", 2],
  ["tsy misy olana", 2],
  ["mandeha tsara", 2],
  ["afaka miasa tsara", 2],
  ["azo antoka", 1.5],
  ["avy hatrany", 1.5],
  ["faly amin", 2],
  // Malagasy — négatif
  ["tsy misy tambajotra", -2.5],
  ["tsy misy valiny", -2],
  ["tsy mandeha", -2.5],
  ["tsy tonga", -2],
  ["tsy afa-po", -2.5],
  ["tapaka foana", -2.5],
  ["very ny vola", -2.5],
  // Malagasy — nuancé (« pas si mauvais, mais pas si bien non plus »)
  ["tsy dia ratsy", 0.3],
  ["tsy dia tsara", -0.3],
];

/** Mots isolés et leur poids. */
const MOTS: Record<string, number> = {
  // Français
  bon: 1, bonne: 1, bien: 1, excellent: 2, excellente: 2, parfait: 2, rapide: 1.5, rapides: 1.5,
  clair: 1.2, clairs: 1.2, claire: 1.2, satisfait: 1.8, satisfaite: 1.8, content: 1.5, contente: 1.5,
  instantanément: 1.5, faciles: 1.2, facile: 1.2, disponibles: 1, disponible: 1, réactif: 1.5,
  fiable: 1.5, stable: 1.2, merci: 1, super: 1.8, top: 1.5, correct: 0.4, correcte: 0.4,
  coupure: -1, coupures: -1.2, lent: -1.5, lente: -1.5, inacceptable: -2.5, impossible: -1.8,
  bloquée: -2, bloqué: -2, injoignable: -2, cher: -1, chers: -1, chère: -1, élevés: -0.8,
  baisse: -0.6, problème: -1, problèmes: -1, nul: -2, nulle: -2, mauvais: -1.5, mauvaise: -1.5,
  débité: -0.8, arnaque: -2.5, catastrophique: -2.5, horrible: -2.5, déçu: -2, déçue: -2,
  plainte: -1, réclamation: -0.8, panne: -1.5, retard: -1,
  // Malagasy
  tsara: 1.3, faly: 1.8, haingana: 1.5, mazava: 1.2, mora: 1, tonga: 0.5, mandeha: 0.8,
  ratsy: -1.8, miadana: -1.5, tapaka: -1.3, lafo: -1.2, sosotra: -2, very: -1.5, tara: -1,
  olana: -1, mahasosotra: -2,
};

/** Négations : inversent le mot suivant (dans une fenêtre de 2 mots). */
const NEGATIONS = new Set(["pas", "jamais", "plus", "sans", "aucun", "aucune", "tsy", "tsia"]);
/** Intensifs : renforcent le mot voisin. */
const INTENSIFS: Record<string, number> = { très: 1.5, trop: 1.4, vraiment: 1.4, beaucoup: 1.3, be: 1.5, loatra: 1.5, mihitsy: 1.5, foana: 1.3, tena: 1.4 };
/** Marqueurs de nuance : ramènent le score vers le neutre. */
const NUANCES = ["parfois", "moyen", "moyenne", "quelques", "un peu", "le soir", "correct", "antonony", "indraindray", "somary", "ça dépend", "sans plus", "tsy dia"];
/** Conjonctions d'opposition : la suite de la phrase pèse davantage. */
const OPPOSITIONS = new Set(["mais", "fa", "cependant", "pourtant"]);

const MOTS_MG = new Set(["ny", "aho", "tsy", "ary", "amin", "eto", "foana", "tsara", "misy", "fa", "koa", "ihany", "be", "loatra", "mihitsy", "nalefako", "volako", "aminay", "rehefa", "tambajotra", "antso", "tolotra", "kalitao", "dia", "fandefasana", "vola"]);
const MOTS_FR = new Set(["le", "la", "les", "de", "des", "du", "est", "je", "très", "pas", "mais", "mon", "mes", "ma", "ce", "ça", "sont", "pour", "avec", "dans", "un", "une", "il", "et", "à"]);

const normaliser = (t: string) =>
  t
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** Découpe en mots (les apostrophes et traits d'union restent dans le mot). */
const tokens = (t: string) => t.match(/[\p{L}\p{N}'-]+/gu) ?? [];

export function detectLangue(texte: string): Langue {
  const mots = tokens(normaliser(texte));
  let mg = 0;
  let fr = 0;
  for (const m of mots) {
    if (MOTS_MG.has(m)) mg++;
    if (MOTS_FR.has(m)) fr++;
  }
  if (mg === 0 && fr === 0) return "inconnue";
  if (mg > 0 && fr > 0 && Math.min(mg, fr) / Math.max(mg, fr) > 0.5) return "mixte";
  return mg > fr ? "mg" : "fr";
}

export function analyserSentiment(texte: string): SentimentResult {
  let t = ` ${normaliser(texte)} `;
  const termes: { terme: string; poids: number }[] = [];
  let total = 0;

  // Poids plus fort après une opposition (« correct MAIS des coupures »).
  const oppositionIdx = (() => {
    const mots = tokens(t);
    const i = mots.findIndex((m) => OPPOSITIONS.has(m));
    return i < 0 ? -1 : t.indexOf(` ${mots[i]} `);
  })();
  const facteurPosition = (pos: number) => (oppositionIdx >= 0 && pos > oppositionIdx ? 1.5 : 1);

  // 1. Expressions (les plus longues d'abord), retirées du texte une fois comptées.
  for (const [expr, poids] of [...EXPRESSIONS].sort((a, b) => b[0].length - a[0].length)) {
    let idx = t.indexOf(expr);
    while (idx >= 0) {
      const avant = t.slice(Math.max(0, idx - 12), idx);
      const intensif = /\b(très|trop|be|vraiment)\s$/.test(avant) ? 1.3 : 1;
      const w = poids * intensif * facteurPosition(idx);
      total += w;
      termes.push({ terme: expr, poids: round(w) });
      t = t.slice(0, idx) + " ".repeat(expr.length) + t.slice(idx + expr.length);
      idx = t.indexOf(expr);
    }
  }

  // 2. Mots isolés, avec négation et intensifs.
  const mots = tokens(t);
  let curseur = 0;
  for (let i = 0; i < mots.length; i++) {
    const m = mots[i];
    curseur = t.indexOf(m, curseur);
    const base = MOTS[m];
    if (base === undefined) continue;
    let w = base;
    const precedents = mots.slice(Math.max(0, i - 2), i);
    if (precedents.some((p) => NEGATIONS.has(p))) w = -w * 0.8;
    const intens = [mots[i - 1], mots[i + 1]].map((x) => (x ? INTENSIFS[x] ?? 1 : 1));
    w *= Math.max(...intens);
    w *= facteurPosition(curseur);
    total += w;
    termes.push({ terme: m, poids: round(w) });
  }

  // 3. Nuances : on tire vers le neutre.
  const brut = ` ${normaliser(texte)} `;
  const nbNuances = NUANCES.filter((n) => brut.includes(` ${n} `) || brut.includes(` ${n}`)).length;
  if (nbNuances > 0) total *= Math.pow(0.35, Math.min(nbNuances, 2));

  const score = round(Math.tanh(total / 2.5));
  const label: SentimentLabel = score > 0.3 ? "positif" : score < -0.3 ? "negatif" : "neutre";
  return { label, score, langue: detectLangue(texte), termes };
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
