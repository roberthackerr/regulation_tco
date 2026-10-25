"use client";

import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Circle,
  Database,
  FileCheck2,
  FileClock,
  FileX2,
  KeyRound,
  Rows3,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TrendChart } from "@/components/charts/TrendChart";
import { OverviewInsights } from "@/components/predictions/OverviewInsights";
import { Alert, Card, PageSkeleton, Stat, StatusBadge, cx } from "@/components/ui";
import { OPERATORS, type OperatorCode } from "@/lib/constants";
import { api, fmtMonth, fmtNumber } from "@/lib/client/api";
import type { ImportSummary, PublicStats } from "@/lib/client/types";
import { OPERATOR_COLORS } from "@/lib/theme";

type Cell = "valide" | "attente" | "manquant";
type Overview = {
  imports: { recu: number; valide: number; rejete: number; traite: number };
  recent: ImportSummary[];
  months: string[];
  coverage: { operator: OperatorCode; nom: string; lignes: number; cells: Cell[] }[];
  lignes: number;
  nbUsers: number;
  pipeline: {
    kaggleConfigured: boolean;
    lastRun: { status: string; startedAt: string } | null;
    dataset: { id: string; version: number; nbLignes: number; score: number | null } | null;
  };
};

export function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api<Overview>("/api/admin/overview"), api<PublicStats>("/api/public/stats")])
      .then(([o, s]) => {
        setData(o);
        setStats(s);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert title="Impossible de charger la vue d'ensemble">{error}</Alert>;
  if (!data || !stats) return <PageSkeleton />;

  const total = data.imports.recu + data.imports.valide + data.imports.rejete + data.imports.traite;
  const accepted = data.imports.valide + data.imports.traite;

  // Évolution du taux de coupure national, une colonne par opérateur.
  const byDate = new Map<string, Record<string, number | string | null>>();
  for (const e of stats.evolution) {
    const row = byDate.get(e.date) ?? { date: e.date };
    row[e.code] = e.taux_coupure;
    byDate.set(e.date, row);
  }
  const trend = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))) as { date: string }[];
  const present = OPERATORS.filter((o) => stats.evolution.some((e) => e.code === o.code));

  return (
    <div className="space-y-6">
      {data.imports.recu > 0 && (
        <Alert
          tone="info"
          title={`${data.imports.recu} import${data.imports.recu > 1 ? "s" : ""} en attente de votre décision`}
          action={
            <Link href="/admin/imports?status=recu" className="inline-flex shrink-0 items-center gap-1 self-center text-[13px] font-semibold hover:underline">
              Examiner <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          Les fichiers ont passé la validation automatique. Approuvez-les pour les intégrer aux données de référence.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="En attente d'approbation" value={fmtNumber(data.imports.recu)} icon={FileClock} hint={data.imports.recu ? "à examiner" : "rien à traiter"} />
        <Stat label="Imports acceptés" value={fmtNumber(accepted)} icon={FileCheck2} hint={`sur ${fmtNumber(total)} reçus`} />
        <Stat label="Imports rejetés" value={fmtNumber(data.imports.rejete)} icon={FileX2} hint={total ? `${fmtNumber((data.imports.rejete / total) * 100, 0)} % des envois` : "—"} />
        <Stat label="Lignes de données validées" value={fmtNumber(data.lignes)} icon={Rows3} hint={`${fmtNumber(data.nbUsers)} comptes actifs`} />
      </div>

      <OverviewInsights />

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Couverture des données" subtitle="Mois transmis par chaque opérateur sur les 12 derniers mois">
          <CoverageGrid months={data.months} coverage={data.coverage} />
        </Card>
        <Card className="xl:col-span-2" title="Chaîne de traitement" subtitle="Des données brutes à la prédiction de satisfaction">
          <PipelineSteps
            steps={[
              { icon: Database, title: "Collecte & validation", detail: "Imports CSV, contrôle automatique, approbation", state: "on" },
              {
                icon: Workflow,
                title: "Pipeline de traitement",
                detail: data.pipeline.dataset
                  ? `Dataset v${data.pipeline.dataset.version} · ${fmtNumber(data.pipeline.dataset.nbLignes)} lignes · qualité ${data.pipeline.dataset.score ?? "—"}/100`
                  : "Nettoyage, sentiment, features, dataset versionné — pas encore exécuté",
                state: data.pipeline.lastRun?.status === "echec" ? "ready" : data.pipeline.dataset ? "on" : "ready",
                href: "/admin/pipeline",
              },
              {
                icon: KeyRound,
                title: "Entraînement Kaggle",
                detail: data.pipeline.kaggleConfigured ? "Jeton API configuré — branchement en phase 3" : "Jeton API manquant (KAGGLE_API_TOKEN)",
                state: data.pipeline.kaggleConfigured ? "ready" : "off",
              },
              { icon: BrainCircuit, title: "Prédiction de satisfaction", detail: "Score 0–100 par opérateur, région, service — phase 4", state: "off" },
            ]}
          />
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card
          className="xl:col-span-3"
          title="Taux de coupure national"
          subtitle="Tous services, pondéré par le nombre d'abonnés"
          actions={<Link href="/admin/indicateurs" className="text-[13px] font-medium text-ink-2 hover:text-ink">Comparer en détail →</Link>}
        >
          {trend.length ? (
            <TrendChart
              data={trend}
              series={present.map((o) => ({ key: o.code, name: o.code, color: OPERATOR_COLORS[o.code] }))}
              unit="%"
              digits={2}
              height={240}
              ariaLabel="Évolution du taux de coupure national par opérateur"
            />
          ) : (
            <p className="py-10 text-center text-sm text-muted">Aucune donnée validée.</p>
          )}
        </Card>
        <Card className="xl:col-span-2" title="Derniers imports" actions={<Link href="/admin/imports" className="text-[13px] font-medium text-ink-2 hover:text-ink">Tout voir →</Link>}>
          <RecentList imports={data.recent} />
        </Card>
      </div>
    </div>
  );
}

/** Grille opérateurs × mois : validé (plein), en attente (contour), manquant (vide). */
function CoverageGrid({ months, coverage }: { months: string[]; coverage: Overview["coverage"] }) {
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="w-28" />
              {months.map((m) => (
                <th key={m} scope="col" className="px-0.5 pb-1 text-center font-normal text-muted">
                  {new Date(m).toLocaleDateString("fr-FR", { month: "narrow", timeZone: "UTC" })}
                </th>
              ))}
              <th scope="col" className="pl-3 text-right font-normal text-muted">Lignes</th>
            </tr>
          </thead>
          <tbody>
            {coverage.map((row) => (
              <tr key={row.operator}>
                <th scope="row" className="pr-2 text-left font-medium text-ink">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: OPERATOR_COLORS[row.operator] }} aria-hidden />
                    {row.operator}
                  </span>
                </th>
                {row.cells.map((c, i) => (
                  <td key={i} className="p-0">
                    <div
                      title={`${row.operator} · ${fmtMonth(months[i])} : ${c === "valide" ? "validé" : c === "attente" ? "en attente d'approbation" : "non transmis"}`}
                      className={cx(
                        "mx-auto h-7 min-w-5 rounded-md",
                        c === "valide" && "bg-brand",
                        c === "attente" && "border-2 border-dashed border-brand/60 bg-brand-soft",
                        c === "manquant" && "bg-sunken",
                      )}
                    />
                  </td>
                ))}
                <td className="pl-3 text-right tabular-nums text-ink-2">{fmtNumber(row.lignes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-brand" /> Validé</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border-2 border-dashed border-brand/60 bg-brand-soft" /> En attente</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-sunken" /> Non transmis</span>
        <span className="ml-auto">{fmtMonth(months[0])} – {fmtMonth(months[months.length - 1])}</span>
      </div>
    </div>
  );
}

function PipelineSteps({ steps }: { steps: { icon: LucideIcon; title: string; detail: string; state: "on" | "ready" | "off"; href?: string }[] }) {
  return (
    <ol className="relative space-y-4">
      {steps.map((s, i) => (
        <li key={s.title} className="relative flex gap-3">
          {i < steps.length - 1 && <span className="absolute top-9 left-[17px] h-[calc(100%-20px)] w-px bg-line" aria-hidden />}
          <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-full", s.state === "on" ? "bg-good-soft text-good-ink" : s.state === "ready" ? "bg-info-soft text-info-ink" : "bg-sunken text-faint")}>
            <s.icon className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 pt-0.5">
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              {s.href ? <Link href={s.href} className="hover:underline">{s.title}</Link> : s.title}
              {s.state === "on" ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-good-ink"><CheckCircle2 className="h-3.5 w-3.5" /> actif</span>
              ) : s.state === "ready" ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-info-ink"><Circle className="h-3 w-3" /> prêt</span>
              ) : (
                <span className="text-xs text-faint">à venir</span>
              )}
            </div>
            <div className="text-xs text-muted">{s.detail}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Liste compacte des derniers imports (la colonne est trop étroite pour le tableau complet). */
function RecentList({ imports }: { imports: ImportSummary[] }) {
  if (!imports.length) return <p className="py-10 text-center text-sm text-muted">Aucun import reçu.</p>;
  return (
    <ul className="-mx-2 divide-y divide-line">
      {imports.map((imp) => (
        <li key={imp.id}>
          <Link href={`/admin/imports/${imp.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-page/70">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: imp.operatorCode ? OPERATOR_COLORS[imp.operatorCode] : undefined }} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-ink">{imp.fileName}</div>
              <div className="text-xs text-muted">
                {imp.operatorCode} · {new Date(imp.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
            <StatusBadge status={imp.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
