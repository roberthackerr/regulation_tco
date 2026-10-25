import "server-only";
import type { Types } from "mongoose";
import type { OperatorCode } from "@/lib/constants";
import { ScrapeRun } from "@/models/ScrapeRun";
import { SocialMention } from "@/models/SocialMention";
import { enrich, pseudonyme } from "./enrich";
import { fetchAppStore } from "./sources/appStore";
import { fetchFacebook } from "./sources/facebook";
import { fetchGoogleNews } from "./sources/googleNews";
import { fetchX } from "./sources/x";
import { fetchYoutube } from "./sources/youtube";
import { OPERATOR_APPS, OPERATOR_KEYWORDS, OPERATOR_NEWS, type MentionSource, type RawMention, type SourceStatus } from "./types";

/** Sources de la veille pour un opérateur. Uniquement du réel : une source sans accès est désactivée. */
export function sourceStatuses(code: OperatorCode): SourceStatus[] {
  const fb = process.env[`FACEBOOK_PAGE_ID_${code}`] && process.env[`FACEBOOK_PAGE_TOKEN_${code}`];
  return [
    { source: "app_store", mode: "reel", detail: `Avis publics : ${OPERATOR_APPS[code].map((a) => a.nom).join(", ")}` },
    { source: "google_news", mode: "reel", detail: "Flux RSS public Google Actualités" },
    process.env.YOUTUBE_API_KEY
      ? { source: "youtube", mode: "reel", detail: "Commentaires publics, API YouTube Data v3" }
      : { source: "youtube", mode: "off", detail: "À configurer : YOUTUBE_API_KEY (gratuit)" },
    fb
      ? { source: "facebook", mode: "reel", detail: "Commentaires de la page officielle (Graph API)" }
      : { source: "facebook", mode: "off", detail: `À configurer : FACEBOOK_PAGE_ID_${code} + TOKEN` },
    process.env.X_BEARER_TOKEN
      ? { source: "x", mode: "reel", detail: "Publications publiques, API X v2" }
      : { source: "x", mode: "off", detail: "À configurer : X_BEARER_TOKEN (offre payante)" },
  ];
}

async function collect(code: OperatorCode, source: MentionSource): Promise<RawMention[]> {
  const kw = OPERATOR_KEYWORDS[code];
  switch (source) {
    case "app_store":
      return fetchAppStore(OPERATOR_APPS[code]);
    case "google_news":
      return fetchGoogleNews(OPERATOR_NEWS[code]);
    case "youtube":
      return fetchYoutube(kw, process.env.YOUTUBE_API_KEY!);
    case "x":
      return fetchX(kw, process.env.X_BEARER_TOKEN!);
    case "facebook":
      return fetchFacebook(process.env[`FACEBOOK_PAGE_ID_${code}`]!, process.env[`FACEBOOK_PAGE_TOKEN_${code}`]!);
  }
}

/** Lance la collecte sur toutes les sources actives, en parallèle, et enregistre les nouvelles mentions. */
export async function runScrape(operatorId: Types.ObjectId, code: OperatorCode, userId: string | null) {
  const run = await ScrapeRun.create({ operatorId, lanceePar: userId });
  const active = sourceStatuses(code).filter((s) => s.mode === "reel");

  const results = await Promise.all(
    active.map(async ({ source }) => {
      const t0 = Date.now();
      try {
        const raw = await collect(code, source);
        const ops = await Promise.all(
          raw
            .filter((m) => m.texte.trim().length >= 8 && !Number.isNaN(m.publishedAt.getTime()))
            .map(async (m) => ({
              updateOne: {
                filter: { operatorId, source, externalId: m.externalId },
                update: {
                  $setOnInsert: {
                    operatorId,
                    source,
                    externalId: m.externalId,
                    texte: m.texte,
                    url: m.url ?? null,
                    // Le média d'un article est public ; les personnes sont pseudonymisées.
                    auteur: source === "google_news" ? (m.auteur ?? null) : await pseudonyme(source, m.auteur),
                    publishedAt: m.publishedAt,
                    engagement: m.engagement ?? 0,
                    note: m.note ?? null,
                    runId: run._id,
                    ...enrich(m.texte, m.note ?? null),
                  },
                },
                upsert: true,
              },
            })),
        );
        const res = ops.length ? await SocialMention.bulkWrite(ops, { ordered: false }) : null;
        return { source, collectes: ops.length, nouveaux: res?.upsertedCount ?? 0, erreur: null, dureeMs: Date.now() - t0 };
      } catch (e) {
        const msg = e instanceof Error ? (e.name === "TimeoutError" ? "Délai dépassé" : e.message) : String(e);
        return { source, collectes: 0, nouveaux: 0, erreur: msg.slice(0, 200), dureeMs: Date.now() - t0 };
      }
    }),
  );

  run.sources = results as typeof run.sources;
  run.nouveaux = results.reduce((n, r) => n + r.nouveaux, 0);
  run.status = results.every((r) => r.erreur) ? "erreur" : "termine";
  run.finishedAt = new Date();
  await run.save();
  return run.toObject();
}
