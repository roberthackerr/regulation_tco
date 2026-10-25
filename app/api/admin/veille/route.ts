import { requireUser } from "@/lib/auth/dal";
import { OPERATORS } from "@/lib/constants";
import { handler } from "@/lib/http";
import { Operator } from "@/models/Operator";
import { SocialMention } from "@/models/SocialMention";

const DAY = 86400_000;

/** GET /api/admin/veille — résumé de la veille sur 7 jours pour chaque opérateur (vue d'ensemble admin). */
export const GET = handler(async () => {
  await requireUser("admin");
  const now = Date.now();
  const ops = await Operator.find({}, { code: 1 }).lean();
  const agg = await SocialMention.aggregate<{ _id: { op: unknown; label: string; recent: boolean }; n: number }>([
    { $match: { publishedAt: { $gte: new Date(now - 14 * DAY) } } },
    { $group: { _id: { op: "$operatorId", label: "$sentiment.label", recent: { $gte: ["$publishedAt", new Date(now - 7 * DAY)] } }, n: { $sum: 1 } } },
  ]);
  const neg48 = await SocialMention.aggregate<{ _id: unknown; n: number }>([
    { $match: { publishedAt: { $gte: new Date(now - 2 * DAY) }, "sentiment.label": "negatif" } },
    { $group: { _id: "$operatorId", n: { $sum: 1 } } },
  ]);

  const nss = (rows: typeof agg) => {
    const t = rows.reduce((s, r) => s + r.n, 0);
    const p = rows.filter((r) => r._id.label === "positif").reduce((s, r) => s + r.n, 0);
    const n = rows.filter((r) => r._id.label === "negatif").reduce((s, r) => s + r.n, 0);
    return { total: t, nss: t ? ((p - n) / t) * 100 : null };
  };

  return Response.json({
    operateurs: OPERATORS.map((o) => {
      const op = ops.find((x) => x.code === o.code);
      const mine = agg.filter((r) => op && String(r._id.op) === String(op._id));
      const cur = nss(mine.filter((r) => r._id.recent));
      const prev = nss(mine.filter((r) => !r._id.recent));
      return { operateur: o.code, mentions: cur.total, nss: cur.nss, prevNss: prev.nss, negatives48h: neg48.find((x) => op && String(x._id) === String(op._id))?.n ?? 0 };
    }),
  });
});
