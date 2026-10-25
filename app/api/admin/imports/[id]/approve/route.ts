import { after } from "next/server";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { assertObjectId, handler } from "@/lib/http";
import { approveImport } from "@/lib/imports";
import { triggerPipeline } from "@/lib/pipeline/run";

/** POST /api/admin/imports/:id/approve — l'admin valide un import reçu, puis le pipeline se lance. */
export const POST = handler(async (_req: Request, ctx: RouteContext<"/api/admin/imports/[id]/approve">) => {
  const admin = await requireUser("admin");
  const { id } = await ctx.params;
  assertObjectId(id);

  const imp = await approveImport(id, admin.id);
  await audit(admin.id, "import_approve", id, { fileName: imp.fileName });
  // Traitement en arrière-plan, après l'envoi de la réponse.
  after(() => triggerPipeline("auto", admin.id).catch((e) => console.error("[pipeline] lancement :", e)));
  return Response.json({ ok: true, status: "valide", pipeline: true });
});
