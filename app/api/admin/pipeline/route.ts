import { after } from "next/server";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { handler } from "@/lib/http";
import { createRun, executeRun } from "@/lib/pipeline/run";
import { serializeRun, serializeVersion } from "@/lib/pipeline/serialize";
import { DatasetVersion } from "@/models/DatasetVersion";
import { Feedback } from "@/models/Feedback";
import { Import } from "@/models/Import";
import { OperatorMetric } from "@/models/OperatorMetric";
import { PipelineRun } from "@/models/PipelineRun";

/**
 * GET /api/admin/pipeline — état du pipeline : dernier passage (avec journal),
 * historique, versions du dataset, sources de données.
 */
export const GET = handler(async () => {
  await requireUser("admin");

  const [runs, versions, aTraiter, lignes, avis, avisAnalyses] = await Promise.all([
    PipelineRun.find().sort({ startedAt: -1 }).limit(15).lean(),
    DatasetVersion.find({}, { stats: 0, correlations: 0, scaler: 0 }).sort({ version: -1 }).limit(30).lean(),
    Import.countDocuments({ status: "valide" }),
    OperatorMetric.estimatedDocumentCount(),
    Feedback.countDocuments({ status: "publie" }),
    Feedback.countDocuments({ status: "publie", sentiment: { $ne: null } }),
  ]);

  const versionOf = new Map(versions.map((v) => [String(v._id), v.version]));
  const missing = runs.filter((r) => r.datasetVersionId && !versionOf.has(String(r.datasetVersionId))).map((r) => r.datasetVersionId);
  if (missing.length) {
    for (const v of await DatasetVersion.find({ _id: { $in: missing } }, { version: 1 }).lean()) versionOf.set(String(v._id), v.version);
  }
  const vnum = (id: unknown) => (id ? versionOf.get(String(id)) ?? null : null);

  return Response.json({
    current: runs[0] ? serializeRun(runs[0], vnum(runs[0].datasetVersionId), true) : null,
    runs: runs.map((r) => serializeRun(r, vnum(r.datasetVersionId))),
    versions: versions.map(serializeVersion),
    sources: { aTraiter, lignes, avis, avisAnalyses },
  });
});

/** POST /api/admin/pipeline — lancement manuel d'un passage (exécuté en arrière-plan). */
export const POST = handler(async () => {
  const admin = await requireUser("admin");
  const { runId, created } = await createRun("manuel", admin.id);
  if (created) {
    after(() => executeRun(runId));
    await audit(admin.id, "pipeline_run", runId);
  }
  return Response.json({ runId, created }, { status: created ? 202 : 200 });
});
