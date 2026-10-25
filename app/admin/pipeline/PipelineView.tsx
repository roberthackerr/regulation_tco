"use client";

import {
  ArrowRight,
  Ban,
  Check,
  CircleDashed,
  Database,
  FileClock,
  History,
  Layers,
  LoaderCircle,
  MessageSquareHeart,
  Play,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Card, Empty, PageSkeleton, Stat, btn, cx } from "@/components/ui";
import { useToast } from "@/components/ui-client";
import { ClassBar, QualityRing, STEP_ICONS, fmtDuration, stepHeadline } from "@/components/pipeline/bits";
import { api, fmtDateTime, fmtNumber, fmtPeriod } from "@/lib/client/api";
import type { DatasetVersionSummary, PipelineOverview, PipelineRunSummary, PipelineStep } from "@/lib/client/types";
import { PIPELINE_STEPS } from "@/lib/pipeline/definitions";

const POLL_MS = 700;

export function PipelineView() {
  const toast = useToast();
  const [data, setData] = useState<PipelineOverview | null>(null);
  const [live, setLive] = useState<PipelineRunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<PipelineOverview>("/api/admin/pipeline");
      setData(d);
      setLive(d.current);
      return d;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, []);

  // Suivi en direct d'un passage en cours.
  const follow = useCallback(
    (runId: string) => {
      if (timer.current) clearTimeout(timer.current);
      const tick = async () => {
        try {
          const run = await api<PipelineRunSummary>(`/api/admin/pipeline/runs/${runId}`);
          setLive(run);
          const active = run.steps.find((s) => s.status === "en_cours");
          if (active) setSelected(active.key);
          if (run.status === "en_cours") {
            timer.current = setTimeout(tick, POLL_MS);
          } else {
            await load();
            if (run.status === "termine") {
              toast.success(run.unchanged ? `Pipeline terminé : données inchangées (v${run.version}).` : `Pipeline terminé : dataset v${run.version} créé.`);
              setSelected("versionnage");
            } else {
              toast.error(`Échec du pipeline : ${run.error ?? "erreur inconnue"}`);
              setSelected(run.steps.find((s) => s.status === "echec")?.key ?? null);
            }
          }
        } catch {
          timer.current = setTimeout(tick, POLL_MS * 3);
        }
      };
      tick();
    },
    [load, toast],
  );

  useEffect(() => {
    api<PipelineOverview>("/api/admin/pipeline")
      .then((d) => {
        setData(d);
        setLive(d.current);
        if (d.current?.status === "en_cours") follow(d.current.id);
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
      const { runId, created } = await api<{ runId: string; created: boolean }>("/api/admin/pipeline", { method: "POST" });
      if (!created) toast.success("Un passage est déjà en cours : suivi en direct.");
      setSelected("extraction");
      follow(runId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  if (error) return <Alert title="Impossible de charger le pipeline">{error}</Alert>;
  if (!data) return <PageSkeleton />;

  const run = live;
  const running = run?.status === "en_cours";
  const latest = data.versions[0] ?? null;
  const step = run?.steps.find((s) => s.key === (selected ?? run.steps.findLast((x) => x.status !== "attente")?.key));

  return (
    <div className="space-y-6">
      {/* Avertissements et actions */}
      {data.sources.avis === 0 && (
        <Alert
          tone="warn"
          title="Aucun avis d'usager en base"
          action={
            <Link href="/admin/veille" className={cx(btn.secondary, btn.sm, "self-center")}>
              <MessageSquareHeart /> Collecter des avis réels
            </Link>
          }
        >
          La cible de satisfaction se calcule uniquement à partir d&apos;avis réels : formulaire « Donner mon avis » de la page publique, et publications de la veille qui citent une région (réseau, internet, mobile money).
        </Alert>
      )}
      {data.sources.aTraiter > 0 && !running && (
        <Alert tone="info" title={`${data.sources.aTraiter} import(s) validé(s) en attente de traitement`}>
          Le pipeline se lance automatiquement après chaque approbation. Vous pouvez aussi le lancer maintenant.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Lignes d'indicateurs" value={fmtNumber(data.sources.lignes)} icon={Database} hint="source : imports validés" />
        <Stat label="Avis publiés" value={fmtNumber(data.sources.avis)} icon={MessageSquareHeart} hint={`${fmtNumber(data.sources.avisAnalyses)} analysés`} />
        <Stat label="Imports à traiter" value={fmtNumber(data.sources.aTraiter)} icon={FileClock} hint={data.sources.aTraiter ? "prochain passage" : "à jour"} />
        <Stat
          label="Dataset en vigueur"
          value={latest ? `v${latest.version}` : "—"}
          icon={Layers}
          hint={latest ? `${fmtNumber(latest.nbLignes)} lignes · qualité ${latest.qualite.score ?? "—"}` : "aucune version"}
        />
      </div>

      {/* Schéma du pipeline */}
      <Card
        padded={false}
        title={
          <span className="flex items-center gap-2">
            {running ? "Exécution en cours" : "Dernier passage"}
            {run && <RunBadge run={run} />}
          </span>
        }
        subtitle={
          run
            ? `${run.trigger === "auto" ? "Déclenché automatiquement" : "Lancé manuellement"} · ${fmtDateTime(run.startedAt)}${run.durationMs != null ? ` · ${fmtDuration(run.durationMs)}` : ""}`
            : "Le pipeline n'a encore jamais été exécuté."
        }
        actions={
          <button type="button" onClick={start} disabled={running || starting} className={btn.primary}>
            {running || starting ? <LoaderCircle className="animate-spin" /> : <Play />}
            {running ? "En cours…" : "Lancer le pipeline"}
          </button>
        }
      >
        <div className="px-5 pb-5">
          <Flow steps={run?.steps ?? PIPELINE_STEPS.map((s) => ({ key: s.key, status: "attente", startedAt: null, finishedAt: null, durationMs: null, stats: {} }))} selected={step?.key ?? null} onSelect={setSelected} />
        </div>
        {run && step && <StepConsole step={step} running={running} />}
        {run?.status === "termine" && run.datasetVersionId && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-good-soft/50 px-5 py-3 text-sm">
            <span className="flex items-center gap-2 text-good-ink">
              <Check className="h-4 w-4" />
              {run.unchanged ? <>Données identiques : la version <b>v{run.version}</b> reste en vigueur.</> : <>Nouvelle version <b>v{run.version}</b> du dataset prête pour l&apos;entraînement.</>}
            </span>
            <Link href={`/admin/pipeline/datasets/${run.datasetVersionId}`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-good-ink hover:underline">
              Explorer le dataset <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Versions du dataset" subtitle="Chaque passage qui modifie les données crée une version (empreinte SHA-256)">
          {data.versions.length ? <VersionList versions={data.versions} /> : <Empty icon={Layers} title="Aucune version">Lancez le pipeline pour produire la première version du dataset.</Empty>}
        </Card>
        <Card className="xl:col-span-2" title="Historique des passages" subtitle="15 derniers">
          {data.runs.length ? <RunHistory runs={data.runs} onPick={(r) => { setLive(r); setSelected(null); if (r.status === "en_cours") follow(r.id); else api<PipelineRunSummary>(`/api/admin/pipeline/runs/${r.id}`).then(setLive).catch(() => {}); }} activeId={run?.id} /> : <Empty icon={History} title="Aucun passage" />}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Schéma animé */

function Flow({ steps, selected, onSelect }: { steps: PipelineStep[]; selected: string | null; onSelect: (k: string) => void }) {
  return (
    <ol className="flex flex-col gap-1 lg:flex-row lg:items-stretch lg:gap-0">
      {steps.map((s, i) => {
        const def = PIPELINE_STEPS.find((d) => d.key === s.key)!;
        const next = steps[i + 1];
        return (
          <li key={s.key} className="flex flex-col lg:flex-1 lg:flex-row lg:items-start">
            <Node step={s} label={def.label} detail={def.detail} active={selected === s.key} onClick={() => onSelect(s.key)} />
            {next && <Connector from={s.status} to={next.status} />}
          </li>
        );
      })}
    </ol>
  );
}

function Node({ step, label, detail, active, onClick }: { step: PipelineStep; label: string; detail: string; active: boolean; onClick: () => void }) {
  const Icon = STEP_ICONS[step.key];
  const headline = step.status === "termine" ? stepHeadline(step) : null;
  const tone = {
    attente: "bg-sunken text-faint",
    en_cours: "bg-brand text-white pulse-ring",
    termine: "bg-good-soft text-good-ink",
    echec: "bg-bad-soft text-bad-ink",
    ignore: "bg-sunken text-faint opacity-60",
  }[step.status];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors lg:w-auto lg:min-w-0 lg:flex-col lg:items-center lg:px-1 lg:py-3 lg:text-center",
        active ? "bg-brand-soft/70" : "hover:bg-page",
      )}
    >
      <span className={cx("relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-colors", tone)}>
        <Icon className="h-5 w-5" aria-hidden />
        {step.status === "termine" && (
          <span className="pop-in absolute -right-1 -bottom-1 grid h-5 w-5 place-items-center rounded-full bg-good text-white ring-2 ring-surface">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
        {step.status === "echec" && (
          <span className="pop-in absolute -right-1 -bottom-1 grid h-5 w-5 place-items-center rounded-full bg-bad text-white ring-2 ring-surface">
            <X className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
        {step.status === "en_cours" && (
          <span className="absolute -right-1 -bottom-1 grid h-5 w-5 place-items-center rounded-full bg-surface text-brand ring-2 ring-surface">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          </span>
        )}
      </span>
      <span className="min-w-0 lg:w-full">
        <span className="block text-[13px] font-semibold text-ink">{label}</span>
        <span className="block text-xs text-muted lg:hidden xl:block xl:px-1 xl:text-[11px] xl:leading-snug">{detail}</span>
        <span className={cx("mt-0.5 block text-xs font-medium tabular-nums", step.status === "termine" ? "text-ink-2" : "text-faint")}>
          {headline ?? (step.status === "en_cours" ? "en cours…" : step.status === "echec" ? "échec" : step.status === "ignore" ? "ignorée" : "en attente")}
        </span>
        {step.durationMs != null && <span className="block text-[11px] tabular-nums text-faint">{fmtDuration(step.durationMs)}</span>}
      </span>
    </button>
  );
}

/** Liaison entre deux étapes : pleine si franchie, pointillés animés si la suivante tourne. */
function Connector({ from, to }: { from: PipelineStep["status"]; to: PipelineStep["status"] }) {
  const done = from === "termine" && (to === "termine" || to === "en_cours");
  const flowing = from === "termine" && to === "en_cours";
  const color = done ? "var(--color-good)" : "var(--color-line-strong)";
  return (
    <>
      {/* Vertical (mobile) */}
      <svg className="ml-[31px] h-4 w-2 lg:hidden" viewBox="0 0 2 16" aria-hidden>
        <line x1="1" y1="0" x2="1" y2="16" stroke={color} strokeWidth="2" className={flowing ? "flow-line" : undefined} strokeDasharray={done && !flowing ? undefined : "3 4"} />
      </svg>
      {/* Horizontal (ordinateur) */}
      <svg className="mt-[35px] hidden h-2 w-full min-w-3 flex-1 lg:block" viewBox="0 0 100 2" preserveAspectRatio="none" aria-hidden>
        <line x1="0" y1="1" x2="100" y2="1" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" className={flowing ? "flow-line" : undefined} strokeDasharray={done && !flowing ? undefined : "3 4"} />
      </svg>
    </>
  );
}

/** Journal de l'étape sélectionnée, façon terminal. */
function StepConsole({ step, running }: { step: PipelineStep; running: boolean }) {
  const def = PIPELINE_STEPS.find((d) => d.key === step.key)!;
  const logs = step.logs ?? [];
  const stats = Object.entries(step.stats ?? {}).filter(([, v]) => v != null && typeof v !== "boolean");
  return (
    <div className="border-t border-line">
      <div className="flex flex-wrap items-center gap-2 px-5 py-3">
        <Terminal className="h-4 w-4 text-muted" aria-hidden />
        <span className="text-[13px] font-semibold text-ink">Journal · {def.label}</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {stats.map(([k, v]) => (
            <span key={k} className="rounded-md bg-sunken px-2 py-0.5 text-[11px] text-ink-2">
              {humanize(k)} <b className="tabular-nums text-ink">{fmtNumber(Number(v), Number.isInteger(v) ? 0 : 1)}</b>
            </span>
          ))}
        </div>
      </div>
      <div className="mx-5 mb-5 max-h-64 overflow-auto rounded-xl bg-[#0f1a2c] p-4 font-mono text-[12px] leading-relaxed text-[#c9d4e5]" aria-live="polite">
        {logs.length === 0 ? (
          <div className="flex items-center gap-2 text-[#7d8aa3]">
            {step.status === "en_cours" || (running && step.status === "attente") ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CircleDashed className="h-3.5 w-3.5" />}
            {step.status === "en_cours" ? "Traitement en cours…" : step.status === "ignore" ? "Étape ignorée (une étape précédente a échoué)." : "En attente."}
          </div>
        ) : (
          logs.map((l, i) => {
            const [time, ...rest] = l.split("  ");
            const msg = rest.join("  ");
            const isErr = msg.startsWith("ERREUR");
            const isWarn = msg.startsWith("ATTENTION");
            return (
              <div key={`${step.key}-${i}`} className="log-line flex gap-3" style={{ animationDelay: `${i * 45}ms` }}>
                <span className="shrink-0 text-[#5d6b85]">{time}</span>
                <span className={isErr ? "text-[#ff8a8a]" : isWarn ? "text-[#f6c25b]" : undefined}>{msg}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const STAT_LABELS: Record<string, string> = {
  lignes: "lignes", avis: "avis", imports: "imports", nouveaux: "nouveaux", operateurs: "opérateurs", mois: "mois",
  conservees: "conservées", doublons: "doublons", horsBornes: "hors bornes", sansObjet: "sans objet", imputees: "imputées",
  avisValides: "avis valides", avisEcartes: "avis écartés", analyses: "analysés", positif: "positifs", neutre: "neutres",
  negatif: "négatifs", justesse: "justesse %", regionsCorrigees: "régions", plafonnees: "plafonnées", features: "features",
  sansHistorique: "sans historique", etiquetees: "étiquetées", orphelins: "orphelins", satisfait: "satisfait",
  insatisfait: "insatisfait", version: "version", score: "qualité",
};
const humanize = (k: string) => STAT_LABELS[k] ?? k;

function RunBadge({ run }: { run: PipelineRunSummary }) {
  if (run.status === "en_cours") return <Badge tone="info"><LoaderCircle className="h-3 w-3 animate-spin" /> en cours</Badge>;
  if (run.status === "echec") return <Badge tone="bad"><X className="h-3 w-3" /> échec</Badge>;
  return <Badge tone="good"><Check className="h-3 w-3" /> terminé</Badge>;
}

/* ------------------------------------------------------------------ Versions et historique */

function VersionList({ versions }: { versions: DatasetVersionSummary[] }) {
  return (
    <ul className="-mx-2 space-y-1">
      {versions.map((v, i) => {
        const prev = versions[i + 1];
        const delta = prev ? v.nbLignes - prev.nbLignes : null;
        return (
          <li key={v.id}>
            <Link href={`/admin/pipeline/datasets/${v.id}`} className="group flex items-center gap-4 rounded-xl px-2 py-2.5 hover:bg-page">
              <QualityRing score={v.qualite.score ?? 0} size={44} stroke={4} label="Qualité" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">v{v.version}</span>
                  {i === 0 && <Badge tone="brand"><Zap className="h-3 w-3" /> en vigueur</Badge>}
                  <code className="rounded bg-sunken px-1.5 py-0.5 text-[11px] text-muted">{v.checksum.slice(0, 10)}</code>
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {fmtNumber(v.nbLignes)} lignes
                  {delta != null && delta !== 0 && <span className={delta > 0 ? "text-good-ink" : "text-bad-ink"}> ({delta > 0 ? "+" : ""}{fmtNumber(delta)})</span>}
                  {" · "}{fmtNumber(v.nbEtiquetees)} étiquetées · {fmtPeriod(v.periodStart, v.periodEnd)}
                </div>
              </div>
              <ClassBar classes={v.classes} />
              <ArrowRight className="h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function RunHistory({ runs, onPick, activeId }: { runs: PipelineRunSummary[]; onPick: (r: PipelineRunSummary) => void; activeId?: string }) {
  return (
    <ul className="-mx-2 divide-y divide-line">
      {runs.map((r) => (
        <li key={r.id}>
          <button type="button" onClick={() => onPick(r)} className={cx("flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-page", activeId === r.id && "bg-brand-soft/50")}>
            <span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-full", r.status === "termine" ? "bg-good-soft text-good-ink" : r.status === "echec" ? "bg-bad-soft text-bad-ink" : "bg-info-soft text-info-ink")}>
              {r.status === "termine" ? <Check className="h-3.5 w-3.5" /> : r.status === "echec" ? <Ban className="h-3.5 w-3.5" /> : <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-ink">
                {r.status === "echec" ? "Échec" : r.status === "en_cours" ? "En cours" : r.unchanged ? `Inchangé (v${r.version})` : `→ v${r.version}`}
                <span className="ml-1.5 font-normal text-muted">· {r.trigger === "auto" ? "auto" : "manuel"}</span>
              </div>
              <div className="text-xs text-muted">{fmtDateTime(r.startedAt)} · {fmtDuration(r.durationMs)}</div>
            </div>
            <span className="flex gap-0.5" aria-hidden>
              {r.steps.map((s) => (
                <span key={s.key} className={cx("h-4 w-1.5 rounded-full", s.status === "termine" ? "bg-good" : s.status === "echec" ? "bg-bad" : s.status === "en_cours" ? "bg-brand" : "bg-line")} />
              ))}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
