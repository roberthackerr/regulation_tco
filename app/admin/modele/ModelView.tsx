"use client";

import {
  AlertTriangle,
  BrainCircuit,
  Check,
  CloudUpload,
  Cpu,
  DatabaseZap,
  Download,
  ExternalLink,
  History,
  KeyRound,
  LoaderCircle,
  Play,
  Target,
  Terminal,
  Trophy,
  Wand2,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Card, Empty, PageSkeleton, Select, Stat, Table, btn, cx, td, tdNum } from "@/components/ui";
import { useToast } from "@/components/ui-client";
import { fmtDuration } from "@/components/pipeline/bits";
import { ConfusionMatrix, ImportanceBars, LearningCurves } from "@/components/ml/Charts";
import { Simulator } from "@/components/ml/Simulator";
import { api, fmtDateTime, fmtNumber } from "@/lib/client/api";
import type { JobStatus, ModelDetail, ModelSummary, TrainingJobView, TrainingOverview } from "@/lib/client/types";

const POLL_MS = 3_000;
const ACTIVE: JobStatus[] = ["envoi_dataset", "attente_dataset", "entrainement", "recuperation"];

const JOB_STEPS: { key: JobStatus; label: string; detail: string; icon: LucideIcon }[] = [
  { key: "envoi_dataset", label: "Publication", detail: "dataset.csv + meta.json → Kaggle", icon: CloudUpload },
  { key: "attente_dataset", label: "Traitement Kaggle", detail: "Indexation de la nouvelle version", icon: DatabaseZap },
  { key: "entrainement", label: "Entraînement", detail: "Notebook TensorFlow sur Kaggle", icon: Cpu },
  { key: "recuperation", label: "Récupération", detail: "Poids et métriques → MongoDB", icon: Download },
];

