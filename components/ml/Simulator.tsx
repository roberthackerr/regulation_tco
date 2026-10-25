"use client";

/**
 * Simulateur « et si ? » : le modèle tourne directement dans le navigateur (poids récupérés
 * depuis Kaggle), chaque mouvement de curseur donne une nouvelle prédiction instantanée.
 */
import { ChevronDown, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Select, btn, cx } from "@/components/ui";
import { scoreColor } from "@/components/pipeline/bits";
import { fmtNumber } from "@/lib/client/api";
import type { ModelDetail } from "@/lib/client/types";
import { OPERATORS, REGIONS, SERVICES, SERVICE_LABELS, type Service } from "@/lib/constants";
import { featureApplies, predict, type PredictInput } from "@/lib/ml/predict";
import { FEATURES } from "@/lib/pipeline/definitions";
import { CHART, OPERATOR_COLORS } from "@/lib/theme";
import { featureLabel } from "./Charts";

const CLASS_META: Record<string, { label: string; color: string }> = {
  satisfait: { label: "Satisfait", color: "var(--color-good)" },
  neutre: { label: "Neutre", color: "var(--color-warn)" },
  insatisfait: { label: "Insatisfait", color: "var(--color-bad)" },
};

const def = (k: string) => FEATURES.find((f) => f.key === k);
const fmtFeature = (k: string, v: number | null) => {
  if (v == null) return "sans objet";
  const d = def(k);
  return `${fmtNumber(v, d?.digits ?? 2)}${d?.unit ? ` ${d.unit}` : ""}`;
};

