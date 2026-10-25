/**
 * Validation d'un CSV d'indicateurs opérateur.
 *
 * Fonction pure (pas d'accès à la base) : elle reçoit le texte du fichier et
 * renvoie les lignes propres, les erreurs bloquantes et les avertissements.
 * Le contrôle des doublons déjà en base est fait ensuite par la route d'import.
 */
import Papa from "papaparse";
import {
  CSV_COLUMNS,
  MAX_CSV_ROWS,
  NUMERIC_RULES,
  REGIONS,
  SERVICES,
  type CsvColumn,
  type Region,
  type Service,
} from "@/lib/constants";

export type Issue = {
  ligne: number | null; // numéro de ligne dans le fichier (l'en-tête est la ligne 1)
  colonne: string | null;
  valeur: string | null;
  message: string;
};

export type CleanRow = {
  ligne: number;
  date: string; // YYYY-MM-01
  region: Region;
  service: Service;
  nb_abonnes: number;
  taux_coupure: number;
  debit_moyen_mbps: number | null;
  latence_ms: number | null;
  taux_disponibilite: number;
  nb_reclamations: number;
  tarif_moyen_ar: number;
};

export type ValidationResult = {
  rows: CleanRow[];
  erreurs: Issue[];
  avertissements: Issue[];
  totalLignes: number;
};

/** Au-delà de ce nombre, on arrête de lister les erreurs (le fichier est de toute façon rejeté). */
const MAX_ISSUES = 500;

type NumericColumn = keyof typeof NUMERIC_RULES;
const NUMERIC_COLUMNS = Object.keys(NUMERIC_RULES) as NumericColumn[];

/** Normalise un texte pour comparer sans tenir compte de la casse, des accents et des espaces. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/[\s_-]+/g, " ")
    .trim()
    .toLowerCase();
}

const REGION_LOOKUP = new Map<string, Region>(REGIONS.map((r) => [norm(r), r]));
const SERVICE_LOOKUP = new Map<string, Service>(SERVICES.map((s) => [norm(s), s]));

/**
 * Colonnes qui doivent rester vides selon le service :
 * le débit n'a de sens que pour la data, la latence n'a pas de sens pour les SMS.
 */
function isNotApplicable(col: NumericColumn, service: Service): boolean {
  if (col === "debit_moyen_mbps") return service !== "data";
  if (col === "latence_ms") return service === "sms";
  return false;
}

