import { requireUser } from "@/lib/auth/dal";
import { resolveOperator } from "@/lib/auth/operatorScope";
import { handler } from "@/lib/http";
import { sourceStatuses } from "@/lib/scraping/run";
import { MENTION_THEMES_LIST } from "@/lib/scraping/themes";
import { analyserSentiment } from "@/lib/sentiment";
import { Feedback } from "@/models/Feedback";
import { ScrapeRun } from "@/models/ScrapeRun";
import { SocialMention } from "@/models/SocialMention";

type Label = "positif" | "neutre" | "negatif";
const DAY = 86400_000;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/**
 * GET /api/operator/veille?days=30 — tableau de bord de veille d'un opérateur :
 * mentions sur les réseaux sociaux et la presse, plus les avis publics des usagers.
 */
export const GET = handler(async (req: Request) => {
  const user = await requireUser("admin", "operator");
  const { operatorId, code } = await resolveOperator(user, req);
  const daysParam = Number(new URL(req.url).searchParams.get("days"));
  const days = [7, 30, 90].includes(daysParam) ? daysParam : 30;

  const now = Date.now();
  const from = new Date(now - days * DAY);
  const prevFrom = new Date(now - 2 * days * DAY);

  const [mentions, prevAgg, lastRun, formulaires, appAvis] = await Promise.all([
    SocialMention.find({ operatorId, publishedAt: { $gte: from } })
      .sort({ publishedAt: -1 })
      .select("-runId -operatorId -__v -updatedAt")
      .limit(5000)
      .lean(),
    SocialMention.aggregate([
      { $match: { operatorId, publishedAt: { $gte: prevFrom, $lt: from } } },
      { $group: { _id: "$sentiment.label", n: { $sum: 1 } } },
    ]),
    ScrapeRun.findOne({ operatorId }).sort({ createdAt: -1 }).lean(),
    Feedback.find({ operatorId, status: "publie" })
      .sort({ createdAt: -1 })
      .limit(3000)
      .select("date region service note commentaire sentiment createdAt")
      .lean(),
    SocialMention.find({ operatorId, source: "app_store", note: { $ne: null } })
      .sort({ publishedAt: -1 })
      .limit(3000)
      .select("texte note sentiment publishedAt url")
      .lean(),
  ]);

  /* ---------- Chiffres clés */
  const count = (l: Label) => mentions.filter((m) => m.sentiment.label === l).length;
  const pos = count("positif");
  const neg = count("negatif");
  const total = mentions.length;
  const prevTotal = prevAgg.reduce((n, g) => n + g.n, 0);
  const prevPos = prevAgg.find((g) => g._id === "positif")?.n ?? 0;
  const prevNeg = prevAgg.find((g) => g._id === "negatif")?.n ?? 0;
  const nss = total ? ((pos - neg) / total) * 100 : null;
  const prevNss = prevTotal ? ((prevPos - prevNeg) / prevTotal) * 100 : null;
  const engagement = mentions.reduce((n, m) => n + (m.engagement ?? 0), 0);

  /* ---------- Évolution quotidienne par sentiment */
  const buckets = new Map<string, { date: string; positif: number; neutre: number; negatif: number }>();
  for (let t = from.getTime(); t <= now; t += DAY) {
    const k = dayKey(new Date(t));
    buckets.set(k, { date: k, positif: 0, neutre: 0, negatif: 0 });
  }
  for (const m of mentions) {
    const b = buckets.get(dayKey(m.publishedAt));
    if (b) b[m.sentiment.label as Label]++;
  }
  const timeline = [...buckets.values()];

  /* ---------- Sources, thèmes, régions */
  const statuses = sourceStatuses(code);
  const sources = statuses.map((s) => ({ ...s, count: mentions.filter((m) => m.source === s.source).length }));

  const themes = MENTION_THEMES_LIST.map((theme) => {
    const ms = mentions.filter((m) => m.theme === theme);
    return {
      theme,
      total: ms.length,
      positif: ms.filter((m) => m.sentiment.label === "positif").length,
      neutre: ms.filter((m) => m.sentiment.label === "neutre").length,
      negatif: ms.filter((m) => m.sentiment.label === "negatif").length,
    };
  })
    .filter((t) => t.total > 0)
    .sort((a, b) => b.total - a.total);

  const regionMap = new Map<string, { region: string; total: number; negatif: number }>();
  for (const m of mentions) {
    if (!m.region) continue;
    const r = regionMap.get(m.region) ?? { region: m.region, total: 0, negatif: 0 };
    r.total++;
    if (m.sentiment.label === "negatif") r.negatif++;
    regionMap.set(m.region, r);
  }
  const regions = [...regionMap.values()].sort((a, b) => b.negatif - a.negatif || b.total - a.total).slice(0, 12);

  /* ---------- Nuage de termes */
  const termMap = new Map<string, { terme: string; count: number; poids: number }>();
  for (const m of mentions) {
    for (const t of m.termes ?? []) {
      if (!t.terme) continue;
      const e = termMap.get(t.terme) ?? { terme: t.terme, count: 0, poids: 0 };
      e.count++;
      e.poids += t.poids ?? 0;
      termMap.set(t.terme, e);
    }
  }
  const terms = [...termMap.values()]
    .map((t) => ({ terme: t.terme, count: t.count, poids: t.poids / t.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  /* ---------- Alerte : pic de mentions négatives sur 48 h */
  let alerte = null;
  const recentNeg = mentions.filter((m) => m.sentiment.label === "negatif" && now - m.publishedAt.getTime() < 2 * DAY);
  const olderNeg = neg - recentNeg.length;
  const baseline = olderNeg / Math.max(1, days - 2); // par jour
  const recentRate = recentNeg.length / 2;
  if (recentNeg.length >= 6 && recentRate >= 2 * Math.max(baseline, 1)) {
    const top = <K extends "theme" | "region">(k: K) => {
      const c = new Map<string, number>();
      for (const m of recentNeg) if (m[k]) c.set(m[k] as string, (c.get(m[k] as string) ?? 0) + 1);
      return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    };
    alerte = { mentions: recentNeg.length, ratio: baseline > 0 ? recentRate / baseline : null, theme: top("theme"), region: top("region") };
  }

  /* ---------- Avis publics : formulaire citoyen + avis App Store (tous réels) */
  const tous = [
    ...formulaires.map((f) => {
      const sent = f.sentiment ?? analyserSentiment(f.commentaire);
      return {
        id: String(f._id),
        source: "formulaire" as const,
        date: (f as unknown as { createdAt: Date }).createdAt ?? f.date,
        region: f.region as string | null,
        service: f.service as string | null,
        note: f.note,
        commentaire: f.commentaire,
        url: null as string | null,
        sentiment: { label: sent.label, score: sent.score },
      };
    }),
    ...appAvis.map((m) => ({
      id: String(m._id),
      source: "app_store" as const,
      date: m.publishedAt,
      region: null,
      service: null,
      note: m.note as number,
      commentaire: m.texte,
      url: m.url ?? null,
      sentiment: { label: m.sentiment.label, score: m.sentiment.score },
    })),
  ].sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime());

  const moisMap = new Map<string, { s: number; n: number }>();
  for (const v of tous) {
    const k = `${new Date(v.date).toISOString().slice(0, 7)}-01`;
    const e = moisMap.get(k) ?? { s: 0, n: 0 };
    e.s += v.note;
    e.n++;
    moisMap.set(k, e);
  }
  const avis = {
    total: tous.length,
    public: formulaires.length,
    appStore: appAvis.length,
    noteMoyenne: tous.length ? tous.reduce((x, v) => x + v.note, 0) / tous.length : null,
    distribution: [1, 2, 3, 4, 5].map((n) => ({ note: n, count: tous.filter((v) => v.note === n).length })),
    parMois: [...moisMap.entries()]
      .sort(([x], [y]) => x.localeCompare(y))
      .slice(-24)
      .map(([date, e]) => ({ date, note: Math.round((e.s / e.n) * 100) / 100, n: e.n })),
    recents: tous.filter((v) => v.commentaire.trim()).slice(0, 80),
  };

  return Response.json({
    operator: code,
    days,
    kpis: { total, prevTotal, nss, prevNss, negPct: total ? (neg / total) * 100 : null, engagement, pos, neg },
    sources,
    timeline,
    themes,
    regions,
    terms,
    alerte,
    mentions: mentions.slice(0, 300).map((m) => ({ ...m, _id: String(m._id) })),
    lastRun,
    avis,
  });
});
