"use client";

/** Graphiques du modèle : courbes d'apprentissage, importance des variables, matrice de confusion. */
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Segmented } from "@/components/ui-client";
import { cx } from "@/components/ui";
import { fmtNumber } from "@/lib/client/api";
import type { ModelMetrics } from "@/lib/client/types";
import { FEATURES } from "@/lib/pipeline/definitions";
import { CHART } from "@/lib/theme";

export const featureLabel = (key: string) => FEATURES.find((f) => f.key === key)?.label ?? key;

const TRAIN = "#2a78d6";
const VAL = "#eb6834";

export function LearningCurves({ history }: { history: ModelMetrics["history"] }) {
  const [metric, setMetric] = useState<"mae" | "loss">(history.mae.length ? "mae" : "loss");
  const rows = useMemo(
    () =>
      history.loss.map((_, i) => ({
        epoch: i + 1,
        train: metric === "mae" ? history.mae[i] : history.loss[i],
        val: metric === "mae" ? history.val_mae[i] : history.val_loss[i],
      })),
    [history, metric],
  );
  const bestEpoch = history.val_loss.length ? history.val_loss.indexOf(Math.min(...history.val_loss)) + 1 : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Segmented size="sm" label="Mesure" value={metric} onChange={setMetric} options={[{ value: "mae", label: "MAE (pts)" }, { value: "loss", label: "Perte" }]} />
        <div className="flex items-center gap-4 text-xs text-ink-2">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: TRAIN }} />Entraînement</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: VAL }} />Validation</span>
        </div>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="epoch" tick={{ fontSize: 11, fill: CHART.tick }} tickLine={false} axisLine={{ stroke: CHART.axis }} minTickGap={24} />
            <YAxis tick={{ fontSize: 11, fill: CHART.tick }} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtNumber(v, metric === "mae" ? 0 : 3)} width={52} />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: `1px solid ${CHART.grid}`, fontSize: 12 }}
              labelFormatter={(l) => `Époque ${l}`}
              formatter={(v, name) => [fmtNumber(Number(v), metric === "mae" ? 2 : 4), name === "train" ? "Entraînement" : "Validation"]}
            />
            {bestEpoch && <ReferenceLine x={bestEpoch} stroke={CHART.ink2} strokeDasharray="4 4" label={{ value: "meilleure", position: "insideTopRight", fontSize: 10, fill: CHART.ink2 }} />}
            <Line type="monotone" dataKey="train" stroke={TRAIN} strokeWidth={2} dot={false} isAnimationActive animationDuration={900} />
            <Line type="monotone" dataKey="val" stroke={VAL} strokeWidth={2} dot={false} isAnimationActive animationDuration={900} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ImportanceBars({ importance, limit = 10 }: { importance: ModelMetrics["importance"]; limit?: number }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const top = importance.slice(0, limit);
  const max = Math.max(...top.map((d) => Math.abs(d.impact)), 0.0001);
  return (
    <ul className="space-y-2.5">
      {top.map((d, i) => (
        <li key={d.feature} className="grid grid-cols-[minmax(0,10rem)_1fr_3.5rem] items-center gap-3 text-[13px]">
          <span className="truncate text-ink-2" title={d.feature}>{featureLabel(d.feature)}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-sunken">
            <span
              className="block h-full rounded-full"
              style={{
                width: shown ? `${(Math.max(d.impact, 0) / max) * 100}%` : "0%",
                background: i < 3 ? "var(--color-brand)" : "#7d93b5",
                transition: `width 800ms cubic-bezier(.2,.8,.2,1) ${i * 60}ms`,
              }}
            />
          </span>
          <span className="text-right tabular-nums text-ink">+{fmtNumber(Math.max(d.impact, 0), 2)}</span>
        </li>
      ))}
      <li className="pt-1 text-xs text-muted">Points d&apos;erreur ajoutés quand la variable est brouillée.</li>
    </ul>
  );
}

const CLASS_LABELS: Record<string, string> = { insatisfait: "Insatisfait", neutre: "Neutre", satisfait: "Satisfait" };

export function ConfusionMatrix({ confusion, classes }: { confusion: number[][]; classes: string[] }) {
  return (
    <div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `5.5rem repeat(${classes.length}, minmax(0, 1fr))` }}>
        <span className="self-end text-[10px] uppercase tracking-wide text-muted">réel ↓ / prédit →</span>
        {classes.map((c) => (
          <span key={c} className="pb-1 text-center text-xs font-medium text-ink-2">{CLASS_LABELS[c] ?? c}</span>
        ))}
        {confusion.map((row, i) => {
          const total = row.reduce((a, b) => a + b, 0) || 1;
          return [
            <span key={`l${i}`} className="self-center text-xs font-medium text-ink-2">{CLASS_LABELS[classes[i]] ?? classes[i]}</span>,
            ...row.map((n, j) => {
              const share = n / total;
              const diag = i === j;
              return (
                <div
                  key={`${i}-${j}`}
                  className={cx("pop-in grid aspect-[4/3] place-items-center rounded-lg text-center", share > 0.5 ? "text-white" : "text-ink")}
                  style={{ background: diag ? `rgb(12 163 12 / ${0.12 + share * 0.8})` : `rgb(208 59 59 / ${0.06 + share * 0.9})`, animationDelay: `${(i * 3 + j) * 40}ms` }}
                  title={`${n} lignes`}
                >
                  <span>
                    <span className="block text-lg font-semibold tabular-nums">{Math.round(share * 100)} %</span>
                    <span className="block text-[11px] opacity-80 tabular-nums">{n}</span>
                  </span>
                </div>
              );
            }),
          ];
        })}
      </div>
      <p className="mt-3 text-xs text-muted">Diagonale en vert : bonnes prédictions. Pourcentages par ligne (classe réelle).</p>
    </div>
  );
}
