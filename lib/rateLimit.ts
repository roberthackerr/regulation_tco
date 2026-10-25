import "server-only";
import { connectDb } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { RateLimit } from "@/models/RateLimit";

/**
 * Limite le nombre d'actions par clé sur une fenêtre de temps (stocké dans MongoDB,
 * donc partagé entre plusieurs instances du serveur).
 * Lève une erreur 429 quand la limite est dépassée.
 */
export async function rateLimit(cle: string, max: number, windowSeconds: number): Promise<void> {
  await connectDb();
  const now = new Date();

  // Si le compteur existant a expiré, on le remet à zéro.
  await RateLimit.deleteOne({ cle, expiresAt: { $lte: now } });

  const doc = await RateLimit.findOneAndUpdate(
    { cle },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(now.getTime() + windowSeconds * 1000) },
    },
    { upsert: true, returnDocument: "after" },
  ).lean();

  if (doc && doc.count > max) {
    const retry = Math.max(1, Math.ceil((doc.expiresAt.getTime() - now.getTime()) / 1000));
    throw new HttpError(429, `Trop de tentatives. Réessayez dans ${Math.ceil(retry / 60)} min.`);
  }
}

/** Remet un compteur à zéro (ex. après une connexion réussie). */
export async function resetRateLimit(cle: string): Promise<void> {
  await connectDb();
  await RateLimit.deleteOne({ cle });
}
