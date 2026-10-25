import "server-only";

const UA = "ObservatoireTelecomMG/1.0 (veille reglementaire; contact: admin)";

/** fetch avec délai maximal et User-Agent identifiable (bonne pratique de collecte). */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 12_000): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, ...init.headers },
    signal: AbortSignal.timeout(ms),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? ` — ${body.slice(0, 160)}` : ""}`);
  }
  return res;
}
