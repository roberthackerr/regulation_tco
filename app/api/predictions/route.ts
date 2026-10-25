import { requireUser } from "@/lib/auth/dal";
import { OPERATORS, SERVICES } from "@/lib/constants";
import { handler } from "@/lib/http";
import { getBatch } from "@/lib/ml/batch";

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);

/**
 * GET /api/predictions?month=AAAA-MM-01&service=all — satisfaction prédite par le modèle actif.
 * L'admin voit les 3 opérateurs ; un opérateur ne voit que les siens.
 */
export const GET = handler(async (req: Request) => {
  const user = await requireUser("admin", "operator");
  const b = await getBatch();
  const sp = new URL(req.url).searchParams;
  const scope = user.role === "operator" ? [user.operatorCode!] : OPERATORS.map((o) => o.code as string);
  const service = (SERVICES as readonly string[]).includes(sp.get("service") ?? "") ? sp.get("service")! : "all";

  const rows = b.rows.filter((r) => scope.includes(r.operateur));
  const months = [...new Set(rows.map((r) => r.date))].sort();
  const month = months.includes(sp.get("month") ?? "") ? sp.get("month")! : months[months.length - 1];
  const prevMonth = months[months.indexOf(month) - 1] ?? null;
  const inService = (r: (typeof rows)[number]) => service === "all" || r.service === service;

  const national = scope.map((op) => {
    const cur = rows.filter((r) => r.operateur === op && r.date === month && inService(r));
    const prev = prevMonth ? rows.filter((r) => r.operateur === op && r.date === prevMonth && inService(r)) : [];
    const obs = cur.map((r) => r.observe).filter((v): v is number => v != null);
    return {
      operateur: op,
      score: r1(mean(cur.map((r) => r.score))),
      prev: r1(mean(prev.map((r) => r.score))),
      observe: r1(mean(obs)),
      classes: {
        satisfait: cur.filter((r) => r.classe === "satisfait").length,
        neutre: cur.filter((r) => r.classe === "neutre").length,
        insatisfait: cur.filter((r) => r.classe === "insatisfait").length,
      },
    };
  });

  const trend = months.map((d) => {
    const row: Record<string, string | number | null> = { date: d };
    for (const op of scope) row[op] = r1(mean(rows.filter((r) => r.operateur === op && r.date === d && inService(r)).map((r) => r.score)));
    return row;
  });

  const cells = rows
    .filter((r) => r.date === month)
    .map((r) => ({ operateur: r.operateur, region: r.region, service: r.service, score: r.score, classe: r.classe, observe: r.observe, nbAvis: r.nbAvis, probas: r.probas }));

  // Prédit vs observé, sur les 3 derniers mois (lignes avec avis seulement).
  const recent = new Set(months.slice(-3));
  const fit = rows
    .filter((r) => recent.has(r.date) && r.observe != null && inService(r))
    .map((r) => ({ operateur: r.operateur, observe: r.observe as number, score: r.score }));
  const mae = mean(fit.map((f) => Math.abs(f.observe - f.score)));

  return Response.json({
    model: b.model,
    dataset: b.dataset,
    scope,
    months,
    month,
    prevMonth,
    service,
    national,
    trend,
    cells,
    fit: { points: fit.slice(0, 600), mae: mae == null ? null : Math.round(mae * 100) / 100, n: fit.length },
  });
});
