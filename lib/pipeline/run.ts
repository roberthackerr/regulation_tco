import "server-only";
import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { NUMERIC_RULES, REGIONS, SERVICES, type Region, type Service } from "@/lib/constants";
import { analyserSentiment, type SentimentLabel } from "@/lib/sentiment";
import { DatasetRow } from "@/models/DatasetRow";
import { DatasetVersion } from "@/models/DatasetVersion";
import { Feedback } from "@/models/Feedback";
import { Import } from "@/models/Import";
import { Operator } from "@/models/Operator";
import { OperatorMetric } from "@/models/OperatorMetric";
import { PipelineRun } from "@/models/PipelineRun";
import { SocialMention } from "@/models/SocialMention";
import { CLASSES, FEATURE_KEYS, PIPELINE_STEPS, REGIONS_COTE_EST, classeDe, type StepKey } from "./definitions";

/**
 * Pipeline de traitement (phase 2).
 *
 *   extraction → nettoyage → sentiment → normalisation → features → fusion → versionnage
 *
 * Chaque étape écrit son état, ses chiffres clés et son journal dans `pipeline_runs`
 * dès qu'elle se termine : l'interface suit l'exécution en direct.
 * Un seul pipeline tourne à la fois ; s'il reste des imports validés non traités
 * à la fin, un nouveau passage est lancé automatiquement.
 */

/** Un passage bloqué plus longtemps que ça est considéré comme interrompu (serveur redémarré…). */
const STALE_AFTER_MS = 10 * 60 * 1000;
/** Nombre de versions dont on garde les lignes (les résumés sont toujours conservés). */
const KEEP_ROWS_FOR_VERSIONS = 5;

