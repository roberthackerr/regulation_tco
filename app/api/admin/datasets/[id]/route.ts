import { Types } from "mongoose";
import { requireUser } from "@/lib/auth/dal";
import { isOperatorCode, REGIONS, SERVICES } from "@/lib/constants";
import { HttpError, assertObjectId, handler } from "@/lib/http";
import { FEATURE_KEYS } from "@/lib/pipeline/definitions";
import { serializeVersion } from "@/lib/pipeline/serialize";
import { DatasetRow } from "@/models/DatasetRow";
import { DatasetVersion } from "@/models/DatasetVersion";

const PAGE_SIZE = 25;

/**
 * GET /api/admin/datasets/:id — une version du dataset : statistiques, corrélations,
 * satisfaction par opérateur × service et par mois, comparaison avec la version
 * précédente, et un extrait paginé des lignes (filtres et tri en paramètres).
 */
export const GET = handler(async (req: Request, ctx: RouteContext<"/api/admin/datasets/[id]">) => {
  await requireUser("admin");
  const { id } = await ctx.params;
  assertObjectId(id);
  const v = await DatasetVersion.findById(id).lean();
  if (!v) throw new HttpError(404, "Version introuvable.");

  const sp = new URL(req.url).searchParams;
  const filter: Record<string, unknown> = { versionId: new Types.ObjectId(id) };
  const op = sp.get("operateur");
  if (isOperatorCode(op)) filter.operateur = op;
  const service = sp.get("service");
  if (service && (SERVICES as readonly string[]).includes(service)) filter.service = service;
  const region = sp.get("region");
  if (region && (REGIONS as readonly string[]).includes(region)) filter.region = region;
  const classe = sp.get("classe");
  if (classe && ["satisfait", "neutre", "insatisfait"].includes(classe)) filter.classe = classe;
  if (sp.get("etiquetees") === "1") filter.satisfaction = { $ne: null };

  const sortKey = sp.get("sort") ?? "date";
  const dir = sp.get("dir") === "asc" ? 1 : -1;
  const sortField = ["date", "satisfaction", "nbAvis", "region"].includes(sortKey)
    ? sortKey
    : FEATURE_KEYS.includes(sortKey)
      ? `features.${sortKey}`
      : "date";
  const page = Math.max(1, Number(sp.get("page")) || 1);

  const vid = new Types.ObjectId(id);
  const [rows, total, hasRows, parOpService, parMois, previous] = await Promise.all([
    DatasetRow.find(filter).sort({ [sortField]: dir, _id: 1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
    DatasetRow.countDocuments(filter),
    DatasetRow.exists({ versionId: vid }),
    DatasetRow.aggregate<{ _id: { operateur: string; service: string }; moyenne: number; n: number }>([
      { $match: { versionId: vid, satisfaction: { $ne: null } } },
      { $group: { _id: { operateur: "$operateur", service: "$service" }, moyenne: { $avg: "$satisfaction" }, n: { $sum: 1 } } },
    ]),
    DatasetRow.aggregate<{ _id: { operateur: string; date: Date }; moyenne: number }>([
      { $match: { versionId: vid, satisfaction: { $ne: null } } },
      { $group: { _id: { operateur: "$operateur", date: "$date" }, moyenne: { $avg: "$satisfaction" } } },
    ]),
    DatasetVersion.findOne({ version: { $lt: v.version } }, { stats: 0, correlations: 0, scaler: 0 }).sort({ version: -1 }).lean(),
  ]);

  return Response.json({
    ...serializeVersion(v),
    features: v.features,
    stats: v.stats,
    correlations: v.correlations,
    sentiment: v.sentiment,
    rowsAvailable: Boolean(hasRows),
    previous: previous ? serializeVersion(previous) : null,
    satisfaction: {
      parOpService: parOpService.map((x) => ({ operateur: x._id.operateur, service: x._id.service, moyenne: Math.round(x.moyenne * 10) / 10, n: x.n })),
      parMois: parMois
        .map((x) => ({ operateur: x._id.operateur, date: x._id.date.toISOString().slice(0, 10), moyenne: Math.round(x.moyenne * 10) / 10 }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    },
    rows: rows.map((r) => ({
      operateur: r.operateur,
      date: r.date.toISOString().slice(0, 10),
      region: r.region,
      service: r.service,
      features: r.features,
      nbAvis: r.nbAvis,
      satisfaction: r.satisfaction,
      classe: r.classe,
    })),
    total,
    page,
    pageSize: PAGE_SIZE,
  });
});
