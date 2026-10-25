import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { HttpError, assertObjectId, handler } from "@/lib/http";
import { loadRows, rowsToCsv } from "@/lib/datasets/csv";
import { DatasetVersion } from "@/models/DatasetVersion";

/**
 * GET /api/admin/datasets/:id/export?format=csv|json — téléchargement d'une version
 * (le même CSV est publié sur Kaggle pour l'entraînement).
 */
export const GET = handler(async (req: Request, ctx: RouteContext<"/api/admin/datasets/[id]/export">) => {
  const admin = await requireUser("admin");
  const { id } = await ctx.params;
  assertObjectId(id);
  const v = await DatasetVersion.findById(id, { version: 1, features: 1, scaler: 1, checksum: 1 }).lean();
  if (!v) throw new HttpError(404, "Version introuvable.");
  const rows = await loadRows(id);
  if (!rows.length) throw new HttpError(410, "Les lignes de cette version ont été purgées (seules les 5 dernières versions sont conservées).");

  const format = new URL(req.url).searchParams.get("format") === "json" ? "json" : "csv";
  await audit(admin.id, "dataset_export", id, { format });
  const name = `dataset_satisfaction_v${v.version}`;

  if (format === "json") {
    const body = JSON.stringify(
      {
        version: v.version,
        checksum: v.checksum,
        features: v.features,
        target: "satisfaction",
        scaler: v.scaler,
        rows: rows.map((r) => ({ operateur: r.operateur, date: r.date.toISOString().slice(0, 10), region: r.region, service: r.service, ...r.features, nb_avis: r.nbAvis, satisfaction: r.satisfaction, classe: r.classe })),
      },
      null,
      0,
    );
    return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.json"` } });
  }

  return new Response(rowsToCsv(v, rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
  });
});
