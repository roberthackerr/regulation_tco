import { requireUser } from "@/lib/auth/dal";
import { HttpError, assertObjectId, handler } from "@/lib/http";
import { importScope } from "@/lib/imports";
import { serializeImport } from "@/lib/serialize";
import { Import } from "@/models/Import";
import "@/models/Operator";
import "@/models/User";

/** GET /api/imports/:id — détail d'un import avec ses erreurs et avertissements. */
export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/imports/[id]">) => {
  const user = await requireUser("admin", "operator");
  const { id } = await ctx.params;
  assertObjectId(id);

  // Le filtre de portée garantit qu'un opérateur ne lit pas l'import d'un autre (404 et non 403,
  // pour ne pas révéler l'existence de l'import).
  const imp = await Import.findOne({ _id: id, ...importScope(user) })
    .populate("operatorId", "code")
    .populate("userId", "email")
    .populate("reviewedBy", "email")
    .lean();
  if (!imp) throw new HttpError(404, "Import introuvable.");

  return Response.json({ import: serializeImport(imp, true) });
});
