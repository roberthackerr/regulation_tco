"use client";

import { useCallback, useEffect, useState } from "react";
import { ImportTable } from "@/components/imports/ImportTable";
import { UploadForm } from "@/components/imports/UploadForm";
import { Alert, Card, Skeleton } from "@/components/ui";
import { CSV_COLUMNS } from "@/lib/constants";
import { api } from "@/lib/client/api";
import type { ImportSummary } from "@/lib/client/types";

const RULES = [
  ["Une ligne par", "mois × région × service"],
  ["Date", "1er du mois, ex. 2026-03-01"],
  ["Services", "voix, data, sms, mobile_money"],
  ["Débit", "uniquement pour la data"],
  ["Latence", "vide pour les SMS"],
  ["Décimales", "avec un point : 12.5"],
];

export function OperatorImports() {
  const [imports, setImports] = useState<ImportSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ imports: ImportSummary[] }>("/api/imports")
      .then((d) => setImports(d.imports))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const pending = imports?.filter((i) => i.status === "recu").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Nouvel import" className="xl:col-span-2">
          <UploadForm onUploaded={load} detailBase="/operateur/imports" />
        </Card>
        <Card title="Format attendu" subtitle="Le modèle CSV contient un exemple par service.">
          <dl className="divide-y divide-line text-[13px]">
            {RULES.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-2">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right font-medium text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <details className="mt-3 text-xs text-muted">
            <summary className="cursor-pointer font-medium text-ink-2 hover:text-ink">Les {CSV_COLUMNS.length} colonnes</summary>
            <p className="mt-2 font-mono leading-relaxed">{CSV_COLUMNS.join(", ")}</p>
          </details>
        </Card>
      </div>

      <Card title="Historique" subtitle={pending ? `${pending} import${pending > 1 ? "s" : ""} en attente d'approbation` : undefined} padded={false}>
        <div className="px-5 pb-2">
          {error ? (
            <div className="pb-4"><Alert>{error}</Alert></div>
          ) : imports ? (
            <ImportTable imports={imports} basePath="/operateur/imports" emptyText="Vous n'avez encore envoyé aucun fichier." />
          ) : (
            <div className="space-y-2 pb-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          )}
        </div>
      </Card>
    </div>
  );
}
