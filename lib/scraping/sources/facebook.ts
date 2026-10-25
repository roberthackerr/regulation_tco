import "server-only";
import { fetchWithTimeout } from "../http";
import type { RawMention } from "../types";

type FbRes = {
  data?: {
    id: string;
    permalink_url?: string;
    comments?: { data: { id: string; message?: string; created_time: string; like_count?: number; from?: { id: string } }[] };
  }[];
};

/**
 * Commentaires laissés sous les publications de la page Facebook OFFICIELLE de l'opérateur,
 * via la Graph API et le jeton de page de l'opérateur (seule voie autorisée par Meta).
 */
export async function fetchFacebook(pageId: string, token: string): Promise<RawMention[]> {
  const fields = encodeURIComponent("permalink_url,comments.limit(50){message,created_time,like_count,from}");
  const res = (await (
    await fetchWithTimeout(`https://graph.facebook.com/v21.0/${pageId}/posts?fields=${fields}&limit=15&access_token=${encodeURIComponent(token)}`)
  ).json()) as FbRes;

  return (res.data ?? []).flatMap((post) =>
    (post.comments?.data ?? [])
      .filter((c) => c.message?.trim())
      .map((c) => ({
        externalId: c.id,
        texte: c.message!.slice(0, 1000),
        url: post.permalink_url ?? null,
        auteur: c.from?.id ?? null,
        publishedAt: new Date(c.created_time),
        engagement: c.like_count ?? 0,
      })),
  );
}
