import "server-only";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { ZodError } from "zod";

/** Erreur HTTP « attendue » : son message est renvoyé tel quel au client. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/**
 * Enveloppe une route API : transforme les erreurs en réponses JSON propres
 * ({ error, details? }) et masque les erreurs internes inattendues.
 */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    // Les routes API dépendent toujours de la requête (session, base) : jamais pré-rendues.
    await connection();
    try {
      return await fn(...args);
    } catch (err) {
      // Laisse passer les signaux internes de Next.js (redirect, fin de pré-rendu…).
      unstable_rethrow(err);
      if (err instanceof HttpError) {
        return Response.json({ error: err.message, details: err.details }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return Response.json(
          {
            error: "Données invalides.",
            details: err.issues.map((i) => ({ champ: i.path.join("."), message: i.message })),
          },
          { status: 400 },
        );
      }
      console.error("[api] erreur inattendue :", err);
      return Response.json({ error: "Erreur interne du serveur." }, { status: 500 });
    }
  };
}

/** Lit le corps JSON d'une requête, avec une erreur 400 claire s'il est mal formé. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Corps de requête JSON invalide.");
  }
}

/** Adresse IP du client (derrière un proxy, on prend la première de X-Forwarded-For). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "inconnue";
}

/** Vérifie qu'une chaîne est un ObjectId MongoDB valide (24 caractères hexadécimaux). */
export function assertObjectId(id: string, label = "Identifiant"): void {
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new HttpError(400, `${label} invalide.`);
}
