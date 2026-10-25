import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { connectDb } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { buildMeta, loadRows, rowsToCsv } from "@/lib/datasets/csv";
import {
  KaggleError,
  datasetStatus,
  datasetVersionNumber,
  fetchJson,
  kaggleConfig,
  kernelOutput,
  kernelStatus,
  parseKernelLog,
  publishDataset,
  pushKernel,
  uploadBlob,
} from "@/lib/kaggle/client";
import type { Preprocess, Weights } from "@/lib/ml/predict";
import { DatasetVersion } from "@/models/DatasetVersion";
import { MlModel } from "@/models/MlModel";
import { JOB_ACTIVE, TrainingJob, type JobStatus } from "@/models/TrainingJob";

/**
 * Orchestration d'un entraînement sur Kaggle, entièrement dans Next.js.
 *
 * Pas de processus en tâche de fond qui tourne pendant 20 minutes : la tâche est une
 * petite machine à états en base. Chaque consultation de son statut (l'interface
 * interroge toutes les quelques secondes) la fait avancer d'un cran, sous verrou.
 * Un redémarrage du serveur ne perd donc rien : on reprend là où on en était.
 */

const LOCK_MS = 90_000;
/** Délais minimum entre deux appels de statut à Kaggle, par phase. */
const THROTTLE_MS: Partial<Record<JobStatus, number>> = { attente_dataset: 6_000, entrainement: 8_000 };
/** Kaggle annonce parfois « ready » juste après l'envoi, avant d'avoir pris la nouvelle version en compte. */
const MIN_DATASET_WAIT_MS = 15_000;
const TRAIN_SCRIPT = path.join(process.cwd(), "kaggle", "train.py");

type Metrics = { mae: number; dataset_checksum?: string } & Record<string, unknown>;

export async function createJob(userId: string, datasetVersionId?: string | null) {
  await connectDb();
  const cfg = kaggleConfig();
  if (!cfg.configured) {
    throw new HttpError(400, "Kaggle n'est pas configuré : renseignez KAGGLE_USERNAME et KAGGLE_API_TOKEN dans .env, puis redémarrez le serveur.");
  }
  const running = await TrainingJob.findOne({ status: { $in: JOB_ACTIVE } }, { _id: 1 }).lean();
  if (running) return { jobId: String(running._id), created: false };

  const v = datasetVersionId
    ? await DatasetVersion.findById(datasetVersionId, { version: 1, nbEtiquetees: 1 }).lean()
    : await DatasetVersion.findOne({}, { version: 1, nbEtiquetees: 1 }).sort({ version: -1 }).lean();
  if (!v) throw new HttpError(400, "Aucune version du dataset : lancez d'abord le pipeline.");
  if (v.nbEtiquetees < 50) throw new HttpError(400, `Le dataset v${v.version} n'a que ${v.nbEtiquetees} lignes étiquetées : pas assez pour entraîner un modèle. Il faut des avis réels (formulaire public, veille) rattachés à des indicateurs réels importés par les opérateurs.`);

  const job = await TrainingJob.create({
    datasetVersionId: v._id,
    datasetVersion: v.version,
    triggeredBy: userId,
    gpu: cfg.gpu,
    phases: { envoi_dataset: new Date() },
    logs: [{ at: new Date(), msg: `Entraînement demandé sur le dataset v${v.version}${cfg.gpu ? " (GPU)" : " (CPU)"}.` }],
  });
  return { jobId: String(job._id), created: true };
}

const log = (msg: string) => ({ $push: { logs: { at: new Date(), msg } } });

async function moveTo(id: unknown, status: JobStatus, msg: string, extra: Record<string, unknown> = {}) {
  const final = status === "termine" || status === "echec";
  await TrainingJob.updateOne(
    { _id: id },
    {
      $set: { status, [`phases.${status}`]: new Date(), ...(final ? { finishedAt: new Date() } : {}), ...extra },
      ...log(msg),
    },
  );
}

