import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { connectDb } from "@/lib/db";
import { HttpError } from "@/lib/http";
import type { OperatorCode, Role } from "@/lib/constants";
import { User } from "@/models/User";
import "@/models/Operator"; // enregistre le modèle pour populate()
import { SESSION_COOKIE, SESSION_DURATION_SECONDS, verifySession } from "./token";

/**
 * Couche d'accès aux données d'authentification (Data Access Layer).
 * C'est ici, et non dans proxy.ts, que l'accès est réellement contrôlé :
 * chaque route API appelle `requireUser()` avec les rôles autorisés.
 */

export type CurrentUser = {
  id: string;
  email: string;
  nom: string;
  role: Role;
  operatorId: string | null;
  operatorCode: OperatorCode | null;
};

/**
 * Utilisateur connecté, ou null.
 * Le compte est relu en base : un compte désactivé perd l'accès immédiatement,
 * même si son jeton n'a pas encore expiré.
 * `cache` évite de relire la base plusieurs fois pendant le rendu d'une même page.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) return null;

  await connectDb();
  const user = await User.findById(session.sub).populate<{ operatorId: { _id: unknown; code: OperatorCode } | null }>("operatorId", "code").lean();
  if (!user || !user.actif) return null;

  return {
    id: String(user._id),
    email: user.email,
    nom: user.nom,
    role: user.role as Role,
    operatorId: user.operatorId ? String(user.operatorId._id) : null,
    operatorCode: user.operatorId?.code ?? null,
  };
});

/** Exige un utilisateur connecté ayant l'un des rôles donnés (401 sinon, 403 si mauvais rôle). */
export async function requireUser(...roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Authentification requise.");
  if (roles.length > 0 && !roles.includes(user.role)) {
    throw new HttpError(403, "Accès refusé pour ce rôle.");
  }
  if (user.role === "operator" && !user.operatorId) {
    throw new HttpError(403, "Ce compte opérateur n'est rattaché à aucun opérateur.");
  }
  return user;
}

export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // inaccessible au JavaScript du navigateur
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