type Metric = {
  importId: string;
  operateur: string;
  date: string; // YYYY-MM-DD
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

type Avis = { id: string; key: string; note: number; score: number; label: SentimentLabel };

type Row = {
  operateur: string;
  date: string;
  region: string;
  service: string;
  features: Record<string, number | null>;
  nbAvis: number;
  satisfaction: number | null;
  classe: string | null;
};

const cellKey = (op: string, date: string, region: string, service: string) => `${op}|${date}|${region}|${service}`;
/** Mois d'une date (AAAA-MM-01) : un avis du 5 octobre se rattache à la ligne « octobre ». */
const monthKey = (d: Date) => `${d.toISOString().slice(0, 7)}-01`;
const r2 = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;
const fmt = (n: number) => n.toLocaleString("fr-FR");

/* ------------------------------------------------------------------ Lancement */

/**
 * Démarre un passage du pipeline s'il n'y en a pas déjà un en cours.
 * Renvoie l'identifiant du passage créé (ou de celui déjà en cours) ; l'exécution
 * elle-même est à lancer avec `executeRun` (en arrière-plan, via `after()`).
 */
export async function createRun(trigger: "auto" | "manuel", userId: string | null) {
  await connectDb();
  // Libère un passage resté bloqué (redémarrage du serveur pendant l'exécution).
  await PipelineRun.updateMany(
    { status: "en_cours", startedAt: { $lt: new Date(Date.now() - STALE_AFTER_MS) } },
    { status: "echec", error: "Interrompu (délai dépassé).", finishedAt: new Date() },
  );
  const running = await PipelineRun.findOne({ status: "en_cours" }).lean();
  if (running) return { runId: String(running._id), created: false };

  const run = await PipelineRun.create({
    trigger,
    triggeredBy: userId,
    steps: PIPELINE_STEPS.map((s) => ({ key: s.key, status: "attente" })),
  });
  return { runId: String(run._id), created: true };
}

/** Exécute un passage. Ne lève jamais : les erreurs sont enregistrées dans le passage. */
export async function executeRun(runId: string): Promise<void> {
  await connectDb();
  const started = Date.now();
  const ctx = new RunContext(runId);
  try {
    const result = await pipeline(ctx);
    await PipelineRun.updateOne(
      { _id: runId },
      {
        status: "termine",
        importIds: result.importIds,
        datasetVersionId: result.versionId,
        unchanged: result.unchanged,
        finishedAt: new Date(),
        durationMs: Date.now() - started,
      },
    );
  } catch (err) {
    console.error("[pipeline] échec :", err);
    await ctx.failCurrent(err);
    await PipelineRun.updateOne(
      { _id: runId },
      { status: "echec", error: err instanceof Error ? err.message : String(err), finishedAt: new Date(), durationMs: Date.now() - started },
    );
    return;
  }

  // Des imports ont été approuvés pendant l'exécution : on relance.
  const remaining = await Import.countDocuments({ status: "valide" });
  if (remaining > 0) {
    const next = await createRun("auto", null);
    if (next.created) void executeRun(next.runId);
  }
}

/** Raccourci : crée puis exécute (utilisé dans `after()`). */
export async function triggerPipeline(trigger: "auto" | "manuel", userId: string | null) {
  const { runId, created } = await createRun(trigger, userId);
  if (created) await executeRun(runId);
  return runId;
}

/* ------------------------------------------------------------------ Suivi des étapes */

class RunContext {
  private current: { key: StepKey; start: number; logs: string[] } | null = null;
  constructor(readonly runId: string) {}

  async step<T>(key: StepKey, fn: (log: (msg: string) => void) => Promise<{ value: T; stats: Record<string, unknown> }>): Promise<T> {
    const idx = PIPELINE_STEPS.findIndex((s) => s.key === key);
    const logs: string[] = [];
    this.current = { key, start: Date.now(), logs };
    await PipelineRun.updateOne({ _id: this.runId }, { $set: { [`steps.${idx}.status`]: "en_cours", [`steps.${idx}.startedAt`]: new Date() } });
    const log = (msg: string) => logs.push(`${new Date().toISOString().slice(11, 23)}  ${msg}`);
    const { value, stats } = await fn(log);
    const durationMs = Date.now() - this.current.start;
    await PipelineRun.updateOne(
      { _id: this.runId },
      {
        $set: {
          [`steps.${idx}.status`]: "termine",
          [`steps.${idx}.finishedAt`]: new Date(),
          [`steps.${idx}.durationMs`]: durationMs,
          [`steps.${idx}.stats`]: stats,
          [`steps.${idx}.logs`]: logs,
        },
      },
    );
    this.current = null;
    return value;
  }

  async failCurrent(err: unknown) {
    if (!this.current) return;
    const idx = PIPELINE_STEPS.findIndex((s) => s.key === this.current!.key);
    this.current.logs.push(`ERREUR  ${err instanceof Error ? err.message : String(err)}`);
    const later = PIPELINE_STEPS.slice(idx + 1).map((_, i) => idx + 1 + i);
    await PipelineRun.updateOne(
      { _id: this.runId },
      {
        $set: {
          [`steps.${idx}.status`]: "echec",
          [`steps.${idx}.finishedAt`]: new Date(),
          [`steps.${idx}.durationMs`]: Date.now() - this.current.start,
          [`steps.${idx}.logs`]: this.current.logs,
          ...Object.fromEntries(later.map((i) => [`steps.${i}.status`, "ignore"])),
        },
      },
    );
  }
}

/* ------------------------------------------------------------------ Le pipeline */

async function pipeline(ctx: RunContext) {
  /* 1. Extraction ------------------------------------------------------- */
  const extracted = await ctx.step("extraction", async (log) => {
    const operators = await Operator.find({}, { code: 1 }).lean();
    const codeOf = new Map(operators.map((o) => [String(o._id), o.code]));

    const imports = await Import.find({ status: { $in: ["valide", "traite"] } }, { status: 1 }).lean();
    const nouveaux = imports.filter((i) => i.status === "valide").map((i) => i._id);
    log(`${imports.length} imports approuvés, dont ${nouveaux.length} nouveaux à traiter`);

    const raw = await OperatorMetric.find({ importId: { $in: imports.map((i) => i._id) } }).lean();
    log(`${fmt(raw.length)} lignes d'indicateurs lues dans operator_metrics`);
    const metrics: Metric[] = raw.map((m) => ({
      importId: String(m.importId),
      operateur: codeOf.get(String(m.operatorId)) ?? "?",
      date: m.date.toISOString().slice(0, 10),
      region: m.region as Region,
      service: m.service as Service,
      nb_abonnes: m.nb_abonnes,
      taux_coupure: m.taux_coupure,
      debit_moyen_mbps: m.debit_moyen_mbps ?? null,
      latence_ms: m.latence_ms ?? null,
      taux_disponibilite: m.taux_disponibilite,
      nb_reclamations: m.nb_reclamations,
      tarif_moyen_ar: m.tarif_moyen_ar,
    }));

    const feedbacks = await Feedback.find({ status: "publie" }, { operatorId: 1, date: 1, region: 1, service: 1, note: 1, commentaire: 1, sentiment: 1 }).lean();
    log(`${fmt(feedbacks.length)} avis publiés lus dans feedbacks`);
    if (feedbacks.length === 0) log("ATTENTION  aucun avis : la cible de satisfaction ne pourra pas être calculée");

    const ops = new Set(metrics.map((m) => m.operateur));
    const mois = new Set(metrics.map((m) => m.date));
    log(`Périmètre : ${ops.size} opérateur(s), ${mois.size} mois`);
    return {
      value: { metrics, feedbacks, codeOf, importIds: nouveaux },
      stats: { lignes: metrics.length, avis: feedbacks.length, imports: imports.length, nouveaux: nouveaux.length, operateurs: ops.size, mois: mois.size },
    };
  });

  if (extracted.metrics.length === 0) throw new Error("Aucun indicateur validé : approuvez au moins un import avant de lancer le pipeline.");

  /* 2. Nettoyage -------------------------------------------------------- */
  const cleaned = await ctx.step("nettoyage", async (log) => {
    let horsBornes = 0;
    let doublons = 0;
    let sansObjet = 0;
    const seen = new Set<string>();
    const kept: Metric[] = [];

    for (const m of extracted.metrics) {
      const key = cellKey(m.operateur, m.date, m.region, m.service);
      if (seen.has(key)) {
        doublons++;
        continue;
      }
      // Contrôle défensif des bornes (déjà vérifiées à l'import, mais les données peuvent venir d'ailleurs).
      const invalid = (Object.keys(NUMERIC_RULES) as (keyof typeof NUMERIC_RULES)[]).some((col) => {
        const v = m[col];
        if (v == null) return false;
        const rule = NUMERIC_RULES[col];
        return !Number.isFinite(v) || v < rule.min || v > rule.max || (rule.minExclusive && v <= rule.min);
      });
      if (invalid) {
        horsBornes++;
        continue;
      }
      // Valeurs sans objet pour le service : forcées à vide.
      if (m.service !== "data" && m.debit_moyen_mbps != null) {
        m.debit_moyen_mbps = null;
        sansObjet++;
      }
      if (m.service === "sms" && m.latence_ms != null) {
        m.latence_ms = null;
        sansObjet++;
      }
      seen.add(key);
      kept.push(m);
    }

    // Imputation des valeurs manquantes par la médiane opérateur × service × mois.
    let imputees = 0;
    const groups = new Map<string, Metric[]>();
    for (const m of kept) {
      const g = `${m.operateur}|${m.service}|${m.date}`;
      groups.set(g, [...(groups.get(g) ?? []), m]);
    }
    for (const list of groups.values()) {
      for (const col of ["debit_moyen_mbps", "latence_ms"] as const) {
        const applies = (m: Metric) => (col === "debit_moyen_mbps" ? m.service === "data" : m.service !== "sms");
        const vals = list.filter((m) => applies(m) && m[col] != null).map((m) => m[col]!);
        const med = median(vals);
        for (const m of list) {
          if (applies(m) && m[col] == null && med != null) {
            m[col] = med;
            imputees++;
          }
        }
      }
    }

    // Avis : notes hors 1–5 ou opérateur inconnu écartés.
    const avisValides = extracted.feedbacks.filter((f) => f.note >= 1 && f.note <= 5 && extracted.codeOf.has(String(f.operatorId)));
    const avisEcartes = extracted.feedbacks.length - avisValides.length;

    log(`${fmt(kept.length)} lignes conservées sur ${fmt(extracted.metrics.length)}`);
    log(`${doublons} doublon(s) supprimé(s), ${horsBornes} ligne(s) hors bornes écartée(s)`);
    log(`${sansObjet} valeur(s) sans objet vidée(s) (débit hors data, latence SMS)`);
    log(`${imputees} valeur(s) manquante(s) imputée(s) par la médiane opérateur × service × mois`);
    log(`${fmt(avisValides.length)} avis valides, ${avisEcartes} écarté(s)`);
    return {
      value: { metrics: kept, feedbacks: avisValides },
      stats: { conservees: kept.length, doublons, horsBornes, sansObjet, imputees, avisValides: avisValides.length, avisEcartes },
    };
  });

  /* 3. Sentiment -------------------------------------------------------- */
  const avis = await ctx.step("sentiment", async (log) => {
    const updates: { updateOne: { filter: { _id: unknown }; update: Record<string, unknown> } }[] = [];
    const out: Avis[] = [];
    const langues: Record<string, number> = {};
    const dist: Record<SentimentLabel, number> = { positif: 0, neutre: 0, negatif: 0 };
    // Plus d'étiquette de référence (données synthétiques supprimées) : la justesse n'est plus mesurée.
    const justes = 0;
    const compares = 0;

    for (const f of cleaned.feedbacks) {
      let label = f.sentiment?.label as SentimentLabel | undefined;
      let score = f.sentiment?.score;
      if (!label || score == null) {
        const res = analyserSentiment(f.commentaire ?? "");
        label = res.label;
        score = res.score;
        langues[res.langue] = (langues[res.langue] ?? 0) + 1;
        updates.push({ updateOne: { filter: { _id: f._id }, update: { $set: { sentiment: { label, score, source: "lexique" }, langue: res.langue } } } });
      }
      dist[label]++;
      const code = extracted.codeOf.get(String(f.operatorId))!;
      out.push({ id: String(f._id), key: cellKey(code, monthKey(f.date), f.region, f.service), note: f.note, score, label });
    }

    for (let i = 0; i < updates.length; i += 1000) await Feedback.bulkWrite(updates.slice(i, i + 1000) as never, { ordered: false });

    // Publications réelles de la veille, quand on sait les situer : région citée + service déduit du thème.
    const THEME_SERVICE: Record<string, Service> = { internet: "data", mobile_money: "mobile_money", reseau: "voix" };
    const codeById = extracted.codeOf;
    const mentions = await SocialMention.find(
      { region: { $ne: null }, theme: { $in: ["internet", "mobile_money", "reseau"] as ("internet" | "mobile_money" | "reseau")[] } },
      { operatorId: 1, region: 1, theme: 1, publishedAt: 1, note: 1, sentiment: 1 },
    ).lean();
    let depuisVeille = 0;
    for (const m of mentions) {
      const code = codeById.get(String(m.operatorId));
      if (!code || !m.region) continue;
      const score = m.sentiment.score;
      const note = m.note ?? Math.min(5, Math.max(1, Math.round(3 + 2 * score)));
      out.push({ id: `veille:${m._id}`, key: cellKey(code, monthKey(m.publishedAt), m.region, THEME_SERVICE[m.theme as string]), note, score, label: m.sentiment.label as SentimentLabel });
      dist[m.sentiment.label as SentimentLabel]++;
      depuisVeille++;
    }
    log(`${fmt(depuisVeille)} publication(s) réelle(s) de la veille situées (région + service) ajoutées aux avis`);

    const justesse = compares ? justes / compares : null;
    log(`${fmt(updates.length)} commentaire(s) analysé(s) (lexique FR/MG), ${fmt(out.length - updates.length)} déjà connu(s)`);
    if (updates.length) log(`Langues détectées : ${Object.entries(langues).map(([k, v]) => `${k} ${fmt(v)}`).join(", ")}`);
    log(`Répartition : ${dist.positif} positifs, ${dist.neutre} neutres, ${dist.negatif} négatifs`);
    if (justesse != null) log(`Justesse vs étiquette de référence : ${(justesse * 100).toFixed(1)} % (${fmt(compares)} avis)`);
    return {
      value: { avis: out, sentiment: { distribution: dist, langues, justesse, compares, analyses: updates.length } },
      stats: { analyses: updates.length, ...dist, justesse: justesse == null ? null : r2(justesse * 100, 1) },
    };
  });

  /* 4. Normalisation ---------------------------------------------------- */
  const normalized = await ctx.step("normalisation", async (log) => {
    // Noms de régions : casse, accents et apostrophes harmonisés vers la liste officielle.
    const canon = new Map(REGIONS.map((r) => [simplify(r), r]));
    let regionsCorrigees = 0;
    for (const m of cleaned.metrics) {
      const c = canon.get(simplify(m.region));
      if (c && c !== m.region) {
        m.region = c;
        regionsCorrigees++;
      }
    }

    // Valeurs extrêmes plafonnées aux percentiles 1 et 99, service par service.
    let plafonnees = 0;
    const cols = ["taux_coupure", "debit_moyen_mbps", "latence_ms", "nb_reclamations", "tarif_moyen_ar"] as const;
    for (const service of SERVICES) {
      const list = cleaned.metrics.filter((m) => m.service === service);
      for (const col of cols) {
        const vals = list.map((m) => m[col]).filter((v): v is number => v != null).sort((a, b) => a - b);
        if (vals.length < 50) continue;
        const lo = quantile(vals, 0.01);
        const hi = quantile(vals, 0.99);
        for (const m of list) {
          const v = m[col];
          if (v == null) continue;
          if (v < lo || v > hi) {
            (m[col] as number) = v < lo ? lo : hi;
            plafonnees++;
          }
        }
      }
    }
    log(`${regionsCorrigees} nom(s) de région harmonisé(s)`);
    log(`${plafonnees} valeur(s) extrême(s) plafonnée(s) aux percentiles 1 / 99 (par service)`);
    log("Unités : % sur 0–100, débits en Mb/s, latences en ms, tarifs en Ariary");
    return { value: cleaned.metrics, stats: { regionsCorrigees, plafonnees } };
  });

  /* 5. Features --------------------------------------------------------- */
  const featured = await ctx.step("features", async (log) => {
    const byCell = new Map(normalized.map((m) => [cellKey(m.operateur, m.date, m.region, m.service), m]));

    // Marché : totaux par mois × région × service (tous opérateurs).
    const market = new Map<string, { abonnes: number; tarifs: number[] }>();
    for (const m of normalized) {
      const k = `${m.date}|${m.region}|${m.service}`;
      const e = market.get(k) ?? { abonnes: 0, tarifs: [] };
      e.abonnes += m.nb_abonnes;
      e.tarifs.push(m.tarif_moyen_ar);
      market.set(k, e);
    }

    // Indice qualité : rangs en percentiles à service et mois égaux.
    const indice = new Map<Metric, number>();
    const peers = new Map<string, Metric[]>();
    for (const m of normalized) {
      const k = `${m.service}|${m.date}`;
      peers.set(k, [...(peers.get(k) ?? []), m]);
    }
    for (const list of peers.values()) {
      const comps: { get: (m: Metric) => number | null; lowerIsBetter: boolean }[] = [
        { get: (m) => m.taux_coupure, lowerIsBetter: true },
        { get: (m) => m.taux_disponibilite, lowerIsBetter: false },
        { get: (m) => m.latence_ms, lowerIsBetter: true },
        { get: (m) => (m.nb_reclamations / Math.max(m.nb_abonnes, 1)) * 1000, lowerIsBetter: true },
      ];
      const ranks = comps.map((c) => percentileRanks(list.map(c.get), c.lowerIsBetter));
      list.forEach((m, i) => {
        const vals = ranks.map((r) => r[i]).filter((v): v is number => v != null);
        indice.set(m, r2((vals.reduce((s, v) => s + v, 0) / vals.length) * 100, 2));
      });
    }

    const prevMonth = (d: string, n = 1) => {
      const x = new Date(`${d}T00:00:00Z`);
      return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() - n, 1)).toISOString().slice(0, 10);
    };
    const recl = (m: Metric) => (m.nb_reclamations / Math.max(m.nb_abonnes, 1)) * 1000;

    const rows: Row[] = normalized.map((m) => {
      const mk = market.get(`${m.date}|${m.region}|${m.service}`)!;
      const tarifMoyen = mk.tarifs.reduce((s, v) => s + v, 0) / mk.tarifs.length;
      const p1 = byCell.get(cellKey(m.operateur, prevMonth(m.date), m.region, m.service));
      const p2 = byCell.get(cellKey(m.operateur, prevMonth(m.date, 2), m.region, m.service));
      const window = [m, p1, p2].filter((x): x is Metric => !!x);
      const month = Number(m.date.slice(5, 7));
      return {
        operateur: m.operateur,
        date: m.date,
        region: m.region,
        service: m.service,
        features: {
          taux_coupure: m.taux_coupure,
          taux_disponibilite: m.taux_disponibilite,
          debit_moyen_mbps: m.debit_moyen_mbps,
          latence_ms: m.latence_ms,
          indice_qualite: indice.get(m) ?? null,
          log_abonnes: r2(Math.log1p(m.nb_abonnes)),
          reclamations_pour_1000: r2(recl(m)),
          part_de_marche: mk.abonnes ? r2((m.nb_abonnes / mk.abonnes) * 100, 2) : null,
          ecart_tarif_marche: mk.tarifs.length > 1 ? r2(((m.tarif_moyen_ar - tarifMoyen) / tarifMoyen) * 100, 2) : 0,
          coupure_var_1m: p1 ? r2(m.taux_coupure - p1.taux_coupure) : null,
          coupure_moy_3m: r2(window.reduce((s, x) => s + x.taux_coupure, 0) / window.length),
          dispo_moy_3m: r2(window.reduce((s, x) => s + x.taux_disponibilite, 0) / window.length),
          reclamations_var_1m: p1 ? r2(recl(m) - recl(p1)) : null,
          satisfaction_m1: null, // renseigné à l'étape de fusion
          saison_cyclonique: month <= 3 && REGIONS_COTE_EST.includes(m.region) ? 1 : 0,
          mois_sin: r2(Math.sin((2 * Math.PI * (month - 1)) / 12)),
          mois_cos: r2(Math.cos((2 * Math.PI * (month - 1)) / 12)),
        },
        nbAvis: 0,
        satisfaction: null,
        classe: null,
      };
    });

    const sansHistorique = rows.filter((r) => r.features.coupure_var_1m == null).length;
    log(`${FEATURE_KEYS.length} features calculées pour ${fmt(rows.length)} lignes`);
    log("Dérivées : réclamations ‰, log(abonnés), part de marché, écart au tarif du marché");
    log("Tendances : variations sur 1 mois, moyennes glissantes sur 3 mois");
    log("Contexte : saison cyclonique (côte est, janv.–mars), encodage cyclique du mois");
    log(`${fmt(sansHistorique)} ligne(s) sans mois précédent (variations laissées vides)`);
    return { value: rows, stats: { features: FEATURE_KEYS.length, lignes: rows.length, sansHistorique } };
  });

  /* 6. Fusion & cible --------------------------------------------------- */
  const fused = await ctx.step("fusion", async (log) => {
    const byKey = new Map<string, Avis[]>();
    for (const a of avis.avis) byKey.set(a.key, [...(byKey.get(a.key) ?? []), a]);
    const rowKeys = new Set(featured.map((r) => cellKey(r.operateur, r.date, r.region, r.service)));
    const orphelins = avis.avis.filter((a) => !rowKeys.has(a.key)).length;

    // Satisfaction = 75 % note moyenne (ramenée sur 100) + 25 % sentiment moyen (ramené sur 100).
    const satByKey = new Map<string, number>();
    for (const r of featured) {
      const list = byKey.get(cellKey(r.operateur, r.date, r.region, r.service)) ?? [];
      r.nbAvis = list.length;
      if (!list.length) continue;
      const note = list.reduce((s, a) => s + a.note, 0) / list.length;
      const sent = list.reduce((s, a) => s + a.score, 0) / list.length;
      const score = r2(0.75 * ((note - 1) / 4) * 100 + 0.25 * ((sent + 1) / 2) * 100, 2);
      r.satisfaction = score;
      r.classe = classeDe(score);
      satByKey.set(cellKey(r.operateur, r.date, r.region, r.service), score);
    }
    // Satisfaction du mois précédent : feature légitime (passé connu), contrairement aux avis du mois.
    for (const r of featured) {
      const d = new Date(`${r.date}T00:00:00Z`);
      const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
      r.features.satisfaction_m1 = satByKey.get(cellKey(r.operateur, prev, r.region, r.service)) ?? null;
    }

    const etiquetees = featured.filter((r) => r.satisfaction != null).length;
    const classes = Object.fromEntries(CLASSES.map((c) => [c.key, featured.filter((r) => r.classe === c.key).length]));
    log(`${fmt(avis.avis.length - orphelins)} avis rattachés à une ligne d'indicateurs, ${orphelins} sans correspondance`);
    log(`Cible : satisfaction = 75 % note moyenne + 25 % sentiment moyen (0–100)`);
    log(`${fmt(etiquetees)} ligne(s) étiquetée(s) sur ${fmt(featured.length)} (${((etiquetees / featured.length) * 100).toFixed(1)} %)`);
    log(`Classes : ${classes.satisfait} satisfait, ${classes.neutre} neutre, ${classes.insatisfait} insatisfait (seuils 65 / 45)`);
    log("Anti-fuite : les avis du mois ne servent qu'à la cible, jamais comme feature");
    return { value: { rows: featured, etiquetees, classes }, stats: { etiquetees, orphelins, ...classes } };
  });

  /* 7. Versionnage ------------------------------------------------------ */
  return ctx.step("versionnage", async (log) => {
    const rows = [...fused.rows].sort((a, b) => cellKey(a.operateur, a.date, a.region, a.service).localeCompare(cellKey(b.operateur, b.date, b.region, b.service)));
    const checksum = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
    log(`Empreinte SHA-256 : ${checksum.slice(0, 16)}…`);

    const last = await DatasetVersion.findOne().sort({ version: -1 }).lean();
    if (last && last.checksum === checksum) {
      log(`Données identiques à la version v${last.version} : aucune nouvelle version créée`);
      await markProcessed(extracted.importIds, log);
      return { value: { versionId: last._id, unchanged: true, importIds: extracted.importIds }, stats: { version: last.version, unchanged: true } };
    }

    const version = (last?.version ?? 0) + 1;
    const stats = featureStats(rows);
    const correlations = correlationMatrix(rows);
    const dates = rows.map((r) => r.date).sort();

    // Qualité : complétude des valeurs applicables, part étiquetée, part de valeurs retouchées.
    const applicable = rows.reduce((s, r) => s + FEATURE_KEYS.filter((k) => !notApplicable(k, r.service)).length, 0);
    const presentes = rows.reduce((s, r) => s + FEATURE_KEYS.filter((k) => !notApplicable(k, r.service) && r.features[k] != null).length, 0);
    const completude = applicable ? presentes / applicable : 1;
    const etiquetage = rows.length ? fused.etiquetees / rows.length : 0;
    const retouchees = ((await currentStepStats(ctx)) ?? 0) / Math.max(rows.length * 6, 1);
    const score = Math.round(100 * (0.45 * completude + 0.35 * Math.min(etiquetage / 0.6, 1) + 0.2 * (1 - Math.min(retouchees * 10, 1))));

    const dv = await DatasetVersion.create({
      version,
      runId: ctx.runId,
      importIds: (await Import.find({ status: { $in: ["valide", "traite"] } }, { _id: 1 }).lean()).map((i) => i._id),
      nbLignes: rows.length,
      nbEtiquetees: fused.etiquetees,
      nbAvis: avis.avis.length,
      features: FEATURE_KEYS,
      checksum,
      periodStart: dates.length ? new Date(`${dates[0]}T00:00:00Z`) : null,
      periodEnd: dates.length ? new Date(`${dates[dates.length - 1]}T00:00:00Z`) : null,
      couverture: {
        operateurs: [...new Set(rows.map((r) => r.operateur))].sort(),
        mois: new Set(rows.map((r) => r.date)).size,
        regions: new Set(rows.map((r) => r.region)).size,
        services: new Set(rows.map((r) => r.service)).size,
      },
      qualite: { score, completude: r2(completude * 100, 1), etiquetage: r2(etiquetage * 100, 1), retouchees: r2(retouchees * 100, 2) },
      stats,
      correlations,
      classes: fused.classes,
      scaler: Object.fromEntries(Object.entries(stats).map(([k, s]) => [k, { moyenne: s.moyenne, ecartType: s.ecartType }])),
      sentiment: avis.sentiment,
    });

    for (let i = 0; i < rows.length; i += 2000) {
      await DatasetRow.insertMany(
        rows.slice(i, i + 2000).map((r) => ({ ...r, versionId: dv._id, date: new Date(`${r.date}T00:00:00Z`) })),
        { ordered: false },
      );
    }
    log(`Version v${version} enregistrée : ${fmt(rows.length)} lignes, ${FEATURE_KEYS.length} features, cible « satisfaction »`);
    log(`Score qualité : ${score}/100 (complétude ${(completude * 100).toFixed(1)} %, étiquetage ${(etiquetage * 100).toFixed(1)} %)`);

    // Purge des lignes des vieilles versions (le résumé de chaque version est conservé).
    const old = await DatasetVersion.find({ version: { $lte: version - KEEP_ROWS_FOR_VERSIONS } }, { _id: 1 }).lean();
    if (old.length) {
      const del = await DatasetRow.deleteMany({ versionId: { $in: old.map((o) => o._id) } });
      if (del.deletedCount) log(`${fmt(del.deletedCount)} ligne(s) d'anciennes versions purgée(s) (on garde les ${KEEP_ROWS_FOR_VERSIONS} dernières)`);
    }

    await markProcessed(extracted.importIds, log);
    log("Prêt pour l'entraînement Kaggle (phase 3)");
    return { value: { versionId: dv._id, unchanged: false, importIds: extracted.importIds }, stats: { version, score, lignes: rows.length } };
  });
}

