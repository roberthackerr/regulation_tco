import "server-only";

/**
 * Conversion des documents MongoDB en objets JSON simples pour les réponses API.
 * On ne renvoie jamais un document brut : seuls les champs listés ici sortent.
 */

type Ref = { _id: unknown; code?: string; email?: string; nom?: string } | unknown;

function refCode(ref: Ref): string | null {
  return ref && typeof ref === "object" && "code" in ref ? String(ref.code) : null;
}
function refEmail(ref: Ref): string | null {
  return ref && typeof ref === "object" && "email" in ref ? String(ref.email) : null;
}

export function serializeUser(u: {
  _id: unknown;
  email: string;
  nom: string;
  role: string;
  operatorId?: Ref;
  actif: boolean;
  lastLogin?: Date | null;
  createdAt?: Date;
}) {
  return {
    id: String(u._id),
    email: u.email,
    nom: u.nom,
    role: u.role,
    operatorCode: refCode(u.operatorId),
    actif: u.actif,
    lastLogin: u.lastLogin ?? null,
    createdAt: u.createdAt ?? null,
  };
}

export function serializeImport(
  i: {
    _id: unknown;
    operatorId: Ref;
    userId: Ref;
    fileName: string;
    fileSize: number;
    status: string;
    rowCount: number;
    errorCount: number;
    warningCount: number;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    reviewedBy?: Ref;
    reviewedAt?: Date | null;
    rejectReason?: string | null;
    createdAt?: Date;
    erreurs?: unknown[];
    avertissements?: unknown[];
  },
  withIssues = false,
) {
  return {
    id: String(i._id),
    operatorCode: refCode(i.operatorId),
    uploadedBy: refEmail(i.userId),
    fileName: i.fileName,
    fileSize: i.fileSize,
    status: i.status,
    rowCount: i.rowCount,
    errorCount: i.errorCount,
    warningCount: i.warningCount,
    periodStart: i.periodStart ?? null,
    periodEnd: i.periodEnd ?? null,
    reviewedBy: refEmail(i.reviewedBy),
    reviewedAt: i.reviewedAt ?? null,
    rejectReason: i.rejectReason ?? null,
    createdAt: i.createdAt ?? null,
    ...(withIssues ? { erreurs: i.erreurs ?? [], avertissements: i.avertissements ?? [] } : {}),
  };
}
