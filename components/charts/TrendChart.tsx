"use client";

/**
 * Courbe d'évolution mensuelle, une ou plusieurs séries (une par opérateur).
 * Règles appliquées : traits de 2 px, points de fin ≥ 8 px avec anneau de la couleur
 * du fond, grille horizontale discrète, un seul axe, réticule + infobulle listant
 * toutes les séries, légende (avec dernière valeur) dès 2 séries, vue tableau.
 */
import { Table2, LineChart as LineIcon } from "lucide-react";
import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Table, cx, td, tdNum } from "@/components/ui";
import { fmtMonth, fmtNumber } from "@/lib/client/api";
import { CHART } from "@/lib/theme";

export type Series = { key: string; name: string; color: string };

/** Graduations « rondes » (pas de 1, 2, 2,5 ou 5 × 10ⁿ) couvrant les données, ~5 repères. */
function niceTicks(values: number[], count = 5): { domain: [number, number]; ticks: number[] } | null {
  if (!values.length) return null;
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= Math.abs(min) * 0.1 || 1;
    max += Math.abs(max) * 0.1 || 1;
  }
  const raw = (max - min) / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Number(t.toFixed(10)));
  return { domain: [lo, hi], ticks };
}
export type TrendRow = { date: string } & Record<string, number | string | null>;

const fmtTick = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M`
    : Math.abs(n) >= 10_000
      ? `${(n / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} k`
      : n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

export function TrendChart({
  data,
  series,
  unit,
  digits = 1,
  height = 280,
  ariaLabel,
}: {
  data: TrendRow[];
  series: Series[];
  unit: string;
  digits?: number;
  height?: number;
  ariaLabel: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const multi = series.length > 1;
  const last = data[data.length - 1];
  const scale = niceTicks(
    data.flatMap((row) => series.map((s) => row[s.key])).filter((v): v is number => typeof v === "number"),
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        {/* Légende : toujours présente dès 2 séries, avec la dernière valeur (étiquette directe). */}
        {multi ? (
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
            {series.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-ink-2">
                <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} aria-hidden />
                <span className="font-medium text-ink">{s.name}</span>
                {last && typeof last[s.key] === "number" && (
                  <span className="tabular-nums text-muted">
                    {fmtNumber(last[s.key] as number, digits)} {unit}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-xs text-muted">{unit && `En ${unit}`}</span>
        )}
        <div className="inline-flex rounded-lg bg-sunken p-0.5" role="radiogroup" aria-label="Affichage">
          {(["chart", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={cx("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium", view === v ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink")}
            >
              {v === "chart" ? <LineIcon className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
              {v === "chart" ? "Graphique" : "Tableau"}
            </button>
          ))}
        </div>
      </div>

      {view === "chart" ? (
        <div role="img" aria-label={ariaLabel} style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} strokeWidth={1} />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => fmtMonth(d)}
                tick={{ fill: CHART.tick, fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: CHART.axis }}
                minTickGap={24}
                tickMargin={8}
              />
              <YAxis
                tickFormatter={fmtTick}
                tick={{ fill: CHART.tick, fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={52}
                domain={scale?.domain ?? ["auto", "auto"]}
                ticks={scale?.ticks}
                interval={0}
              />
              <Tooltip
                cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
                content={(p) => (
                  <TrendTooltip
                    active={p.active}
                    label={p.label as string | undefined}
                    row={p.payload?.[0]?.payload as TrendRow | undefined}
                    series={series}
                    unit={unit}
                    digits={digits}
                  />
                )}
                isAnimationActive={false}
              />
              {/* Série unique : léger voile sous la courbe (≈10 %). */}
              {!multi && (
                <Area type="monotone" dataKey={series[0].key} stroke="none" fill={series[0].color} fillOpacity={CHART.areaOpacity} isAnimationActive={false} />
              )}
              {series.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={false}
                  activeDot={{ r: 5, fill: s.color, stroke: CHART.surface, strokeWidth: 2 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <Table head={["Mois", ...series.map((s) => `${s.name}${unit ? ` (${unit})` : ""}`)]} align={["left", ...series.map(() => "right" as const)]}>
          {data.map((row) => (
            <tr key={row.date}>
              <td className={cx(td, "font-medium text-ink")}>{fmtMonth(row.date)}</td>
              {series.map((s) => (
                <td key={s.key} className={tdNum}>{fmtNumber(row[s.key] as number | null, digits)}</td>
              ))}
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

/** Infobulle : la valeur d'abord (en gras), puis le nom de la série, clé en trait. */
function TrendTooltip({
  active,
  row,
  label,
  series,
  unit,
  digits,
}: {
  active?: boolean;
  row?: TrendRow;
  label?: string;
  series: Series[];
  unit: string;
  digits: number;
}) {
  if (!active || !row) return null;
  return (
    <div className="min-w-40 rounded-xl border border-line bg-surface px-3 py-2.5 text-xs shadow-pop">
      <div className="mb-1.5 font-medium text-muted">{fmtMonth(label)}</div>
      <ul className="space-y-1">
        {[...series]
          .sort((a, b) => ((row[b.key] as number) ?? -Infinity) - ((row[a.key] as number) ?? -Infinity))
          .map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden />
              <span className="font-semibold tabular-nums text-ink">
                {fmtNumber(row[s.key] as number | null, digits)} {unit}
              </span>
              {series.length > 1 && <span className="text-ink-2">{s.name}</span>}
            </li>
          ))}
      </ul>
    </div>
  );
}
