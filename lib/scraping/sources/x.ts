import "server-only";
import { fetchWithTimeout } from "../http";
import type { RawMention } from "../types";

type XRes = {
  data?: {
    id: string;
    text: string;
    author_id: string;
    created_at: string;
    public_metrics?: { like_count: number; retweet_count: number; reply_count: number; quote_count: number };
  }[];
};

/** Publications récentes sur X via l'API officielle v2 (jeton X_BEARER_TOKEN). */
export async function fetchX(keywords: string[], bearer: string): Promise<RawMention[]> {
  const query = encodeURIComponent(`(${keywords.map((k) => `"${k}"`).join(" OR ")}) -is:retweet`);
  const res = (await (
    await fetchWithTimeout(
      `https://api.x.com/2/tweets/search/recent?query=${query}&max_results=50&tweet.fields=created_at,public_metrics,author_id`,
      { headers: { Authorization: `Bearer ${bearer}` } },
    )
  ).json()) as XRes;

  return (res.data ?? []).map((t) => {
    const m = t.public_metrics;
    return {
      externalId: t.id,
      texte: t.text,
      url: `https://x.com/i/web/status/${t.id}`,
      auteur: t.author_id,
      publishedAt: new Date(t.created_at),
      engagement: m ? m.like_count + m.retweet_count + m.reply_count + m.quote_count : 0,
    };
  });
}
