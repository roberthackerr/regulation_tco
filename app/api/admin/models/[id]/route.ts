import { requireUser } from "@/lib/auth/dal";
import { HttpError, handler } from "@/lib/http";
import { serializeModel } from "@/lib/training/serialize";
import { MlModel } from "@/models/MlModel";

/** GET /api/admin/models/:id — modèle complet (métriques, poids) ; « actif » pour le modèle en service. */
export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/admin/models/[id]">) => {
  await requireUser("admin");
  const { id } = await ctx.params;
  if (id !== "actif" && !/^[a-f0-9]{24}$/i.test(id)) throw new HttpError(400, "Identifiant invalide.");
  const m = id === "actif" ? await MlModel.findOne({ active: true }).lean() : await MlModel.findById(id).lean();
  if (!m) throw new HttpError(404, id === "actif" ? "Aucun modèle actif pour l'instant." : "Modèle introuvable.");
  return Response.json(serializeModel(m));
});
