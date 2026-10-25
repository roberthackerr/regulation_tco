import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { assertObjectId, handler, readJson } from "@/lib/http";
import { rejectImport } from "@/lib/imports";

const Body = z.object({
  reason: z.string().trim().min(3, { error: "Indiquez le motif du refus." }).max(500),
});

/** POST /api/admin/imports/:id/reject — l'admin refuse un import reçu, avec un motif. */
export const POST = handler(async (req: Request, ctx: RouteContext<"/api/admin/imports/[id]/reject">) => {
  const admin = await requireUser("admin");
  const { id } = await ctx.params;
  assertObjectId(id);
  const { reason } = Body.parse(await readJson(req));

  const imp = await rejectImport(id, admin.id, reason);
  await audit(admin.id, "import_reject", id, { fileName: imp.fileName, reason });
  return Response.json({ ok: true, status: "rejete" });
});
