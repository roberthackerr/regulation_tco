import "server-only";
import { AuditLog } from "@/models/AuditLog";

/** Enregistre une action dans le journal d'audit. N'échoue jamais la requête appelante. */
export async function audit(
  userId: string | null,
  action: string,
  cible: string | null = null,
  details: unknown = null,
): Promise<void> {
  try {
    await AuditLog.create({ userId, action, cible, details });
  } catch (err) {
    console.error("[audit] échec d'écriture :", err);
  }
}
