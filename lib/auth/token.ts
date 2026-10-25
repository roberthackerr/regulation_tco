/**
 * Création et vérification du jeton de session (JWT signé HS256).
 * Ce fichier n'importe ni la base de données ni `next/headers` :
 * il est utilisable dans `proxy.ts` comme dans les routes API.
 */
import { SignJWT, jwtVerify } from "jose";
import type { OperatorCode, Role } from "@/lib/constants";

export const SESSION_COOKIE = "artec_session";
export const SESSION_DURATION_SECONDS = 8 * 60 * 60; // 8 heures

export type SessionPayload = {
  sub: string; // id de l'utilisateur
  role: Role;
  operatorId: string | null;
  operatorCode: OperatorCode | null;
};

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET manquant ou trop court (32 caractères minimum).");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    role: payload.role,
    operatorId: payload.operatorId,
    operatorCode: payload.operatorCode,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecret());
}

/** Retourne le contenu du jeton, ou null s'il est absent, invalide ou expiré. */
export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    if (!payload.sub || (payload.role !== "admin" && payload.role !== "operator")) return null;
    return {
      sub: payload.sub,
      role: payload.role,
      operatorId: (payload.operatorId as string | null) ?? null,
      operatorCode: (payload.operatorCode as OperatorCode | null) ?? null,
    };
  } catch {
    return null;
  }
}

/** Page d'accueil de chaque rôle après connexion. */
export function homeForRole(role: Role): string {
  return role === "admin" ? "/admin" : "/operateur";
}
