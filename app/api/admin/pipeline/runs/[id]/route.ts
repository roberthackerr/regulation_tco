import { requireUser } from "@/lib/auth/dal";
import { HttpError, assertObjectId, handler } from "@/lib/http";
import { serializeRun } from "@/lib/pipeline/serialize";
import { DatasetVersion } from "@/models/DatasetVersion";
import { PipelineRun } from "@/models/PipelineRun";

/** GET /api/admin/pipeline/runs/:id — un passage avec le journal de chaque étape (suivi en direct). */
export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/admin/pipeline/runs/[id]">) => {
  await requireUser("admin");
  const { id } = await ctx.params;
  assertObjectId(id);
  const run = await PipelineRun.findById(id).lean();
  if (!run) throw new HttpError(404, "Passage introuvable.");
  const v = run.datasetVersionId ? await DatasetVersion.findById(run.datasetVersionId, { version: 1 }).lean() : null;
  return Response.json(serializeRun(run, v?.version ?? null, true));
});
