"use client";

import { Activity, BarChart3, Gauge, MessageSquareWarning, Users, Wifi } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RankBars } from "@/components/charts/RankBars";
import { TrendChart } from "@/components/charts/TrendChart";
import { Alert, Card, Empty, PageSkeleton, Select, Stat, btn } from "@/components/ui";
import { Segmented } from "@/components/ui-client";
import { SERVICES, SERVICE_LABELS, type Service } from "@/lib/constants";
import { api, fmtMonth, fmtNumber } from "@/lib/client/api";
import type { MetricsResponse, MonthMetric } from "@/lib/client/types";
import { METRICS, OPERATOR_COLORS, metricsFor, unitFor, type MetricKey } from "@/lib/theme";

/**
 * Indicateurs d'un opérateur. Le filtre de service, en haut, s'applique à toute la page.
 * `operator` n'est utilisé que par l'admin ; pour un opérateur, le serveur impose
 * ses propres données quel que soit le paramètre.
 */
export function MetricsView({ operator, uploadHref }: { operator?: string; uploadHref?: string }) {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [service, setService] = useState<Service>("data");
  const [trendMetric, setTrendMetric] = useState<MetricKey>("taux_coupure");
  const [regionMetric, setRegionMetric] = useState<MetricKey>("taux_coupure");

  // Le parent change la `key` du composant quand l'opérateur change : l'état repart de zéro.
  useEffect(() => {
    const qs = operator ? `?operator=${operator}` : "";
    api<MetricsResponse>(`/api/operator/metrics${qs}`).then(setData).catch((e) => setError(e.message));
  }, [operator]);

  const months = useMemo(() => (data ? data.parMois.filter((m) => m.service === service) : []), [data, service]);
  const available = metricsFor(service);
  // Si l'indicateur choisi n'existe pas pour ce service (ex. débit pour la voix), on revient au taux de coupure.
  const tMetric = available.some((m) => m.key === trendMetric) ? METRICS[trendMetric] : METRICS.taux_coupure;
  const rMetric = available.some((m) => m.key === regionMetric) ? METRICS[regionMetric] : METRICS.taux_coupure;

  if (error) return <Alert title="Impossible de charger les indicateurs">{error}</Alert>;
  if (!data) return <PageSkeleton />;
  if (data.parMois.length === 0) {
    return (
      <Empty
        icon={BarChart3}
        title="Aucune donnée validée pour l'instant"
        action={uploadHref && <Link href={uploadHref} className={btn.primary}>Importer des données</Link>}
      >
        Les indicateurs apparaissent dès qu&apos;un import est approuvé par l&apos;autorité de régulation.
      </Empty>
    );
  }

  const color = OPERATOR_COLORS[data.operator];
  const last = months[months.length - 1];
  const prev = months[months.length - 2];

  const trendData = months.map((m) => ({ date: m.date, v: m[tMetric.key] as number | null }));
  const regionItems = data.parRegion
    .filter((r) => r.service === service)
    .map((r) => ({ label: r.region, value: r[rMetric.key as keyof typeof r] as number | null }));

  // Troisième tuile : l'indicateur le plus parlant pour le service.
  const thirdKey: MetricKey = service === "data" ? "debit_moyen_mbps" : service === "sms" ? "taux_disponibilite" : "latence_ms";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Service"
          value={service}
          onChange={setService}
          options={SERVICES.map((s) => ({ value: s, label: SERVICE_LABELS[s] }))}
        />
        <span className="text-[13px] text-muted">
          Dernier mois : <span className="font-medium text-ink">{fmtMonth(data.dernierMois)}</span>
          {prev && <> · variation par rapport à {fmtMonth(prev.date)}</>}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiTile metric="nb_abonnes" last={last} prev={prev} service={service} icon={Users} />
        <KpiTile metric="taux_coupure" last={last} prev={prev} service={service} icon={Activity} />
        <KpiTile metric={thirdKey} last={last} prev={prev} service={service} icon={service === "data" ? Wifi : Gauge} />
        <KpiTile metric="reclamations_pour_1000" last={last} prev={prev} service={service} icon={MessageSquareWarning} hint={last && `${fmtNumber(last.nb_reclamations)} réclamations`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card
          className="xl:col-span-3"
          title={`${tMetric.label} — ${SERVICE_LABELS[service]}`}
          subtitle="Évolution mensuelle, moyenne nationale pondérée par le nombre d'abonnés"
          actions={
            <Select aria-label="Indicateur affiché" value={tMetric.key} onChange={(e) => setTrendMetric(e.target.value as MetricKey)}>
              {available.map((m) => <option key={m.key} value={m.key}>{m.short}</option>)}
            </Select>
          }
        >
          <TrendChart
            data={trendData}
            series={[{ key: "v", name: data.operator, color }]}
            unit={unitFor(tMetric, service)}
            digits={tMetric.digits}
            ariaLabel={`Évolution de l'indicateur ${tMetric.label}`}
          />
        </Card>

        <Card
          className="xl:col-span-2"
          title="Classement des régions"
          subtitle={`${fmtMonth(data.dernierMois)} · ${rMetric.lowerIsBetter ? "les valeurs les plus élevées d'abord" : "les valeurs les plus faibles d'abord"}`}
          actions={
            <Select aria-label="Indicateur par région" value={rMetric.key} onChange={(e) => setRegionMetric(e.target.value as MetricKey)}>
              {available.filter((m) => m.key !== "nb_abonnes" && m.key !== "tarif_moyen_ar").map((m) => (
                <option key={m.key} value={m.key}>{m.short}</option>
              ))}
            </Select>
          }
        >
          <RankBars items={regionItems} unit={unitFor(rMetric, service)} digits={rMetric.digits} color={color} lowerIsBetter={rMetric.lowerIsBetter} />
        </Card>
      </div>
    </div>
  );
}

function KpiTile({
  metric,
  last,
  prev,
  service,
  icon,
  hint,
}: {
  metric: MetricKey;
  last?: MonthMetric;
  prev?: MonthMetric;
  service: Service;
  icon: typeof Users;
  hint?: React.ReactNode;
}) {
  const def = METRICS[metric];
  const v = last ? (last[metric] as number | null) : null;
  const p = prev ? (prev[metric] as number | null) : null;
  const delta = v != null && p != null && p !== 0 ? ((v - p) / Math.abs(p)) * 100 : null;
  const good = delta == null ? true : def.lowerIsBetter ? delta < 0 : delta > 0;
  const big = metric === "nb_abonnes" && v != null && v >= 1_000_000;

  return (
    <Stat
      label={metric === "reclamations_pour_1000" ? "Réclamations / 1 000 abonnés" : def.label}
      icon={icon}
      value={v == null ? "—" : big ? fmtNumber(v / 1_000_000, 2) : fmtNumber(v, def.digits)}
      unit={big ? "M" : unitFor(def, service)}
      delta={delta != null ? { value: delta, good } : null}
      hint={hint}
    />
  );
}