export function validateCsv(text: string, now: Date = new Date()): ValidationResult {
  const erreurs: Issue[] = [];
  const avertissements: Issue[] = [];
  const addError = (i: Issue) => {
    if (erreurs.length < MAX_ISSUES) erreurs.push(i);
  };

  // Retire l'éventuel BOM UTF-8 ajouté par Excel.
  const content = text.replace(/^﻿/, "");
  if (!content.trim()) {
    return { rows: [], erreurs: [{ ligne: null, colonne: null, valeur: null, message: "Le fichier est vide." }], avertissements, totalLignes: 0 };
  }

  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: "greedy",
    delimiter: ",",
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  // --- 1. En-tête : colonnes manquantes ou inconnues ---
  const headers = parsed.meta.fields ?? [];
  const missing = CSV_COLUMNS.filter((c) => !headers.includes(c));
  const unknown = headers.filter((h) => !(CSV_COLUMNS as readonly string[]).includes(h));
  const dupHeaders = headers.filter((h, i) => headers.indexOf(h) !== i);
  for (const c of missing) addError({ ligne: 1, colonne: c, valeur: null, message: `Colonne obligatoire manquante : « ${c} ».` });
  for (const c of unknown) addError({ ligne: 1, colonne: c, valeur: null, message: `Colonne inconnue : « ${c} ». Colonnes attendues : ${CSV_COLUMNS.join(", ")}.` });
  for (const c of new Set(dupHeaders)) addError({ ligne: 1, colonne: c, valeur: null, message: `Colonne en double : « ${c} ».` });
  if (erreurs.length > 0) {
    // Inutile de valider les lignes si la structure du fichier est fausse.
    return { rows: [], erreurs, avertissements, totalLignes: parsed.data.length };
  }

  if (parsed.data.length === 0) {
    addError({ ligne: null, colonne: null, valeur: null, message: "Le fichier ne contient aucune ligne de données." });
    return { rows: [], erreurs, avertissements, totalLignes: 0 };
  }
  if (parsed.data.length > MAX_CSV_ROWS) {
    addError({ ligne: null, colonne: null, valeur: null, message: `Trop de lignes (${parsed.data.length}). Maximum : ${MAX_CSV_ROWS}.` });
    return { rows: [], erreurs, avertissements, totalLignes: parsed.data.length };
  }

  // Lignes mal formées (nombre de champs incorrect, guillemets non fermés…).
  const badRows = new Set<number>();
  for (const e of parsed.errors) {
    if (e.row === undefined) continue;
    badRows.add(e.row);
    addError({ ligne: e.row + 2, colonne: null, valeur: null, message: `Ligne mal formée : ${e.message}.` });
  }

  // Mois maximum autorisé : le mois en cours.
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;

  // --- 2. Validation ligne par ligne ---
  const rows: CleanRow[] = [];
  const seenKeys = new Map<string, number>(); // clé → première ligne où elle apparaît

  parsed.data.forEach((raw, idx) => {
    if (badRows.has(idx)) return;
    const ligne = idx + 2; // +1 pour l'en-tête, +1 car les lignes commencent à 1
    let ok = true;
    const cell = (c: CsvColumn) => (raw[c] ?? "").trim();

    // date
    const dateStr = cell("date");
    let date: string | null = null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!m) {
      addError({ ligne, colonne: "date", valeur: dateStr, message: "Date invalide : format attendu AAAA-MM-JJ (ex. 2026-03-01)." });
      ok = false;
    } else {
      const [, y, mo, d] = m;
      const month = Number(mo);
      if (month < 1 || month > 12 || Number(y) < 2000) {
        addError({ ligne, colonne: "date", valeur: dateStr, message: "Date invalide." });
        ok = false;
      } else if (d !== "01") {
        addError({ ligne, colonne: "date", valeur: dateStr, message: "Les données sont mensuelles : la date doit être le 1er du mois (ex. 2026-03-01)." });
        ok = false;
      } else if (dateStr > currentMonth) {
        addError({ ligne, colonne: "date", valeur: dateStr, message: "Date dans le futur." });
        ok = false;
      } else {
        date = dateStr;
      }
    }

    // région
    const regionStr = cell("region");
    const region = REGION_LOOKUP.get(norm(regionStr));
    if (!region) {
      addError({ ligne, colonne: "region", valeur: regionStr, message: "Région inconnue (voir la liste des 23 régions dans le modèle)." });
      ok = false;
    }

    // service
    const serviceStr = cell("service");
    const service = SERVICE_LOOKUP.get(norm(serviceStr));
    if (!service) {
      addError({ ligne, colonne: "service", valeur: serviceStr, message: `Service inconnu. Valeurs acceptées : ${SERVICES.join(", ")}.` });
      ok = false;
    }

    // colonnes numériques
    const nums: Partial<Record<NumericColumn, number | null>> = {};
    for (const col of NUMERIC_COLUMNS) {
      const rule = NUMERIC_RULES[col];
      const v = cell(col);
      const notApplicable = service ? isNotApplicable(col, service) : false;

      if (v === "") {
        if (notApplicable) {
          nums[col] = null;
        } else {
          addError({ ligne, colonne: col, valeur: v, message: "Valeur obligatoire manquante." });
          ok = false;
        }
        continue;
      }
      if (notApplicable) {
        // Une valeur sans objet n'est pas bloquante : on l'ignore et on prévient.
        avertissements.push({ ligne, colonne: col, valeur: v, message: `Sans objet pour le service « ${service} » : valeur ignorée.` });
        nums[col] = null;
        continue;
      }
      if (v.includes(",")) {
        addError({ ligne, colonne: col, valeur: v, message: "Utilisez le point comme séparateur décimal (ex. 12.5)." });
        ok = false;
        continue;
      }
      const n = Number(v);
      if (!Number.isFinite(n)) {
        addError({ ligne, colonne: col, valeur: v, message: "Nombre attendu." });
        ok = false;
        continue;
      }
      if (rule.integer && !Number.isInteger(n)) {
        addError({ ligne, colonne: col, valeur: v, message: "Nombre entier attendu." });
        ok = false;
        continue;
      }
      const belowMin = rule.minExclusive ? n <= rule.min : n < rule.min;
      if (belowMin || n > rule.max) {
        const borne = rule.minExclusive ? `> ${rule.min}` : `≥ ${rule.min}`;
        addError({ ligne, colonne: col, valeur: v, message: `Valeur hors limites (attendu ${borne} et ≤ ${rule.max}).` });
        ok = false;
        continue;
      }
      nums[col] = n;
    }

    // doublon dans le fichier
    if (date && region && service) {
      const key = `${date}|${region}|${service}`;
      const first = seenKeys.get(key);
      if (first !== undefined) {
        addError({ ligne, colonne: null, valeur: `${date} / ${region} / ${service}`, message: `Doublon : même date, région et service qu'à la ligne ${first}.` });
        ok = false;
      } else {
        seenKeys.set(key, ligne);
      }
    }

    if (ok && date && region && service) {
      rows.push({
        ligne,
        date,
        region,
        service,
        nb_abonnes: nums.nb_abonnes!,
        taux_coupure: nums.taux_coupure!,
        debit_moyen_mbps: nums.debit_moyen_mbps ?? null,
        latence_ms: nums.latence_ms ?? null,
        taux_disponibilite: nums.taux_disponibilite!,
        nb_reclamations: nums.nb_reclamations!,
        tarif_moyen_ar: nums.tarif_moyen_ar!,
      });
    }
  });

  // --- 3. Valeurs aberrantes (avertissements non bloquants) ---
  avertissements.push(...detectOutliers(rows));

  return { rows, erreurs, avertissements, totalLignes: parsed.data.length };
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Détection des valeurs aberrantes, service par service. Une valeur est signalée si :
 *  1. elle est statistiquement isolée : score z modifié = 0,6745 × (x − médiane) / MAD > 3,5,
 *     calculé sur le logarithme (les grandeurs sont positives et asymétriques) ;
 *  2. ET l'écart est important en pratique : au moins 3 fois plus grande ou plus petite
 *     que la médiane (ex. un débit de 120 Mb/s quand la médiane est de 10).
 * La médiane et le MAD (écart absolu médian) résistent mieux aux valeurs extrêmes que
 * la moyenne et l'écart-type. La condition 2 évite de signaler de simples écarts
 * régionaux normaux (ex. un tarif de 131 Ar pour une médiane de 120).
 *
 * La disponibilité est testée sous forme d'indisponibilité (100 − x) : 95 % contre une
 * médiane de 99,5 % représente 10 fois plus d'indisponibilité.
 */
