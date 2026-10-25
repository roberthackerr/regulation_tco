"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ImportTable } from "@/components/imports/ImportTable";
import { ReviewButtons } from "@/components/imports/ReviewButtons";
import { Alert, Card, Skeleton, cx } from "@/components/ui";
import { Segmented } from "@/components/ui-client";
import { IMPORT_STATUS_LABELS, OPERATORS, type ImportStatus } from "@/lib/constants";
import { api } from "@/lib/client/api";
import type { ImportSummary } from "@/lib/client/types";
import { OPERATOR_COLORS } from "@/lib/theme";

const STATUS_FILTERS: { value: "" | ImportStatus; label: string }[] = [
  { value: "", label: "Tous" },
  { value: "recu", label: IMPORT_STATUS_LABELS.recu },
  { value: "valide", label: IMPORT_STATUS_LABELS.valide },
  { value: "rejete", label: IMPORT_STATUS_LABELS.rejete },
  { value: "traite", label: IMPORT_STATUS_LABELS.traite },
];

/** Tous les imports, avec filtres (gardés dans l'URL) et décision en ligne. */
export function AdminImports() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const status = (params.get("status") ?? "") as "" | ImportStatus;
  const operator = params.get("operator") ?? "";

  const key = `${status}|${operator}`;
  // Les résultats affichés et les filtres qui les ont produits : tant qu'ils diffèrent
  // des filtres courants, on garde l'ancien rendu atténué (pas de saut de mise en page).
  const [loaded, setLoaded] = useState<{ key: string; imports: ImportSummary[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const imports = loaded?.imports ?? null;
  const reloading = loaded != null && loaded.key !== key;

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (status) qs.set("status", status);
    if (operator) qs.set("operator", operator);
    api<{ imports: ImportSummary[] }>(`/api/imports?${qs}`)
      .then((d) => setLoaded({ key: `${status}|${operator}`, imports: d.imports }))
      .catch((e) => setError(e.message));
  }, [status, operator]);
  useEffect(load, [load]);

  function setFilter(key: string, value: string) {
    const qs = new URLSearchParams(params);
    if (value) qs.set(key, value);
    else qs.delete(key);
    router.replace(`${pathname}?${qs}`, { scroll: false });
  }

  return (
    <div className="space-y-4">
      {/* Filtres : une seule ligne, au-dessus du contenu qu'ils filtrent. */}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Statut" value={status} onChange={(v) => setFilter("status", v)} options={STATUS_FILTERS} />
        <Segmented
          label="Opérateur"
          value={operator}
          onChange={(v) => setFilter("operator", v)}
          options={[
            { value: "", label: "Tous les opérateurs" },
            ...OPERATORS.map((o) => ({
              value: o.code as string,
              label: (
                <>
                  <span className="h-2 w-2 rounded-full" style={{ background: OPERATOR_COLORS[o.code] }} aria-hidden />
                  {o.code}
                </>
              ),
            })),
          ]}
        />
      </div>

      <Card padded={false}>
        <div className={cx("px-5 transition-opacity", reloading && "opacity-60")}>
          {error ? (
            <div className="py-5"><Alert>{error}</Alert></div>
          ) : imports ? (
            <ImportTable
              imports={imports}
              basePath="/admin/imports"
              showOperator
              flushTop
              emptyText={status === "recu" ? "Aucun import en attente : tout est traité." : "Aucun import ne correspond à ces filtres."}
              actions={(imp) => (imp.status === "recu" ? <ReviewButtons importId={imp.id} fileName={imp.fileName} onDone={load} compact /> : null)}
            />
          ) : (
            <div className="space-y-2 py-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          )}
        </div>
      </Card>
    </div>
  );
}
