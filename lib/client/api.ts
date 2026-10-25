/**
 * Appels API côté navigateur. Lève une ApiError avec le message renvoyé par le serveur,
 * et renvoie vers la page de connexion si la session a expiré.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
  });

  if (res.status === 401 && !url.startsWith("/api/auth/login")) {
    // Rechargement complet volontaire : la session a expiré, on repart de zéro.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    throw new ApiError(401, "Session expirée.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = (data as { details?: unknown }).details;
    let message = (data as { error?: string }).error ?? `Erreur ${res.status}`;
    // Ajoute le détail des champs invalides renvoyé par le serveur.
    if (Array.isArray(details) && details.length && typeof details[0] === "object" && details[0] && "message" in details[0]) {
      message += " " + details.map((d: { message: string }) => d.message).join(" ");
    }
    throw new ApiError(res.status, message, details);
  }
  return data as T;
}

/** Formatage commun des dates et nombres en français. */
export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export const fmtDateTime = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export const fmtMonth = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { month: "short", year: "numeric", timeZone: "UTC" }) : "—";

export const fmtNumber = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const fmtSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} o` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`;

/** Période d'un import : « sept. 2026 » si un seul mois, sinon « oct. 2025 – août 2026 ». */
export const fmtPeriod = (start: string | null | undefined, end: string | null | undefined) =>
  !start ? "—" : !end || fmtMonth(start) === fmtMonth(end) ? fmtMonth(start) : `${fmtMonth(start)} – ${fmtMonth(end)}`;