const OUTLIER_COLUMNS: NumericColumn[] = [
  "taux_coupure",
  "debit_moyen_mbps",
  "latence_ms",
  "taux_disponibilite",
  "tarif_moyen_ar",
];
const OUTLIER_Z = 3.5;
const OUTLIER_RATIO = 3;
const MIN_SAMPLE = 10;
const EPS = 0.01; // évite log(0) pour les taux nuls

export function detectOutliers(rows: CleanRow[]): Issue[] {
  const issues: Issue[] = [];
  for (const service of SERVICES) {
    const subset = rows.filter((r) => r.service === service);
    if (subset.length < MIN_SAMPLE) continue;

    for (const col of OUTLIER_COLUMNS) {
      const transform = (v: number) => (col === "taux_disponibilite" ? 100 - v : v) + EPS;
      const values = subset.map((r) => r[col]).filter((v): v is number => v != null).map(transform);
      if (values.length < MIN_SAMPLE) continue;

      const logs = values.map(Math.log);
      const medLog = median(logs);
      const mad = median(logs.map((v) => Math.abs(v - medLog)));
      if (mad === 0) continue;
      const med = Math.exp(medLog);

      for (const r of subset) {
        const raw = r[col];
        if (raw == null) continue;
        const x = transform(raw);
        const z = (0.6745 * (Math.log(x) - medLog)) / mad;
        const ratio = Math.max(x / med, med / x);
        if (Math.abs(z) > OUTLIER_Z && ratio >= OUTLIER_RATIO) {
          const medianShown = col === "taux_disponibilite" ? 100 - (med - EPS) : med - EPS;
          issues.push({
            ligne: r.ligne,
            colonne: col,
            valeur: String(raw),
            message: `Valeur inhabituelle pour le service « ${service} » (médiane : ${round(medianShown)}). À vérifier.`,
          });
        }
      }
    }
  }
  return issues.sort((a, b) => (a.ligne ?? 0) - (b.ligne ?? 0));
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Contenu du modèle CSV téléchargeable : en-tête + une ligne d'exemple par service. */
export function csvTemplate(): string {
  return [
    CSV_COLUMNS.join(","),
    "2026-01-01,Analamanga,voix,1800000,2.1,,60,99.5,210,120",
    "2026-01-01,Analamanga,data,1250000,1.8,12.4,45,99.2,320,2500",
    "2026-01-01,Analamanga,sms,1700000,0.4,,,99.7,35,50",
    "2026-01-01,Analamanga,mobile_money,950000,0.9,,120,99.1,410,300",
  ].join("\n") + "\n";
}
