import "server-only";
import { fetchWithTimeout } from "../http";
import type { RawMention } from "../types";

type SearchRes = { items?: { id: { videoId?: string } }[] };
type CommentsRes = {
  items?: {
    id: string;
    snippet: {
      videoId: string;
      totalReplyCount: number;
      topLevelComment: { snippet: { textOriginal: string; authorChannelId?: { value: string }; likeCount: number; publishedAt: string } };
    };
  }[];
};

/**
 * Commentaires publics YouTube via l'API officielle YouTube Data v3 (clé YOUTUBE_API_KEY).
 * Recherche les vidéos récentes qui citent l'opérateur, puis lit leurs commentaires.
 */
export async function fetchYoutube(keywords: string[], apiKey: string): Promise<RawMention[]> {
  const since = new Date(Date.now() - 90 * 86400_000).toISOString();
  const q = encodeURIComponent(keywords.join("|"));
  const search = (await (
    await fetchWithTimeout(
      `https://www.googleapis.com/youtube/v3/search?part=id&type=video&maxResults=8&order=date&regionCode=MG&publishedAfter=${since}&q=${q}&key=${apiKey}`,
    )
  ).json()) as SearchRes;

  const videoIds = (search.items ?? []).map((i) => i.id.videoId).filter((v): v is string => !!v);
  const pages = await Promise.allSettled(
    videoIds.map(async (v) =>
      (await (
        await fetchWithTimeout(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&maxResults=40&textFormat=plainText&videoId=${v}&key=${apiKey}`)
      ).json()) as CommentsRes,
    ),
  );

  return pages.flatMap((p) =>
    p.status !== "fulfilled"
      ? [] // commentaires désactivés sur la vidéo : on ignore
      : (p.value.items ?? []).map((c) => {
          const s = c.snippet.topLevelComment.snippet;
          return {
            externalId: c.id,
            texte: s.textOriginal.slice(0, 1000),
            url: `https://www.youtube.com/watch?v=${c.snippet.videoId}&lc=${c.id}`,
            auteur: s.authorChannelId?.value ?? null,
            publishedAt: new Date(s.publishedAt),
            engagement: s.likeCount + c.snippet.totalReplyCount,
          };
        }),
  );
}
