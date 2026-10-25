import "server-only";
import { Types } from "mongoose";
import type { CurrentUser } from "@/lib/auth/dal";
import { isOperatorCode, type OperatorCode } from "@/lib/constants";
import { HttpError } from "@/lib/http";
import { Operator } from "@/models/Operator";

/**
 * Opérateur concerné par une requête : un opérateur obtient toujours le sien,
 * l'admin le choisit avec ?operator=YAS.
 */
export async function resolveOperator(user: CurrentUser, req: Request): Promise<{ operatorId: Types.ObjectId; code: OperatorCode }> {
  if (user.role === "operator") return { operatorId: new Types.ObjectId(user.operatorId!), code: user.operatorCode! };
  const code = new URL(req.url).searchParams.get("operator");
  if (!isOperatorCode(code)) throw new HttpError(400, "Paramètre ?operator requis (YAS, ORANGE ou AIRTEL).");
  const op = await Operator.findOne({ code }).select("_id").lean();
  if (!op) throw new HttpError(404, "Opérateur introuvable.");
  return { operatorId: op._id, code };
}
