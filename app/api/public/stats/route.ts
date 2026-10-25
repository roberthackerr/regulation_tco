import { OPERATORS } from "@/lib/constants";
import { connectDb } from "@/lib/db";
import { handler } from "@/lib/http";
import { Operator } from "@/models/Operator";
import { OperatorMetric } from "@/models/OperatorMetric";

/**
 * GET /api/public/stats — comparaison publique et agrégée des opérateurs (open data).
 * Uniquement des moyennes nationales de qualité de service : ni nombre d'abonnés,
 * ni réclamations, ni détail par région (données jugées sensibles).
 * Les taux sont pondérés par le nombre d'abonnés de chaque région.
 */
export const GET = handler(async () => {
  await connectDb();
  // Ordre officiel (Yas, Orange, Airtel), identique partout dans l'interface.
  const rank = (code: string) => OPERATORS.findIndex((o) => o.code === code);
  const operators = (await Operator.find({ actif: true }).lean()).sort((a, b) => rank(a.code) - rank(b.code));

  // Dernier mois pour lequel TOUS les opérateurs actifs ont des données (comparaison équitable).
  const lastByOp = await OperatorMetric.aggregate<{ _id: unknown; last: Date }>([
    { $group: { _id: "$operatorId", last: { $max: "$date" } } },
  ]);
  const mois =
    lastByOp.length === operators.length && operators.length > 0
      ? new Date(Math.min(...lastByOp.map((x) => x.last.getTime())))
      : null;

  const weighted = (field: string) => ({ $sum: { $multiply: [`$${field}`, "$nb_abonnes"] } });
  const ratio = (num: string) => ({
    $round: [{ $cond: [{ $gt: ["$abonnes", 0] }, { $divide: [`$${num}`, "$abonnes"] }, null] }, 2],
  });

  const snapshot = mois
    ? await OperatorMetric.aggregate([
        { $match: { date: mois } },
        {
          $group: {
            _id: "$operatorId",
            abonnes: { $sum: "$nb_abonnes" },
            w_coupure: weighted("taux_coupure"),
            w_dispo: weighted("taux_disponibilite"),
            debit: { $avg: { $cond: [{ $eq: ["$service", "data"] }, "$debit_moyen_mbps", null] } },
            latence: { $avg: { $cond: [{ $eq: ["$service", "data"] }, "$latence_ms", null] } },
            regions: { $addToSet: "$region" },
          },
        },
        {
          $project: {
            taux_coupure: ratio("w_coupure"),
            taux_disponibilite: ratio("w_dispo"),
            debit_moyen_mbps: { $round: ["$debit", 1] },
            latence_data_ms: { $round: ["$latence", 0] },
            regions_couvertes: { $size: "$regions" },
          },
        },
      ])
    : [];

  // Évolution mensuelle du taux de coupure national par opérateur.
  const evolution = await OperatorMetric.aggregate([
    { $group: { _id: { op: "$operatorId", date: "$date" }, abonnes: { $sum: "$nb_abonnes" }, w_coupure: weighted("taux_coupure") } },
    { $project: { _id: 0, op: "$_id.op", date: "$_id.date", taux_coupure: ratio("w_coupure") } },
    { $sort: { date: 1 } },
  ]);

  const [lignes, regions, nbMois] = await Promise.all([
    OperatorMetric.estimatedDocumentCount(),
    OperatorMetric.distinct("region"),
    OperatorMetric.distinct("date"),
  ]);

  const codeOf = new Map(operators.map((o) => [String(o._id), o.code]));
  return Response.json({
    mois,
    operateurs: operators.map((o) => {
      const s = snapshot.find((x) => String(x._id) === String(o._id));
      return {
        code: o.code,
        nom: o.nom,
        taux_coupure: s?.taux_coupure ?? null,
        taux_disponibilite: s?.taux_disponibilite ?? null,
        debit_moyen_mbps: s?.debit_moyen_mbps ?? null,
        latence_data_ms: s?.latence_data_ms ?? null,
        regions_couvertes: s?.regions_couvertes ?? 0,
      };
    }),
    evolution: evolution
      .filter((e) => codeOf.has(String(e.op)))
      .map((e) => ({ date: e.date, code: codeOf.get(String(e.op)), taux_coupure: e.taux_coupure })),
    totaux: { lignes, operateurs: operators.length, regions: regions.length, mois: nbMois.length },
  });
});
