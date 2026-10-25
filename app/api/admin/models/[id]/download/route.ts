import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/auth/dal";
import { HttpError, assertObjectId, handler } from "@/lib/http";
import { kaggleConfig, kernelOutput } from "@/lib/kaggle/client";
import { MlModel } from "@/models/MlModel";

/**
 * GET /api/admin/models/:id/download?format=json|keras
 *  - json  : poids, préparation des entrées, métriques et plages (stockés dans MongoDB), toujours disponible ;
 *  - keras : model.keras complet (TensorFlow), récupéré dans la sortie du notebook Kaggle.
 *    Kaggle ne garde accessible que la sortie de la DERNIÈRE exécution : seulement pour le modèle le plus récent.
 */
export const GET = handler(async (req: Request, ctx: RouteContext<"/api/admin/models/[id]/download">) => {
  const admin = await requireUser("admin");
  const { id } = await ctx.params;
  assertObjectId(id);
  const format = new URL(req.url).searchParams.get("format") === "keras" ? "keras" : "json";
  const m = await MlModel.findById(id).lean();
  if (!m) throw new HttpError(404, "Modèle introuvable.");

  if (format === "keras") {
    const latest = await MlModel.findOne({}, { version: 1 }).sort({ version: -1 }).lean();
    if (latest && latest.version !== m.version) {
      throw new HttpError(409, `Le fichier .keras n'est disponible que pour le dernier modèle (v${latest.version}) : Kaggle ne conserve que la sortie de la dernière exécution. Le format JSON reste téléchargeable.`);
    }
    if (!kaggleConfig().configured) throw new HttpError(400, "Kaggle n'est pas configuré.");
    const { files } = await kernelOutput();
    const f = files.find((x) => x.fileName.endsWith("model.keras"));
    if (!f) throw new HttpError(404, "model.keras introuvable dans la sortie du notebook Kaggle.");
    await audit(admin.id, "model_download", id, { format, version: m.version });
    return Response.redirect(f.url, 302); // URL signée temporaire fournie par Kaggle
  }

  const bundle = {
    format: "observatoire-telecom-mlp/1",
    version: m.version,
    datasetVersion: m.datasetVersion,
    createdAt: (m as unknown as { createdAt: Date }).createdAt,
    architecture: "entrée → Dense(64, relu) → Dense(32, relu) → { score: Dense(1, sigmoïde) × 100, classe: Dense(3, softmax) }",
    usage: "Encoder l'entrée comme preprocess (features centrées-réduites, indicateurs de valeur manquante, one-hot operateur/service/region), puis appliquer les couches de weights dans l'ordre d1 → d2 → score / classe. Implémentation de référence : lib/ml/predict.ts.",
    metrics: m.metrics,
    preprocess: m.preprocess,
    ranges: m.ranges,
    weights: m.weights,
  };
  await audit(admin.id, "model_download", id, { format, version: m.version });
  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="modele-satisfaction-v${m.version}.json"`,
    },
  });
});
