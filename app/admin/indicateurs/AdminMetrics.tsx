"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendChart } from "@/components/charts/TrendChart";
import { MetricsView } from "@/components/MetricsView";
import { Alert, Card, PageHeader, PageSkeleton, Table, cx, td, tdNum } from "@/components/ui";
import { Segmented } from "@/components/ui-client";
import { OPERATORS, SERVICES, SERVICE_LABELS, type OperatorCode, type Service } from "@/lib/constants";
import { api, fmtMonth, fmtNumber } from "@/lib/client/api";
import type { MetricsResponse } from "@/lib/client/types";
import { METRICS, OPERATOR_COLORS, metricsFor, unitFor, type MetricKey } from "@/lib/theme";

type Tab = "comparaison" | OperatorCode;

/** Indicateurs : comparaison des 3 opérateurs, ou détail d'un opérateur. */
export function AdminMetrics() {
  const [tab, setTab] = useState<Tab>("comparaison");
  return (
    <>
      <PageHeader
        eyebrow="Autorité de régulation"
        title="Indicateurs des opérateurs"
        subtitle="Données validées, moyennes nationales pondérées par le nombre d'abonnés."
      />
      <div className="mb-6 border-b border-line">
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Vue">
          {(["comparaison", ...OPERATORS.map((o) => o.code)] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-current={tab === t ? "page" : undefined}
              className={cx(
                "inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                tab === t ? "border-brand text-ink" : "border-transparent text-ink-2 hover:text-ink",
              )}
            >
              {t !== "comparaison" && <span className="h-2.5 w-2.5 rounded-full" style={{ background: OPERATOR_COLORS[t] }} aria-hidden />}
              {t === "comparaison" ? "Comparaison" : OPERATORS.find((o) => o.code === t)!.nom}
            </button>
          ))}
        </nav>
      </div>
      {tab === "comparaison" ? <Comparison /> : <MetricsView key={tab} operator={tab} />}
    </>
  );
}

/** Les 3 opérateurs sur le même graphique, pour un service et un indicateur. */
function Comparison() {
  const [all, setAll] = useState<MetricsResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [service, setService] = useState<Service>("data");
  const [metric, setMetric] = useState<MetricKey>("taux_coupure");

  useEffect(() => {
    Promise.all(OPERATORS.map((o) => api<MetricsResponse>(`/api/operator/metrics?operator=${o.code}`)))
      .then(setAll)
      .catch((e) => setError(e.message));
  }, []);

  const available = metricsFor(service);
  const def = available.some((m) => m.key === metric) ? METRICS[metric] : METRICS.taux_coupure;
  const withData = (all ?? []).filter((r) => r.parMois.length > 0);

  const rows = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string | null>>();
    for (const r of withData) {
      for (const m of r.parMois.filter((x) => x.service === service)) {
        const row = byDate.get(m.date) ?? { date: m.date };
        row[r.operator] = m[def.key] as number | null;
        byDate.set(m.date, row);
      }
    }
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))) as { date: string }[];
  }, [withData, service, def.key]);

  if (error) return <Alert>{error}</Alert>;
  if (!all) return <PageSkeleton />;
  if (!withData.length) return <Alert tone="info">Aucune donnée validée pour l&apos;instant.</Alert>;

  // Tableau récapitulatif du dernier mois commun, tous indicateurs du service.
  const lastCommon = rows.filter((r) => withData.every((o) => r[o.operator as keyof typeof r] != null)).at(-1)?.date;
  const unit = unitFor(def, service);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Service" value={service} onChange={setService} options={SERVICES.map((s) => ({ value: s, label: SERVICE_LABELS[s] }))} />
        <Segmented
          label="Indicateur"
          size="sm"
          value={def.key}
          onChange={setMetric}
          options={available.map((m) => ({ value: m.key, label: m.short }))}
        />
      </div>

      <Card title={`${def.label} — ${SERVICE_LABELS[service]}`} subtitle={def.lowerIsBetter ? "Plus la valeur est basse, mieux c'est." : "Plus la valeur est haute, mieux c'est."}>
        <TrendChart
          data={rows}
          series={withData.map((r) => ({ key: r.operator, name: r.operator, color: OPERATOR_COLORS[r.operator] }))}
          unit={unit}
          digits={def.digits}
          height={320}
          ariaLabel={`Comparaison des opérateurs : ${def.label}`}
        />
      </Card>

      {lastCommon && (
        <Card title={`Tableau comparatif — ${SERVICE_LABELS[service]}`} subtitle={`${fmtMonth(lastCommon)} · meilleure valeur en gras`}>
          <Table head={["Indicateur", ...withData.map((r) => r.operator)]} align={["left", ...withData.map(() => "right" as const)]}>
            {available.map((m) => {
              const values = withData.map((r) => r.parMois.find((x) => x.service === service && x.date === lastCommon)?.[m.key] as number | null);
              const valid = values.filter((v): v is number => v != null);
              const best = valid.length ? (m.lowerIsBetter ? Math.min(...valid) : Math.max(...valid)) : null;
              const showBest = m.key !== "nb_abonnes";
              return (
                <tr key={m.key}>
                  <td className={cx(td, "text-ink")}>
                    {m.label} <span className="text-muted">({unitFor(m, service) || "nombre"})</span>
                  </td>
                  {values.map((v, i) => (
                    <td key={i} className={cx(tdNum, showBest && v === best && "font-semibold")}>
                      {fmtNumber(v, m.digits)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </Table>
        </Card>
      )}
    </div>
  );
}