export function Simulator({ model }: { model: ModelDetail }) {
  const { preprocess, weights, ranges, metrics } = model;
  const ordered = useMemo(() => {
    const rank = new Map(metrics.importance.map((d, i) => [d.feature, i]));
    return [...preprocess.features].filter((f) => ranges[f]).sort((a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99));
  }, [preprocess.features, ranges, metrics.importance]);

  const medians = useMemo(() => Object.fromEntries(ordered.map((f) => [f, ranges[f].mediane])), [ordered, ranges]);
  const [operateur, setOperateur] = useState<string>(OPERATORS[0].code);
  const [service, setService] = useState<Service>("data");
  const [region, setRegion] = useState<string>("Analamanga");
  const [values, setValues] = useState<Record<string, number>>(medians);
  const [showAll, setShowAll] = useState(false);
  const [focus, setFocus] = useState<string>(ordered[0] ?? "");

  const input = (over: Partial<PredictInput> = {}, feat: Record<string, number> = values): PredictInput => {
    const s = (over.service ?? service) as string;
    return {
      operateur,
      service: s,
      region,
      ...over,
      features: Object.fromEntries(ordered.map((f) => [f, featureApplies(f, s) ? feat[f] : null])),
    };
  };

  const pred = predict(preprocess, weights, input());
  const base = predict(preprocess, weights, input({}, medians));
  const byOperator = OPERATORS.map((o) => ({ code: o.code, score: predict(preprocess, weights, input({ operateur: o.code })).score }));

  const curve = useMemo(() => {
    if (!focus || !ranges[focus]) return [];
    const { min, max } = ranges[focus];
    return Array.from({ length: 41 }, (_, i) => {
      const x = min + ((max - min) * i) / 40;
      return { x, score: predict(preprocess, weights, input({}, { ...values, [focus]: x })).score };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, values, operateur, service, region, preprocess, weights, ranges]);

  const visible = showAll ? ordered : ordered.slice(0, 6);
  const delta = pred.score - base.score;

  /** Scénario automatique : pousse chaque variable importante dans le sens qui améliore (ou dégrade) le score. */
  function scenario(direction: 1 | -1) {
    const next = { ...values };
    for (const f of ordered.slice(0, 8)) {
      const { min, max } = ranges[f];
      const lo = predict(preprocess, weights, input({}, { ...next, [f]: min })).score;
      const hi = predict(preprocess, weights, input({}, { ...next, [f]: max })).score;
      const best = (hi - lo) * direction > 0 ? max : min;
      next[f] = next[f] + (best - next[f]) * 0.7;
    }
    setValues(next);
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand" /> Simulateur de satisfaction
        </span>
      }
      subtitle={`Modèle v${model.version} exécuté dans votre navigateur · déplacez les curseurs, la prédiction suit en temps réel`}
      actions={
        <>
          <button type="button" className={cx(btn.secondary, btn.sm)} onClick={() => scenario(-1)}>
            <Wand2 /> Pire scénario
          </button>
          <button type="button" className={cx(btn.secondary, btn.sm)} onClick={() => scenario(1)}>
            <Wand2 /> Meilleur scénario
          </button>
          <button type="button" className={cx(btn.ghost, btn.sm)} onClick={() => setValues(medians)}>
            <RotateCcw /> Médianes
          </button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Entrées */}
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap gap-2">
            <Select value={operateur} onChange={(e) => setOperateur(e.target.value)} aria-label="Opérateur">
              {OPERATORS.map((o) => <option key={o.code} value={o.code}>{o.nom}</option>)}
            </Select>
            <Select value={service} onChange={(e) => setService(e.target.value as Service)} aria-label="Service">
              {SERVICES.map((s) => <option key={s} value={s}>{SERVICE_LABELS[s]}</option>)}
            </Select>
            <Select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Région">
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </div>

          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {visible.map((f) => {
              const r = ranges[f];
              const applies = featureApplies(f, service);
              const v = values[f] ?? r.mediane;
              const step = (r.max - r.min) / 200 || 0.01;
              return (
                <label key={f} className={cx("block rounded-lg px-2 py-1.5 transition-colors", focus === f ? "bg-brand-soft/60" : "hover:bg-page", !applies && "opacity-45")} onMouseEnter={() => applies && setFocus(f)}>
                  <span className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="truncate font-medium text-ink" title={def(f)?.description}>{featureLabel(f)}</span>
                    <span className="shrink-0 tabular-nums text-ink-2">{fmtFeature(f, applies ? v : null)}</span>
                  </span>
                  <input
                    type="range"
                    min={r.min}
                    max={r.max}
                    step={step}
                    value={v}
                    disabled={!applies}
                    onFocus={() => setFocus(f)}
                    onChange={(e) => setValues((s) => ({ ...s, [f]: Number(e.target.value) }))}
                    className="w-full accent-[var(--color-brand)]"
                  />
                </label>
              );
            })}
          </div>
          {ordered.length > 6 && (
            <button type="button" onClick={() => setShowAll((s) => !s)} className={cx(btn.ghost, btn.sm)}>
              <ChevronDown className={cx("transition-transform", showAll && "rotate-180")} />
              {showAll ? "Variables principales seulement" : `Toutes les variables (${ordered.length})`}
            </button>
          )}
        </div>

        {/* Résultat */}
        <div className="space-y-5 rounded-2xl bg-page p-4">
          <Gauge score={pred.score} delta={delta} />
          <div className="space-y-1.5">
            {Object.entries(pred.probas)
              .sort((a, b) => b[1] - a[1])
              .map(([c, p]) => (
                <div key={c} className="grid grid-cols-[5.5rem_1fr_2.75rem] items-center gap-2 text-xs">
                  <span className={cx("font-medium", c === pred.classe ? "text-ink" : "text-ink-2")}>{CLASS_META[c]?.label ?? c}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-sunken">
                    <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${p * 100}%`, background: CLASS_META[c]?.color }} />
                  </span>
                  <span className="text-right tabular-nums text-ink-2">{Math.round(p * 100)} %</span>
                </div>
              ))}
          </div>
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted">Même situation, autre opérateur</div>
            <div className="space-y-1.5">
              {byOperator.map((o) => (
                <button key={o.code} type="button" onClick={() => setOperateur(o.code)} className={cx("grid w-full grid-cols-[4rem_1fr_2.5rem] items-center gap-2 rounded-md text-left text-xs", o.code === operateur && "font-semibold")}>
                  <span className="text-ink-2">{o.code}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-sunken">
                    <span className="block h-full rounded-full transition-[width] duration-300" style={{ width: `${o.score}%`, background: OPERATOR_COLORS[o.code] }} />
                  </span>
                  <span className="text-right tabular-nums text-ink">{fmtNumber(o.score, 0)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Sensibilité */}
      {focus && curve.length > 0 && (
        <div className="mt-6 border-t border-line pt-5">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-ink">
              Sensibilité à « {featureLabel(focus)} »
              <span className="ml-2 font-normal text-muted">toutes choses égales par ailleurs</span>
            </h3>
            <Select value={focus} onChange={(e) => setFocus(e.target.value)} aria-label="Variable étudiée">
              {ordered.filter((f) => featureApplies(f, service)).map((f) => <option key={f} value={f}>{featureLabel(f)}</option>)}
            </Select>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curve} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
                <ReferenceArea y1={65} y2={100} fill="var(--color-good)" fillOpacity={0.06} />
                <ReferenceArea y1={0} y2={45} fill="var(--color-bad)" fillOpacity={0.05} />
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="x" type="number" domain={["dataMin", "dataMax"]} tick={{ fontSize: 11, fill: CHART.tick }} tickLine={false} axisLine={{ stroke: CHART.axis }} tickFormatter={(v: number) => fmtNumber(v, def(focus)?.digits ?? 1)} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 45, 65, 100]} tick={{ fontSize: 11, fill: CHART.tick }} tickLine={false} axisLine={false} width={44} />
                <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${CHART.grid}`, fontSize: 12 }} labelFormatter={(v) => fmtFeature(focus, Number(v))} formatter={(v) => [`${fmtNumber(Number(v), 1)} / 100`, "Satisfaction prédite"]} />
                <Line type="monotone" dataKey="score" stroke={CHART.single} strokeWidth={2} dot={false} isAnimationActive={false} />
                <ReferenceDot x={values[focus]} y={pred.score} r={6} fill={scoreColor(pred.score)} stroke={CHART.surface} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Jauge demi-cercle animée (0–100), colorée selon la classe. */
function Gauge({ score, delta }: { score: number; delta: number }) {
  const r = 70;
  const len = Math.PI * r;
  const s = Math.max(0, Math.min(100, score));
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 180 100" className="w-full max-w-[15rem]" role="img" aria-label={`Satisfaction prédite : ${Math.round(s)} sur 100`}>
        <path d="M 20 90 A 70 70 0 0 1 160 90" fill="none" stroke="var(--color-sunken)" strokeWidth="14" strokeLinecap="round" />
        <path
          d="M 20 90 A 70 70 0 0 1 160 90"
          fill="none"
          stroke={scoreColor(s)}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - s / 100)}
          style={{ transition: "stroke-dashoffset 350ms cubic-bezier(.2,.8,.2,1), stroke 350ms" }}
        />
        <text x="90" y="78" textAnchor="middle" className="fill-ink" style={{ fontSize: 34, fontWeight: 650 }}>
          {fmtNumber(s, 0)}
        </text>
        <text x="90" y="96" textAnchor="middle" className="fill-muted" style={{ fontSize: 10 }}>
          satisfaction prédite / 100
        </text>
      </svg>
      <div className={cx("mt-1 text-xs font-medium tabular-nums", Math.abs(delta) < 0.5 ? "text-muted" : delta > 0 ? "text-good-ink" : "text-bad-ink")}>
        {Math.abs(delta) < 0.5 ? "≈ situation médiane" : `${delta > 0 ? "+" : "−"}${fmtNumber(Math.abs(delta), 1)} pts vs situation médiane`}
      </div>
    </div>
  );
}
