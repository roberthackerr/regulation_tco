import { requireUser } from "@/lib/auth/dal";
import { OPERATORS } from "@/lib/constants";
import { handler } from "@/lib/http";
import { serializeImport } from "@/lib/serialize";
import { DatasetVersion } from "@/models/DatasetVersion";
import { Import } from "@/models/Import";
import { Operator } from "@/models/Operator";
import { OperatorMetric } from "@/models/OperatorMetric";
import { PipelineRun } from "@/models/PipelineRun";
import { User } from "@/models/User";

/** Les 12 derniers mois (1er du mois, UTC), du plus ancien au plus récent, se terminant à `end`. */
function last12Months(end: Date): string[] {
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * GET /api/admin/overview — vue d'ensemble pour l'admin : imports, couverture
 * des données par opérateur et par mois, état de la chaîne de traitement.
 */
export const GET = handler(async () => {
  await requireUser("admin");

  const [byStatus, recent, metricsByOperator, operators, nbUsers, pending, lignes, lastVersion, lastRun] = await Promise.all([
    Import.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Import.find().populate("operatorId", "code").populate("userId", "email").sort({ createdAt: -1 }).limit(6).lean(),
    OperatorMetric.aggregate<{ _id: unknown; lignes: number; mois: Date[] }>([
      { $group: { _id: "$operatorId", lignes: { $sum: 1 }, mois: { $addToSet: "$date" } } },
    ]),
    Operator.find().lean().then((ops) => ops.sort((a, b) => OPERATORS.findIndex((o) => o.code === a.code) - OPERATORS.findIndex((o) => o.code === b.code))),
    User.countDocuments({ actif: true }),
    Import.find({ status: "recu" }, { operatorId: 1, periodStart: 1, periodEnd: 1 }).lean(),
    OperatorMetric.estimatedDocumentCount(),
    DatasetVersion.findOne({}, { version: 1, nbLignes: 1, qualite: 1 }).sort({ version: -1 }).lean(),
    PipelineRun.findOne({}, { status: 1, startedAt: 1 }).sort({ startedAt: -1 }).lean(),
  ]);

  // Fenêtre de 12 mois : se termine au dernier mois connu (données ou import en attente),
  // à défaut au mois précédent le mois courant.
  const known = [
    ...metricsByOperator.flatMap((m) => m.mois.map((d) => d.getTime())),
    ...pending.map((p) => p.periodEnd?.getTime() ?? 0),
  ].filter(Boolean);
  const now = new Date();
  const end = known.length ? new Date(Math.max(...known)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const months = last12Months(end);

  const coverage = operators.map((op) => {
    const m = metricsByOperator.find((x) => String(x._id) === String(op._id));
    const validated = new Set((m?.mois ?? []).map((d) => d.toISOString().slice(0, 10)));
    const waiting = new Set<string>();
    for (const p of pending.filter((x) => String(x.operatorId) === String(op._id))) {
      if (!p.periodStart || !p.periodEnd) continue;
      for (const month of months) {
        const t = new Date(month).getTime();
        if (t >= p.periodStart.getTime() && t <= p.periodEnd.getTime()) waiting.add(month);
      }
    }
    return {
      operator: op.code,
      nom: op.nom,
      lignes: m?.lignes ?? 0,
      cells: months.map((month) => (validated.has(month) ? "valide" : waiting.has(month) ? "attente" : "manquant")),
    };
  });

  const counts = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
  return Response.json({
    imports: {
      recu: counts.recu ?? 0,
      valide: counts.valide ?? 0,
      rejete: counts.rejete ?? 0,
      traite: counts.traite ?? 0,
    },
    recent: recent.map((i) => serializeImport(i)),
    months,
    coverage,
    lignes,
    nbUsers,
    pipeline: {
      lastRun: lastRun ? { status: lastRun.status, startedAt: lastRun.startedAt } : null,
      dataset: lastVersion ? { id: String(lastVersion._id), version: lastVersion.version, nbLignes: lastVersion.nbLignes, score: (lastVersion.qualite as { score?: number })?.score ?? null } : null,
      // Présence des identifiants uniquement — jamais leur valeur.
      kaggleConfigured: Boolean(process.env.KAGGLE_API_TOKEN || (process.env.KAGGLE_USERNAME && process.env.KAGGLE_KEY)),
    },
  });
});
