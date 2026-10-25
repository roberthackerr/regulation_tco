import "server-only";
import { fetchWithTimeout } from "../http";
import { RELEVANCE_WORDS, type RawMention } from "../types";

/** Décode les entités XML/HTML courantes et retire les balises. */
const clean = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? "";

/**
 * Presse en ligne via le flux RSS public de Google Actualités (édition francophone ;
 * l'édition « MG » n'existe pas). Flux prévu pour les agrégateurs : aucune clé.
 * Seuls les articles qui parlent bien de Madagascar sont gardés (filtre anti-homonymes).
 */
export async function fetchGoogleNews({ query, brand }: { query: string; brand: RegExp }): Promise<RawMention[]> {
  const q = encodeURIComponent(`${query} when:180d`);
  const res = await fetchWithTimeout(`https://news.google.com/rss/search?q=${q}&hl=fr&gl=FR&ceid=FR:fr`);
  const xml = await res.text();
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return items.slice(0, 100).map((it) => {
    const link = clean(tag(it, "link"));
    const titre = clean(tag(it, "title"));
    const media = clean(tag(it, "source"));
    const desc = clean(tag(it, "description"));
    const texte = desc && !desc.startsWith(titre) ? `${titre}. ${desc}` : titre;
    return {
      externalId: clean(tag(it, "guid")) || link,
      texte: texte.slice(0, 1000),
      url: link || null,
      auteur: media || null,
      publishedAt: new Date(clean(tag(it, "pubDate")) || Date.now()),
      engagement: 0,
    };
  }).filter((m) => isRelevant(`${m.texte} ${m.auteur ?? ""}`, brand));
}

/** Le texte cite la marque (mot entier, pas « Yasmine ») ET un mot ou un média qui situe à Madagascar. */
export function isRelevant(texte: string, brand: RegExp): boolean {
  const t = texte.toLowerCase();
  return brand.test(t) && RELEVANCE_WORDS.some((w) => t.includes(w));
}
