import { Types } from "mongoose";
import { requireUser } from "@/lib/auth/dal";
import { isOperatorCode } from "@/lib/constants";
import { HttpError, handler } from "@/lib/http";
import { Operator } from "@/models/Operator";
import { OperatorMetric } from "@/models/OperatorMetric";

/**
 * GET /api/operator/metrics — indicateurs agrégés d'un opérateur.
 * Un opérateur obtient toujours les siens (le paramètre ?operator est ignoré).
 * L'admin choisit l'opérateur avec ?operator=YAS.
 */
export const GET = handler(async (req: Request) => {
  const user = await requireUser("admin", "operator");

  let operatorId: Types.ObjectId;
  let operatorCode: string;
  if (user.role === "operator") {
    operatorId = new Types.ObjectId(user.operatorId!);
    operatorCode = user.operatorCode!;
  } else {
    const code = new URL(req.url).searchParams.get("operator");
    if (!isOperatorCode(code)) {
      throw new HttpError(400, "Paramètre ?operator requis (YAS, ORANGE ou AIRTEL).");
    }
    const op = await Operator.findOne({ code }).lean();
    if (!op) throw new HttpError(404, "Opérateur introuvable.");
    operatorId = op._id;
    operatorCode = code;
  }

  // Indicateurs par mois et par service (moyennes pondérées par le nombre d'abonnés
  // pour les taux et la qualité, sommes pour les volumes).
  const parMois = await OperatorMetric.aggregate([
    { $match: { operatorId } },
    {
      $group: {
        _id: { date: "$date", service: "$service" },
        nb_abonnes: { $sum: "$nb_abonnes" },
        nb_reclamations: { $sum: "$nb_reclamations" },
        w_coupure: { $sum: { $multiply: ["$taux_coupure", "$nb_abonnes"] } },
        w_dispo: { $sum: { $multiply: ["$taux_disponibilite", "$nb_abonnes"] } },
        w_tarif: { $sum: { $multiply: ["$tarif_moyen_ar", "$nb_abonnes"] } },
        debit_moyen_mbps: { $avg: "$debit_moyen_mbps" },
        latence_ms: { $avg: "$latence_ms" },
        nb_regions: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        date: "$_id.date",
        service: "$_id.service",
        nb_abonnes: 1,
        nb_reclamations: 1,
        nb_regions: 1,
        debit_moyen_mbps: { $round: ["$debit_moyen_mbps", 2] },
        latence_ms: { $round: ["$latence_ms", 0] },
        taux_coupure: { $round: [{ $cond: [{ $gt: ["$nb_abonnes", 0] }, { $divide: ["$w_coupure", "$nb_abonnes"] }, null] }, 2] },
        taux_disponibilite: { $round: [{ $cond: [{ $gt: ["$nb_abonnes", 0] }, { $divide: ["$w_dispo", "$nb_abonnes"] }, null] }, 2] },
        tarif_moyen_ar: { $round: [{ $cond: [{ $gt: ["$nb_abonnes", 0] }, { $divide: ["$w_tarif", "$nb_abonnes"] }, null] }, 0] },
        reclamations_pour_1000: {
          $round: [{ $cond: [{ $gt: ["$nb_abonnes", 0] }, { $multiply: [{ $divide: ["$nb_reclamations", "$nb_abonnes"] }, 1000] }, null] }, 3],
        },
      },
    },
    { $sort: { date: 1, service: 1 } },
  ]);

  // Dernier mois disponible, détaillé par région et par service.
  const last = await OperatorMetric.findOne({ operatorId }).sort({ date: -1 }).select("date").lean();
  const parRegion = last
    ? await OperatorMetric.aggregate([
        { $match: { operatorId, date: last.date } },
        {
          $project: {
            _id: 0,
            region: 1,
            service: 1,
            nb_abonnes: 1,
            nb_reclamations: 1,
            taux_coupure: 1,
            taux_disponibilite: 1,
            debit_moyen_mbps: 1,
            latence_ms: 1,
            tarif_moyen_ar: 1,
            reclamations_pour_1000: {
              $round: [{ $cond: [{ $gt: ["$nb_abonnes", 0] }, { $multiply: [{ $divide: ["$nb_reclamations", "$nb_abonnes"] }, 1000] }, null] }, 3],
            },
          },
        },
        { $sort: { region: 1, service: 1 } },
      ])
    : [];

  return Response.json({
    operator: operatorCode,
    dernierMois: last?.date ?? null,
    parMois,
    parRegion,
  });
});