/* ------------------------------------------------------------------ Outils */

async function markProcessed(ids: Types.ObjectId[], log: (m: string) => void) {
  if (!ids.length) return;
  const res = await Import.updateMany({ _id: { $in: ids }, status: "valide" }, { status: "traite" });
  log(`${res.modifiedCount} import(s) passé(s) au statut « Traité »`);
}

/** Nombre de valeurs retouchées (imputées + plafonnées), relu depuis les étapes déjà terminées. */
async function currentStepStats(ctx: RunContext): Promise<number | null> {
  const run = await PipelineRun.findById(ctx.runId, { steps: 1 }).lean();
  if (!run) return null;
  const get = (key: string, field: string) => Number((run.steps.find((s) => s.key === key)?.stats as Record<string, unknown> | undefined)?.[field] ?? 0);
  return get("nettoyage", "imputees") + get("normalisation", "plafonnees");
}

function notApplicable(key: string, service: string) {
  return (key === "debit_moyen_mbps" && service !== "data") || (key === "latence_ms" && service === "sms");
}

function simplify(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’'`\s-]/g, "").toLowerCase();
}

function median(vals: number[]): number | null {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function quantile(sorted: number[], q: number) {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Rang de chaque valeur en percentile (0 = pire, 1 = meilleur). */
function percentileRanks(vals: (number | null)[], lowerIsBetter: boolean): (number | null)[] {
  const present = vals.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v != null);
  present.sort((a, b) => (lowerIsBetter ? b.v - a.v : a.v - b.v));
  const out: (number | null)[] = vals.map(() => null);
  present.forEach((x, rank) => (out[x.i] = present.length > 1 ? rank / (present.length - 1) : 0.5));
  return out;
}

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

function featureStats(rows: Row[]): Record<string, FeatureStat> {
  const keys = [...FEATURE_KEYS, "satisfaction"];
  const out: Record<string, FeatureStat> = {};
  for (const k of keys) {
    const vals = rows.map((r) => (k === "satisfaction" ? r.satisfaction : r.features[k])).filter((v): v is number => v != null && Number.isFinite(v));
    const n = vals.length;
    if (!n) {
      out[k] = { n: 0, manquants: rows.length, min: 0, max: 0, moyenne: 0, ecartType: 0, mediane: 0, histogramme: [] };
      continue;
    }
    const sorted = [...vals].sort((a, b) => a - b);
    const mean = vals.reduce((s, v) => s + v, 0) / n;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
    const min = sorted[0];
    const max = sorted[n - 1];
    const bins = 16;
    const hist = new Array(bins).fill(0);
    for (const v of vals) hist[max === min ? 0 : Math.min(bins - 1, Math.floor(((v - min) / (max - min)) * bins))]++;
    const applicable = rows.filter((r) => !notApplicable(k, r.service)).length;
    out[k] = { n, manquants: applicable - n, min: r2(min), max: r2(max), moyenne: r2(mean), ecartType: r2(sd), mediane: r2(median(vals)!), histogramme: hist };
  }
  return out;
}

/** Corrélations de Pearson deux à deux (sur les lignes où les deux valeurs existent). */
function correlationMatrix(rows: Row[]) {
  const keys = [...FEATURE_KEYS.filter((k) => !["mois_sin", "mois_cos"].includes(k)), "satisfaction"];
  const col = (k: string) => rows.map((r) => (k === "satisfaction" ? r.satisfaction : r.features[k]));
  const cols = keys.map(col);
  const matrix = keys.map((_, i) =>
    keys.map((__, j) => {
      if (i === j) return 1;
      const xs: number[] = [];
      const ys: number[] = [];
      for (let n = 0; n < rows.length; n++) {
        const a = cols[i][n];
        const b = cols[j][n];
        if (a != null && b != null) {
          xs.push(a);
          ys.push(b);
        }
      }
      return xs.length > 10 ? r2(pearson(xs, ys), 3) : null;
    }),
  );
  return { keys, matrix };
}

function pearson(xs: number[], ys: number[]) {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}
