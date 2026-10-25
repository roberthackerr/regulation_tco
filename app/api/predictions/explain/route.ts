import { requireUser } from "@/lib/auth/dal";
import { HttpError, handler } from "@/lib/http";
import { explain, getBatch } from "@/lib/ml/batch";

/** GET /api/predictions/explain?operateur=&region=&service=&date= — pourquoi ce score, et comment l'améliorer. */
export const GET = handler(async (req: Request) => {
  const user = await requireUser("admin", "operator");
  const sp = new URL(req.url).searchParams;
  const operateur = user.role === "operator" ? user.operatorCode! : sp.get("operateur");
  const region = sp.get("region");
  const service = sp.get("service");
  const date = sp.get("date");

  const b = await getBatch();
  const row = b.rows.find((r) => r.operateur === operateur && r.region === region && r.service === service && r.date === date);
  if (!row) throw new HttpError(404, "Aucune prédiction pour cette combinaison.");

  const historique = b.rows
    .filter((r) => r.operateur === operateur && r.region === region && r.service === service)
    .sort((a, c) => a.date.localeCompare(c.date))
    .map((r) => ({ date: r.date, score: r.score, observe: r.observe }));

  return Response.json({
    cell: { operateur: row.operateur, region: row.region, service: row.service, date: row.date, score: row.score, classe: row.classe, probas: row.probas, observe: row.observe, nbAvis: row.nbAvis },
    ...explain(b, row),
    historique,
  });
});