/** Fait avancer la tâche d'une étape si possible. Sans effet si une autre requête s'en occupe déjà. */
export async function advanceJob(jobId: string): Promise<void> {
  await connectDb();
  const now = new Date();
  const job = await TrainingJob.findOneAndUpdate(
    { _id: jobId, status: { $in: JOB_ACTIVE }, $or: [{ lockedUntil: null }, { lockedUntil: { $lt: now } }] },
    { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS) } },
    { returnDocument: "after" },
  ).lean();
  if (!job) return;

  try {
    const throttle = THROTTLE_MS[job.status as JobStatus];
    if (throttle && job.checkedAt && now.getTime() - new Date(job.checkedAt).getTime() < throttle) return;

    const cfg = kaggleConfig();
    const elapsedMin = (now.getTime() - new Date(job.startedAt).getTime()) / 60_000;
    if (elapsedMin > cfg.timeoutMinutes) {
      await moveTo(job._id, "echec", `Abandon : plus de ${cfg.timeoutMinutes} minutes sans résultat.`, { error: "Délai dépassé." });
      return;
    }

    switch (job.status as JobStatus) {
      case "envoi_dataset": {
        const v = await DatasetVersion.findById(job.datasetVersionId, { version: 1, features: 1, scaler: 1, checksum: 1 }).lean();
        if (!v) throw new Error("Version du dataset introuvable.");
        const rows = await loadRows(v._id);
        if (!rows.length) throw new Error(`Les lignes du dataset v${v.version} ont été purgées.`);
        const csv = rowsToCsv(v, rows);
        const before = await datasetVersionNumber();
        await TrainingJob.updateOne({ _id: job._id }, log(`Envoi de dataset.csv (${rows.length} lignes, ${(csv.length / 1024).toFixed(0)} Ko) et meta.json vers Kaggle…`));
        const files = [
          { name: "dataset.csv", token: await uploadBlob("dataset.csv", csv, "text/csv") },
          { name: "meta.json", token: await uploadBlob("meta.json", JSON.stringify(buildMeta(v)), "application/json") },
        ];
        const { created } = await publishDataset(files, `Dataset v${v.version} · ${v.checksum.slice(0, 12)} · ${rows.length} lignes`);
        await moveTo(job._id, "attente_dataset", created ? `Dataset créé sur Kaggle (${cfg.datasetRef}, privé). Traitement par Kaggle…` : `Nouvelle version du dataset publiée sur ${cfg.datasetRef}. Traitement par Kaggle…`, {
          kaggleDatasetVersion: before,
        });
        return;
      }

      case "attente_dataset": {
        await TrainingJob.updateOne({ _id: job._id }, { $set: { checkedAt: now } });
        const sinceSent = now.getTime() - new Date((job.phases as Record<string, Date>)?.attente_dataset ?? job.startedAt).getTime();
        const status = await datasetStatus();
        await TrainingJob.updateOne({ _id: job._id }, { $set: { kaggleStatus: status } });
        if (status === "error") throw new Error("Kaggle n'a pas pu traiter le dataset.");
        // Toujours introuvable 10 min après la publication : vrai problème de droits ou de nom.
        if (status === null && sinceSent > 10 * 60_000) {
          throw new Error(`Kaggle ne trouve toujours pas le dataset ${cfg.datasetRef} : vérifiez que KAGGLE_USERNAME correspond bien au compte du jeton.`);
        }
        if (status !== "ready" || sinceSent < MIN_DATASET_WAIT_MS) return;
        const before = job.kaggleDatasetVersion;
        const current = await datasetVersionNumber();
        // Tant que Kaggle expose l'ancienne version, on attend (sinon le notebook lirait d'anciennes données).
        if (before != null && current != null && current <= before && sinceSent < 5 * 60_000) return;

        const source = await readFile(TRAIN_SCRIPT, "utf-8");
        const { versionNumber } = await pushKernel(source);
        await moveTo(job._id, "entrainement", `Dataset prêt${current ? ` (version Kaggle ${current})` : ""}. Notebook ${cfg.kernelRef} lancé${versionNumber ? ` (version ${versionNumber})` : ""}.`, {
          kaggleDatasetVersion: current,
          kaggleKernelVersion: versionNumber,
          kaggleStatus: "queued",
          checkedAt: now,
        });
        return;
      }

      case "entrainement": {
        await TrainingJob.updateOne({ _id: job._id }, { $set: { checkedAt: now } });
        const { status, raw, failure } = await kernelStatus();
        if (raw !== job.kaggleStatus) {
          const label = status === "queued" ? "En file d'attente chez Kaggle…" : status === "running" ? "Entraînement en cours sur Kaggle…" : `Statut Kaggle : ${raw}`;
          await TrainingJob.updateOne({ _id: job._id }, { $set: { kaggleStatus: raw }, ...log(label) });
        }
        if (status === "complete") {
          await moveTo(job._id, "recuperation", "Exécution terminée. Récupération du modèle…");
        } else if (status === "error" || status === "cancelled") {
          const out = await kernelOutput().catch(() => ({ log: "", files: [] }));
          const lines = parseKernelLog(out.log);
          const last = lines.filter((l) => /error|exception/i.test(l)).at(-1);
          await moveTo(job._id, "echec", `Le notebook a échoué${failure ? ` : ${failure}` : ""}.`, {
            error: failure ?? last ?? "Échec de l'exécution sur Kaggle.",
            kernelLog: lines.slice(-300),
          });
        }
        return;
      }

      case "recuperation": {
        const out = await kernelOutput();
        const lines = parseKernelLog(out.log);
        const file = (n: string) => out.files.find((f) => f.fileName === n || f.fileName.endsWith("/" + n));
        const m = file("metrics.json");
        const p = file("preprocess.json");
        const w = file("weights.json");
        if (!m || !p || !w) {
          throw new Error(`Fichiers de sortie manquants (${["metrics.json", "preprocess.json", "weights.json"].filter((n) => !file(n)).join(", ")}).`);
        }
        const [metrics, preprocess, weights] = await Promise.all([fetchJson<Metrics>(m.url), fetchJson<Preprocess>(p.url), fetchJson<Weights>(w.url)]);

        const v = await DatasetVersion.findById(job.datasetVersionId, { checksum: 1, stats: 1 }).lean();
        if (v && metrics.dataset_checksum && metrics.dataset_checksum !== v.checksum) {
          throw new Error("Kaggle a entraîné le modèle sur une autre version du dataset (empreinte différente). Relancez l'entraînement.");
        }
        const stats = (v?.stats ?? {}) as Record<string, { min: number; max: number; mediane: number; moyenne: number }>;
        const ranges = Object.fromEntries(preprocess.features.filter((f) => stats[f]).map((f) => [f, { min: stats[f].min, max: stats[f].max, mediane: stats[f].mediane ?? stats[f].moyenne }]));

        const last = await MlModel.findOne({}, { version: 1 }).sort({ version: -1 }).lean();
        const active = await MlModel.findOne({ active: true }, { metrics: 1, version: 1 }).lean();
        const better = !active || metrics.mae <= Number((active.metrics as Metrics).mae);
        if (better && active) await MlModel.updateOne({ _id: active._id }, { $set: { active: false } });
        const model = await MlModel.create({
          version: (last?.version ?? 0) + 1,
          jobId: job._id,
          datasetVersionId: job.datasetVersionId,
          datasetVersion: job.datasetVersion,
          active: better,
          metrics,
          preprocess,
          weights,
          ranges,
        });
        await DatasetVersion.updateOne({ _id: job.datasetVersionId }, { $set: { kaggleVersion: job.kaggleDatasetVersion ?? null } });
        await moveTo(
          job._id,
          "termine",
          `Modèle v${model.version} enregistré · MAE ${metrics.mae.toFixed(2)} pts${better ? (active ? ` — meilleur que v${active.version}, activé.` : " — activé.") : ` — moins bon que le modèle actif v${active!.version}, conservé sans activation.`}`,
          { modelId: model._id, kernelLog: lines.slice(-300) },
        );
        return;
      }
    }
  } catch (err) {
    const transient = err instanceof KaggleError ? (err.status ?? 0) >= 500 || err.status === 429 : err instanceof TypeError || (err as Error).name === "TimeoutError";
    const msg = (err as Error).message;
    if (transient && job.status !== "envoi_dataset") {
      await TrainingJob.updateOne({ _id: job._id }, log(`Kaggle ne répond pas (${msg}) — nouvel essai dans quelques secondes.`));
    } else {
      console.error("[training] échec :", err);
      await moveTo(job._id, "echec", `Échec : ${msg}`, { error: msg });
    }
  } finally {
    await TrainingJob.updateOne({ _id: job._id }, { $set: { lockedUntil: null } });
  }
}
