"use client";

import { BarChart3 } from "lucide-react";
import { useEffect, useState } from "react";
import { TrendChart } from "@/components/charts/TrendChart";
import { Alert, Card, Empty, Skeleton, cx } from "@/components/ui";
import { api, fmtMonth, fmtNumber } from "@/lib/client/api";
import type { PublicStats } from "@/lib/client/types";
import { OPERATOR_COLORS } from "@/lib/theme";

type Op = PublicStats["operateurs"][number];

const INDICATORS: { key: keyof Op; label: string; unit: string; digits: number; lowerIsBetter: boolean }[] = [
  { key: "taux_coupure", label: "Taux de coupure", unit: "%", digits: 2, lowerIsBetter: true },
  { key: "taux_disponibilite", label: "Disponibilité", unit: "%", digits: 2, lowerIsBetter: false },
  { key: "debit_moyen_mbps", label: "Débit data", unit: "Mb/s", digits: 1, lowerIsBetter: false },
  { key: "latence_data_ms", label: "Latence data", unit: "ms", digits: 0, lowerIsBetter: true },
];

/** Comparaison publique : une carte par opérateur, puis l'évolution du taux de coupure. */
export function PublicDashboard() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<PublicStats>("/api/public/stats").then(setStats).catch((e) => setError(e.message));
  }, []);

  if (error) return <Alert>Les statistiques sont momentanément indisponibles.</Alert>;
  if (!stats) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
      </div>
    );
  }
  if (!stats.mois) {
    return <Empty icon={BarChart3} title="Pas encore de données publiées">Les comparaisons s&apos;afficheront dès que les données des trois opérateurs auront été validées.</Empty>;
  }

  // Meilleure valeur de chaque indicateur, pour la signaler.
  const best = Object.fromEntries(
    INDICATORS.map((ind) => {
      const vals = stats.operateurs.map((o) => o[ind.key] as number | null).filter((v): v is number => v != null);
      return [ind.key, vals.length ? (ind.lowerIsBetter ? Math.min(...vals) : Math.max(...vals)) : null];
    }),
  );

  const byDate = new Map<string, Record<string, number | string | null>>();
  for (const e of stats.evolution) {
    const row = byDate.get(e.date) ?? { date: e.date };
    row[e.code] = e.taux_coupure;
    byDate.set(e.date, row);
  }
  const trend = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))) as { date: string }[];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {stats.operateurs.map((op) => (
          <article key={op.code} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            <div className="h-1" style={{ background: OPERATOR_COLORS[op.code] }} aria-hidden />
            <div className="p-5">
              <h3 className="flex items-center gap-2 font-semibold text-ink">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: OPERATOR_COLORS[op.code] }} aria-hidden />
                {op.nom}
              </h3>
              <p className="mt-0.5 text-xs text-muted">{op.regions_couvertes} régions · {fmtMonth(stats.mois)}</p>
              <dl className="mt-4 divide-y divide-line">
                {INDICATORS.map((ind) => {
                  const v = op[ind.key] as number | null;
                  const isBest = v != null && v === best[ind.key];
                  return (
                    <div key={ind.key} className="flex items-baseline justify-between py-2.5">
                      <dt className="text-[13px] text-ink-2">{ind.label}</dt>
                      <dd className="flex items-baseline gap-1.5">
                        {isBest && <span className="rounded bg-good-soft px-1.5 py-0.5 text-[11px] font-medium text-good-ink">meilleur</span>}
                        <span className={cx("tabular-nums text-ink", isBest ? "font-semibold" : "font-medium")}>{fmtNumber(v, ind.digits)}</span>
                        <span className="text-xs text-muted">{ind.unit}</span>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </article>
        ))}
      </div>

      <Card title="Taux de coupure national" subtitle="Tous services confondus, pondéré par le nombre d'abonnés. Plus bas, c'est mieux.">
        <TrendChart
          data={trend}
          series={stats.operateurs.map((o) => ({ key: o.code, name: o.nom, color: OPERATOR_COLORS[o.code] }))}
          unit="%"
          digits={2}
          height={300}
          ariaLabel="Évolution du taux de coupure national par opérateur"
        />
      </Card>

      <p className="text-xs text-muted">
        {fmtNumber(stats.totaux.lignes)} mesures validées · {stats.totaux.regions} régions · {stats.totaux.mois} mois · mises à jour à chaque import approuvé.
      </p>
    </div>
  );
}
