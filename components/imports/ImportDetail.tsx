"use client";

import { ArrowLeft, CheckCircle2, Circle, Clock, Download, XCircle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Alert, Card, OperatorTag, PageSkeleton, Stat, StatusBadge, btn, cx } from "@/components/ui";
import { api, fmtDateTime, fmtNumber, fmtPeriod, fmtSize } from "@/lib/client/api";
import type { ImportSummary } from "@/lib/client/types";
import { IssueList } from "./IssueList";
import { ReviewButtons } from "./ReviewButtons";

/** Détail d'un import : parcours, chiffres, rapport d'anomalies, et décision admin si `canReview`. */
export function ImportDetail({ backHref, canReview = false }: { backHref: string; canReview?: boolean }) {
  const { id } = useParams<{ id: string }>();
  const [imp, setImp] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ import: ImportSummary }>(`/api/imports/${id}`)
      .then((d) => setImp(d.import))
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <Alert title="Import introuvable">{error}</Alert>;
  if (!imp) return <PageSkeleton />;

  const erreurs = imp.erreurs ?? [];
  const avertissements = imp.avertissements ?? [];

  return (
    <div className="space-y-6">
      <div>
        <Link href={backHref} className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Tous les imports
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="truncate text-[26px] font-semibold tracking-tight text-ink">{imp.fileName}</h1>
              <StatusBadge status={imp.status} />
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
              {imp.operatorCode && <OperatorTag code={imp.operatorCode} />}
              {imp.operatorCode && <span className="text-faint">·</span>}
              Envoyé le {fmtDateTime(imp.createdAt)}
              {imp.uploadedBy && <> par {imp.uploadedBy}</>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(erreurs.length > 0 || avertissements.length > 0) && (
              <a href={`/api/imports/${imp.id}/rapport`} className={btn.secondary}>
                <Download /> Rapport CSV
              </a>
            )}
            {canReview && imp.status === "recu" && <ReviewButtons importId={imp.id} fileName={imp.fileName} onDone={load} />}
          </div>
        </div>
      </div>

      <Timeline imp={imp} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Lignes de données" value={fmtNumber(imp.rowCount)} hint={fmtSize(imp.fileSize)} />
        <Stat label="Période couverte" value={<span className="text-xl">{fmtPeriod(imp.periodStart, imp.periodEnd)}</span>} />
        <Stat label="Erreurs bloquantes" value={fmtNumber(imp.errorCount)} hint={imp.errorCount ? "à corriger avant renvoi" : "aucune"} />
        <Stat label="Avertissements" value={fmtNumber(imp.warningCount)} hint={imp.warningCount ? "à vérifier, non bloquants" : "aucun"} />
      </div>

      {imp.status === "rejete" && imp.rejectReason && (
        <Alert title={`Refusé par ${imp.reviewedBy ?? "l'autorité"}`}>{imp.rejectReason}</Alert>
      )}

      {erreurs.length > 0 && (
        <Card
          title="Erreurs bloquantes"
          subtitle={imp.errorCount > erreurs.length ? `Les ${erreurs.length} premières sur ${fmtNumber(imp.errorCount)} — le rapport CSV les contient toutes.` : "Corrigez ces lignes puis renvoyez le fichier."}
        >
          <IssueList issues={erreurs} tone="error" />
        </Card>
      )}

      {avertissements.length > 0 && (
        <Card title="Avertissements" subtitle="Valeurs acceptées mais inhabituelles : vérifiez qu'il ne s'agit pas d'une erreur de saisie.">
          <IssueList issues={avertissements} tone="warn" />
        </Card>
      )}

      {erreurs.length === 0 && avertissements.length === 0 && (
        <Alert tone="success" title="Fichier conforme">Aucune anomalie détectée.</Alert>
      )}
    </div>
  );
}

type StepState = "done" | "failed" | "current" | "todo";

/** Frise du parcours : envoi → validation automatique → décision de l'autorité → traitement. */
function Timeline({ imp }: { imp: ImportSummary }) {
  const technicalFailed = imp.status === "rejete" && !imp.rejectReason;
  const steps: { title: string; detail: ReactNode; state: StepState }[] = [
    { title: "Fichier reçu", detail: fmtDateTime(imp.createdAt), state: "done" },
    {
      title: "Validation automatique",
      detail: technicalFailed ? `${fmtNumber(imp.errorCount)} erreur(s)` : imp.warningCount ? `Conforme · ${fmtNumber(imp.warningCount)} avertissement(s)` : "Conforme",
      state: technicalFailed ? "failed" : "done",
    },
    {
      title: "Décision de l'autorité",
      detail:
        imp.status === "recu" ? "En attente" :
        technicalFailed ? "—" :
        imp.status === "rejete" ? `Refusé le ${fmtDateTime(imp.reviewedAt)}` :
        `Approuvé le ${fmtDateTime(imp.reviewedAt)}`,
      state: imp.status === "recu" ? "current" : technicalFailed ? "todo" : imp.status === "rejete" ? "failed" : "done",
    },
    {
      title: "Traitement & modèle",
      detail: imp.status === "traite" ? "Intégré au dataset" : imp.status === "valide" ? "Pipeline (phase 2)" : "—",
      state: imp.status === "traite" ? "done" : imp.status === "valide" ? "current" : "todo",
    },
  ];

  const icon = { done: CheckCircle2, failed: XCircle, current: Clock, todo: Circle };
  const tone = { done: "text-good", failed: "text-bad", current: "text-info-ink", todo: "text-line-strong" };

  return (
    <ol className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-card sm:grid-cols-4">
      {steps.map((s, i) => {
        const Icon = icon[s.state];
        return (
          <li key={s.title} className="flex items-start gap-3 bg-surface px-4 py-3.5">
            <Icon className={cx("mt-0.5 h-5 w-5 shrink-0", tone[s.state])} aria-hidden />
            <div className="min-w-0">
              <div className={cx("text-[13px] font-medium", s.state === "todo" ? "text-muted" : "text-ink")}>
                <span className="sr-only">Étape {i + 1} : </span>{s.title}
              </div>
              <div className="truncate text-xs text-muted">{s.detail}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
