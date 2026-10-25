import { after } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { handler, readJson } from "@/lib/http";
import { kaggleConfig } from "@/lib/kaggle/client";
import { advanceJob, createJob } from "@/lib/training/run";
import { serializeJob, serializeModelSummary } from "@/lib/training/serialize";
import { DatasetVersion } from "@/models/DatasetVersion";
import { MlModel } from "@/models/MlModel";
import { JOB_ACTIVE, TrainingJob } from "@/models/TrainingJob";

/** GET /api/admin/training — configuration Kaggle, tâche en cours, historique, modèles. */
export const GET = handler(async () => {
  await requireUser("admin");
  const cfg = kaggleConfig();
  const [jobs, models, versions] = await Promise.all([
    TrainingJob.find().sort({ startedAt: -1 }).limit(20).lean(),
    MlModel.find({}, { weights: 0, preprocess: 0, ranges: 0 }).sort({ version: -1 }).limit(30).lean(),
    DatasetVersion.find({}, { version: 1, nbEtiquetees: 1, nbLignes: 1, createdAt: 1, kaggleVersion: 1 }).sort({ version: -1 }).limit(10).lean(),
  ]);
  const current = jobs[0] ?? null;
  if (current && JOB_ACTIVE.includes(current.status as never)) after(() => advanceJob(String(current._id)));

  return Response.json({
    config: {
      configured: cfg.configured,
      hasCredentials: cfg.hasCredentials,
      username: cfg.username || null,
      gpu: cfg.gpu,
      datasetRef: cfg.username ? cfg.datasetRef : null,
      kernelRef: cfg.username ? cfg.kernelRef : null,
      datasetUrl: cfg.datasetUrl,
      kernelUrl: cfg.kernelUrl,
    },
    current: current ? serializeJob(current, true) : null,
    jobs: jobs.map((j) => serializeJob(j)),
    models: models.map(serializeModelSummary),
    versions: versions.map((v) => ({ id: String(v._id), version: v.version, nbEtiquetees: v.nbEtiquetees, nbLignes: v.nbLignes, kaggleVersion: v.kaggleVersion ?? null })),
  });
});

const StartSchema = z.object({ datasetVersionId: z.string().regex(/^[a-f0-9]{24}$/i).nullish() });

/** POST /api/admin/training — lance un entraînement sur Kaggle (un seul à la fois). */
export const POST = handler(async (req: Request) => {
  const admin = await requireUser("admin");
  const raw = await req.text();
  const body = StartSchema.parse(raw ? await readJson(new Request(req.url, { method: "POST", body: raw })) : {});
  const { jobId, created } = await createJob(admin.id, body.datasetVersionId);
  after(() => advanceJob(jobId));
  if (created) await audit(admin.id, "training_start", jobId, { datasetVersionId: body.datasetVersionId ?? "dernier" });
  return Response.json({ jobId, created }, { status: created ? 202 : 200 });
});
