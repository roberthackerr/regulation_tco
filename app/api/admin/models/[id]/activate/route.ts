import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { HttpError, assertObjectId, handler } from "@/lib/http";
import { MlModel } from "@/models/MlModel";

/** POST /api/admin/models/:id/activate — met ce modèle en service (retour arrière possible). */
export const POST = handler(async (_req: Request, ctx: RouteContext<"/api/admin/models/[id]/activate">) => {
  const admin = await requireUser("admin");
  const { id } = await ctx.params;
  assertObjectId(id);
  const m = await MlModel.findById(id, { version: 1 }).lean();
  if (!m) throw new HttpError(404, "Modèle introuvable.");
  await MlModel.updateMany({ active: true, _id: { $ne: m._id } }, { $set: { active: false } });
  await MlModel.updateOne({ _id: m._id }, { $set: { active: true } });
  await audit(admin.id, "model_activate", id, { version: m.version });
  return Response.json({ ok: true, version: m.version });
});