export function ModelView() {
  const toast = useToast();
  const [data, setData] = useState<TrainingOverview | null>(null);
  const [job, setJob] = useState<TrainingJobView | null>(null);
  const [model, setModel] = useState<ModelDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string>("");
  const [starting, setStarting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadModel = useCallback(async (id = "actif") => {
    try {
      setModel(await api<ModelDetail>(`/api/admin/models/${id}`));
    } catch {
      if (id === "actif") setModel(null);
    }
  }, []);

  const load = useCallback(async () => {
    const d = await api<TrainingOverview>("/api/admin/training");
    setData(d);
    setJob(d.current);
    return d;
  }, []);

  const follow = useCallback(
    (id: string) => {
      if (timer.current) clearTimeout(timer.current);
      const tick = async () => {
        try {
          const j = await api<TrainingJobView>(`/api/admin/training/jobs/${id}`);
          setJob(j);
          if (ACTIVE.includes(j.status)) {
            timer.current = setTimeout(tick, POLL_MS);
          } else {
            await load();
            if (j.status === "termine") {
              toast.success(j.logs.at(-1)?.msg ?? "Entraînement terminé.");
              await loadModel(j.modelId ?? "actif");
            } else toast.error(`Entraînement échoué : ${j.error ?? "erreur inconnue"}`);
          }
        } catch {
          timer.current = setTimeout(tick, POLL_MS * 2);
        }
      };
      tick();
    },
    [load, loadModel, toast],
  );

  useEffect(() => {
    api<TrainingOverview>("/api/admin/training")
      .then((d) => {
        setData(d);
        setJob(d.current);
        if (d.current && ACTIVE.includes(d.current.status)) follow(d.current.id);
        if (d.models.length) loadModel(d.models.some((m) => m.active) ? "actif" : d.models[0].id);
      })
      .catch((e) => setError(e.message));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setStarting(true);
    try {
      const { jobId, created } = await api<{ jobId: string; created: boolean }>("/api/admin/training", { method: "POST", json: { datasetVersionId: versionId || null } });
      toast.success(created ? "Entraînement lancé : envoi du dataset à Kaggle…" : "Un entraînement est déjà en cours : suivi en direct.");
      follow(jobId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  async function activate(m: ModelSummary) {
    try {
      await api(`/api/admin/models/${m.id}/activate`, { method: "POST" });
      toast.success(`Modèle v${m.version} mis en service.`);
      await load();
      await loadModel(m.id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (error) return <Alert title="Impossible de charger le module d'entraînement">{error}</Alert>;
  if (!data) return <PageSkeleton />;

  const running = job != null && ACTIVE.includes(job.status);
  const latest = data.versions[0];
  const needsLabels = latest != null && latest.nbEtiquetees < 50;
  const { config } = data;
  const active = data.models.find((m) => m.active) ?? null;
  const gain = active?.mae != null && active.baselineMae ? (1 - active.mae / active.baselineMae) * 100 : null;

  return (
    <div className="space-y-6">
      {!config.configured && (
        <Alert tone="warn" title="Kaggle n'est pas encore configuré">
          {!config.username && (
            <>
              Ajoutez <code className="rounded bg-surface/70 px-1">KAGGLE_USERNAME=votre_pseudo</code> dans <code>.env</code>.{" "}
            </>
          )}
          {!config.hasCredentials && (
            <>
              Ajoutez <code className="rounded bg-surface/70 px-1">KAGGLE_API_TOKEN</code> (Kaggle → Settings → API → Create New Token).{" "}
            </>
          )}
          Puis redémarrez <code>npm run dev</code>.
        </Alert>
      )}

      {needsLabels && (
        <Alert
          tone="warn"
          title={`Le dataset v${latest.version} n'a que ${fmtNumber(latest.nbEtiquetees)} ligne${latest.nbEtiquetees > 1 ? "s" : ""} étiquetée${latest.nbEtiquetees > 1 ? "s" : ""}`}
          action={
            <Link href="/admin/veille" className={cx(btn.primary, btn.sm, "self-center")}>
              <Wand2 /> Collecter des avis réels
            </Link>
          }
        >
          La satisfaction (la cible du modèle) se calcule uniquement à partir d&apos;avis réels rattachés aux indicateurs : formulaire public « Donner mon avis » et publications de la veille qui citent une région. Il faut aussi des indicateurs réels importés par les opérateurs. Au moins 50 lignes étiquetées sont nécessaires pour entraîner.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Modèle en service" value={active ? `v${active.version}` : "—"} icon={BrainCircuit} accent="var(--color-brand)" hint={active ? `dataset v${active.datasetVersion} · ${fmtDateTime(active.createdAt)}` : "aucun modèle entraîné"} />
        <Stat
          label="Erreur moyenne (MAE)"
          value={active?.mae != null ? fmtNumber(active.mae, 2) : "—"}
          unit="pts"
          icon={Target}
          hint={gain != null ? <span className={gain > 0 ? "font-medium text-good-ink" : "text-bad-ink"}>{gain > 0 ? "−" : "+"}{fmtNumber(Math.abs(gain), 0)} % vs moyenne naïve</span> : "sur 100 points de satisfaction"}
        />
        <Stat label="Variance expliquée (R²)" value={active?.r2 != null ? fmtNumber(active.r2, 3) : "—"} icon={Trophy} hint="1 = prédiction parfaite" />
        <Stat label="Justesse des classes" value={active?.accuracy != null ? fmtNumber(active.accuracy * 100, 1) : "—"} unit="%" icon={Check} hint={active?.f1 != null ? `F1 macro ${fmtNumber(active.f1, 3)}` : "satisfait / neutre / insatisfait"} />
      </div>

      {/* Suivi Kaggle */}
      <Card
        padded={false}
        title={
          <span className="flex items-center gap-2">
            {running ? "Entraînement en cours sur Kaggle" : "Entraînement sur Kaggle"}
            {job && <JobBadge job={job} />}
          </span>
        }
        subtitle={
          job
            ? `Dataset v${job.datasetVersion} · ${job.gpu ? "GPU" : "CPU"} · démarré ${fmtDateTime(job.startedAt)}`
            : config.username
              ? `Compte Kaggle : ${config.username} · ${config.gpu ? "GPU activé" : "CPU (KAGGLE_ENABLE_GPU=true pour le GPU)"}`
              : "Jamais lancé"
        }
        actions={
          <>
            <Select value={versionId} onChange={(e) => setVersionId(e.target.value)} disabled={running} aria-label="Version du dataset">
              <option value="">Dernier dataset{data.versions[0] ? ` (v${data.versions[0].version})` : ""}</option>
              {data.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} · {fmtNumber(v.nbEtiquetees)} lignes étiquetées
                </option>
              ))}
            </Select>
            <button type="button" onClick={start} disabled={running || starting || !config.configured || !data.versions.length} className={btn.primary}>
              {running || starting ? <LoaderCircle className="animate-spin" /> : <Play />}
              {running ? "En cours…" : "Entraîner sur Kaggle"}
            </button>
          </>
        }
      >
        <div className="px-5 pb-5">
          <JobFlow job={job} />
        </div>
        {job && <JobConsole job={job} running={running} config={config} />}
      </Card>

      {model ? (
        <>
          <Simulator key={model.id} model={model} />
          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="Courbes d'apprentissage" subtitle={`${model.metrics.epochs} époques · arrêt anticipé sur la perte de validation · ${model.metrics.n_train} lignes d'entraînement, ${model.metrics.n_val} de validation`}>
              <LearningCurves history={model.metrics.history} />
            </Card>
            <Card title="Ce qui pèse sur la satisfaction" subtitle="Importance par permutation : hausse de l'erreur quand on brouille la variable">
              <ImportanceBars importance={model.metrics.importance} />
            </Card>
          </div>
          <div className="grid gap-6 xl:grid-cols-5">
            <Card className="xl:col-span-2" title="Matrice de confusion" subtitle={model.metrics.val_months.length ? `Validation temporelle : ${model.metrics.val_months.join(", ")}` : "Validation sur 20 % des lignes"}>
              <ConfusionMatrix confusion={model.metrics.confusion} classes={model.metrics.class_names} />
            </Card>
            <Card className="xl:col-span-3" title="Historique des modèles" subtitle="Un nouveau modèle n'est activé que s'il fait mieux que celui en service" padded={false}>
              <ModelTable models={data.models} shownId={model.id} onShow={(m) => loadModel(m.id)} onActivate={activate} />
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <Empty icon={BrainCircuit} title="Aucun modèle entraîné pour l'instant">
            Lancez un entraînement : le dataset part sur Kaggle, le notebook TensorFlow s&apos;exécute, et le modèle revient ici avec ses métriques et un simulateur interactif.
          </Empty>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Frise de l'entraînement */

type StepState = "attente" | "en_cours" | "termine" | "echec";

function stepStates(job: TrainingJobView | null): StepState[] {
  if (!job) return JOB_STEPS.map(() => "attente");
  if (job.status === "termine") return JOB_STEPS.map(() => "termine");
  const reached = JOB_STEPS.map((s) => Boolean(job.phases[s.key]));
  const current = job.status === "echec" ? reached.lastIndexOf(true) : JOB_STEPS.findIndex((s) => s.key === job.status);
  return JOB_STEPS.map((_, i) => (i < current ? "termine" : i === current ? (job.status === "echec" ? "echec" : "en_cours") : "attente"));
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function JobFlow({ job }: { job: TrainingJobView | null }) {
  const states = stepStates(job);
  const now = useNow(states.includes("en_cours"));
  const ts = (k: string | undefined) => (k && job?.phases[k as JobStatus] ? new Date(job.phases[k as JobStatus]!).getTime() : null);

  return (
    <ol className="flex flex-col gap-1 lg:flex-row lg:items-stretch">
      {JOB_STEPS.map((s, i) => {
        const st = states[i];
        const start = ts(s.key);
        const end = ts(JOB_STEPS[i + 1]?.key) ?? ts("termine") ?? (st === "echec" ? (job?.finishedAt ? new Date(job.finishedAt).getTime() : null) : null);
        const dur = start ? (st === "en_cours" ? now - start : end ? end - start : null) : null;
        const Icon = s.icon;
        const tone = { attente: "bg-sunken text-faint", en_cours: "bg-brand text-white pulse-ring", termine: "bg-good-soft text-good-ink", echec: "bg-bad-soft text-bad-ink" }[st];
        return (
          <li key={s.key} className="flex flex-col lg:flex-1 lg:flex-row lg:items-start">
            <div className="flex w-full items-center gap-3 rounded-xl px-2 py-2 lg:flex-col lg:px-1 lg:py-3 lg:text-center">
              <span className={cx("relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-colors", tone)}>
                {st === "en_cours" ? <Icon className="h-5 w-5 animate-pulse" /> : <Icon className="h-5 w-5" />}
                {st === "termine" && (
                  <span className="pop-in absolute -right-1 -bottom-1 grid h-5 w-5 place-items-center rounded-full bg-good text-white ring-2 ring-surface">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
                {st === "echec" && (
                  <span className="pop-in absolute -right-1 -bottom-1 grid h-5 w-5 place-items-center rounded-full bg-bad text-white ring-2 ring-surface">
                    <X className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-ink">{s.label}</span>
                <span className="block text-xs text-muted">{s.detail}</span>
                <span className="mt-0.5 block text-xs tabular-nums text-ink-2">
                  {dur != null ? fmtDuration(dur) : " "}
                  {st === "en_cours" && s.key === "entrainement" && job?.kaggleStatus && <span className="ml-1 text-brand">· {job.kaggleStatus}</span>}
                </span>
              </span>
            </div>
            {i < JOB_STEPS.length - 1 && (
              <svg className="mx-auto h-6 w-4 shrink-0 lg:mx-0 lg:mt-8 lg:h-4 lg:w-full lg:min-w-6" preserveAspectRatio="none" viewBox="0 0 100 10" aria-hidden>
                <line x1="0" y1="5" x2="100" y2="5" stroke={states[i] === "termine" ? "var(--color-good)" : "var(--color-line-strong)"} strokeWidth="2" vectorEffect="non-scaling-stroke" className={states[i + 1] === "en_cours" ? "flow-line" : undefined} />
              </svg>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function JobBadge({ job }: { job: TrainingJobView }) {
  if (job.status === "termine") return <Badge tone="good">Terminé</Badge>;
  if (job.status === "echec") return <Badge tone="bad">Échec</Badge>;
  return <Badge tone="brand">En cours</Badge>;
}

function JobConsole({ job, running, config }: { job: TrainingJobView; running: boolean; config: TrainingOverview["config"] }) {
  const [tab, setTab] = useState<"journal" | "kaggle">("journal");
  const ref = useRef<HTMLDivElement>(null);
  const lines = tab === "journal" ? job.logs.map((l) => ({ t: l.at, msg: l.msg })) : job.kernelLog.map((msg) => ({ t: null, msg }));
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [lines.length, tab]);

  return (
    <div className="border-t border-line">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5">
        <div className="flex items-center gap-1">
          {(["journal", "kaggle"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={cx("rounded-md px-2.5 py-1 text-xs font-medium", tab === t ? "bg-sunken text-ink" : "text-muted hover:text-ink")}>
              {t === "journal" ? "Journal" : `Sortie du notebook${job.kernelLog.length ? ` (${job.kernelLog.length})` : ""}`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 text-xs">
          {config.datasetUrl && (
            <a href={config.datasetUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
              Dataset Kaggle <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {config.kernelUrl && (
            <a href={config.kernelUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand hover:underline">
              Notebook Kaggle <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
      <div ref={ref} className="max-h-64 overflow-y-auto bg-[#0f1726] px-5 py-3 font-mono text-[12px] leading-relaxed text-[#cfd8e6]">
        {lines.length === 0 && (
          <div className="flex items-center gap-2 text-[#7f8ba0]">
            <Terminal className="h-3.5 w-3.5" />
            {tab === "kaggle" ? "La sortie du notebook est récupérée à la fin de l'exécution." : "En attente…"}
          </div>
        )}
        {lines.map((l, i) => (
          <div key={i} className="log-line whitespace-pre-wrap">
            {l.t && <span className="mr-2 text-[#7f8ba0]">{new Date(l.t).toLocaleTimeString("fr-FR")}</span>}
            <span className={/échec|error|exception/i.test(l.msg) ? "text-[#ff8a8a]" : /enregistré|activé|prêt/i.test(l.msg) ? "text-[#8be28b]" : undefined}>{l.msg}</span>
          </div>
        ))}
        {running && tab === "journal" && <div className="mt-1 h-3 w-2 animate-pulse bg-[#cfd8e6]" aria-hidden />}
      </div>
      {job.status === "echec" && job.error && (
        <div className="flex items-start gap-2 border-t border-line bg-bad-soft/60 px-5 py-3 text-[13px] text-bad-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{job.error}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Historique des modèles */

function ModelTable({ models, shownId, onShow, onActivate }: { models: ModelSummary[]; shownId: string; onShow: (m: ModelSummary) => void; onActivate: (m: ModelSummary) => void }) {
  if (!models.length) return <Empty icon={History} title="Aucun modèle" />;
  const best = Math.min(...models.map((m) => m.mae ?? Infinity));
  const latestVersion = Math.max(...models.map((m) => m.version));
  return (
    <div className="px-5">
      <Table head={["Modèle", "Dataset", "MAE", "R²", "Justesse", "Durée", ""]} align={["left", "left", "right", "right", "right", "right", "right"]}>
        {models.map((m) => (
          <tr key={m.id} className={cx("cursor-pointer transition-colors hover:bg-page", m.id === shownId && "bg-brand-soft/40")} onClick={() => onShow(m)}>
            <td className={td}>
              <span className="flex items-center gap-2 font-medium text-ink">
                v{m.version}
                {m.active && <Badge tone="good">En service</Badge>}
                {m.mae === best && models.length > 1 && <Trophy className="h-3.5 w-3.5 text-warn" aria-label="Meilleur" />}
              </span>
            </td>
            <td className={td}>v{m.datasetVersion}</td>
            <td className={tdNum}>{fmtNumber(m.mae, 2)}</td>
            <td className={tdNum}>{fmtNumber(m.r2, 3)}</td>
            <td className={tdNum}>{m.accuracy != null ? `${fmtNumber(m.accuracy * 100, 1)} %` : "—"}</td>
            <td className={tdNum}>
              {m.durationS != null ? fmtDuration(m.durationS * 1000) : "—"}
              {m.gpu && <span className="ml-1 text-[10px] font-semibold text-brand">GPU</span>}
            </td>
            <td className={tdNum}>
              <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <a href={`/api/admin/models/${m.id}/download?format=json`} className={cx(btn.ghost, "!py-1 !text-xs")} title="Poids, préparation des entrées et métriques (JSON)">
                  <Download /> JSON
                </a>
                {m.version === latestVersion && (
                  <a href={`/api/admin/models/${m.id}/download?format=keras`} className={cx(btn.ghost, "!py-1 !text-xs")} title="Modèle TensorFlow complet, depuis Kaggle">
                    <Download /> .keras
                  </a>
                )}
              </span>
              {!m.active && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onActivate(m);
                  }}
                  className={cx(btn.ghost, "!py-1 !text-xs")}
                >
                  <KeyRound /> Activer
                </button>
              )}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
