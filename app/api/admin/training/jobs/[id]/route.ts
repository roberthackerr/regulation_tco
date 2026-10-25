import { after } from "next/server";
import { requireUser } from "@/lib/auth/dal";
import { HttpError, assertObjectId, handler } from "@/lib/http";
import { advanceJob } from "@/lib/training/run";
import { serializeJob } from "@/lib/training/serialize";
import { JOB_ACTIVE, TrainingJob } from "@/models/TrainingJob";

/** GET /api/admin/training/jobs/:id — état d'un entraînement ; fait avancer la tâche en arrière-plan. */
export const GET = handler(async (_req: Request, ctx: RouteContext<"/api/admin/training/jobs/[id]">) => {
  await requireUser("admin");
  const { id } = await ctx.params;
  assertObjectId(id);
  const job = await TrainingJob.findById(id).lean();
  if (!job) throw new HttpError(404, "Entraînement introuvable.");
  if (JOB_ACTIVE.includes(job.status as never)) after(() => advanceJob(id));
  return Response.json(serializeJob(job, true));
});
