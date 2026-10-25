import "server-only";
import { fetchWithTimeout } from "../http";
import type { RawMention } from "../types";

type Entry = {
  id: { label: string };
  author?: { name?: { label: string }; uri?: { label: string } };
  updated: { label: string };
  title?: { label: string };
  content?: { label: string };
  "im:rating"?: { label: string };
  "im:voteSum"?: { label: string };
};

/**
 * Avis publics des applications de l'opérateur, via le flux RSS officiel d'Apple
 * (itunes.apple.com/{pays}/rss/customerreviews). Données réelles, sans clé.
 * Apple expose jusqu'à 10 pages de 50 avis par vitrine.
 */
export async function fetchAppStore(apps: { id: number; nom: string; pays: string[] }[]): Promise<RawMention[]> {
  const out: RawMention[] = [];
  for (const app of apps) {
    for (const pays of app.pays) {
      for (let page = 1; page <= 10; page++) {
        const res = await fetchWithTimeout(`https://itunes.apple.com/${pays}/rss/customerreviews/page=${page}/id=${app.id}/sortby=mostrecent/json`);
        const data = (await res.json()) as { feed?: { entry?: Entry | Entry[] } };
        const raw = data.feed?.entry;
        const entries = !raw ? [] : Array.isArray(raw) ? raw : [raw];
        const reviews = entries.filter((e) => e["im:rating"]); // la 1re entrée peut décrire l'appli elle-même
        if (!reviews.length) break;
        for (const e of reviews) {
          const titre = e.title?.label?.trim() ?? "";
          const corps = e.content?.label?.trim() ?? "";
          out.push({
            externalId: `${app.id}-${e.id.label}`,
            texte: `[${app.nom}] ${titre && !corps.startsWith(titre) ? `${titre}. ` : ""}${corps}`.slice(0, 1200),
            url: `https://apps.apple.com/${pays}/app/id${app.id}?see-all=reviews`,
            auteur: e.author?.uri?.label ?? e.author?.name?.label ?? null,
            publishedAt: new Date(e.updated.label),
            engagement: Number(e["im:voteSum"]?.label ?? 0) || 0,
            note: Number(e["im:rating"]!.label) || null,
          });
        }
        if (reviews.length < 50) break;
      }
    }
  }
  return out;
}
