"use client";

import { ArrowDownWideNarrow, ArrowRight, BrainCircuit, Lightbulb, MapPin, MousePointerClick, Sparkles, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { TrendChart } from "@/components/charts/TrendChart";
import { QualityRing } from "@/components/pipeline/bits";
import { Alert, Badge, Card, Empty, OperatorTag, PageSkeleton, Select, Skeleton, btn, cx } from "@/components/ui";
import { Segmented } from "@/components/ui-client";
import { OPERATORS, REGIONS, SERVICES, SERVICE_LABELS, type OperatorCode, type Service } from "@/lib/constants";
import { api, fmtMonth, fmtNumber } from "@/lib/client/api";
import { FEATURES } from "@/lib/pipeline/definitions";
import { CHART, OPERATOR_COLORS } from "@/lib/theme";

/* ------------------------------------------------------------------ Types */

type Classe = "satisfait" | "neutre" | "insatisfait";
type CellPred = { operateur: OperatorCode; region: string; service: Service; score: number; classe: Classe; observe: number | null; nbAvis: number; probas: Record<string, number> };

type PredData = {
  model: { id: string; version: number; mae: number | null; r2: number | null; accuracy: number | null; datasetVersion: number };
  dataset: { id: string; version: number };
  scope: OperatorCode[];
  months: string[];
  month: string;
  prevMonth: string | null;
  service: "all" | Service;
  national: { operateur: OperatorCode; score: number | null; prev: number | null; observe: number | null; classes: Record<Classe, number> }[];
  trend: ({ date: string } & Record<string, number | string | null>)[];
  cells: CellPred[];
  fit: { points: { operateur: OperatorCode; observe: number; score: number }[]; mae: number | null; n: number };
};

type Explain = {
  cell: CellPred & { date: string };
  contributions: { feature: string; valeur: number; typique: number; contribution: number }[];
  typique: number;
  leviers: { feature: string; valeur: number; cible: number; gain: number }[];
  potentiel: number;
  historique: { date: string; score: number; observe: number | null }[];
};

type Sel = { operateur: OperatorCode; region: string; service: Service };

/* ------------------------------------------------------------------ Aides visuelles */

const CLASSE: Record<Classe, { label: string; tone: "good" | "warn" | "bad"; color: string }> = {
  satisfait: { label: "Satisfait", tone: "good", color: "var(--color-good)" },
  neutre: { label: "Neutre", tone: "warn", color: "var(--color-warn)" },
  insatisfait: { label: "Insatisfait", tone: "bad", color: "var(--color-bad)" },
};

/** Couleur continue rouge → ambre → vert selon le score (30 → 85). */
function heat(score: number, alpha = 1) {
  const t = Math.max(0, Math.min(1, (score - 30) / 55));
  const hue = t * 130;
  return `hsl(${hue} 70% ${alpha === 1 ? 42 : 50}% / ${alpha})`;
}

const fdef = (k: string) => FEATURES.find((f) => f.key === k);
const flabel = (k: string) => fdef(k)?.label ?? k;
const fval = (k: string, v: number) => `${fmtNumber(v, fdef(k)?.digits ?? 2)}${fdef(k)?.unit ? ` ${fdef(k)!.unit}` : ""}`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const opName = (c: string) => OPERATORS.find((o) => o.code === c)?.nom ?? c;

/* ------------------------------------------------------------------ Vue principale */

export function PredictionsView({ role }: { role: "admin" | "operator" }) {
  const [data, setData] = useState<PredData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<string>("");
  const [service, setService] = useState<"all" | Service>("all");
  const [sel, setSel] = useState<Sel | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams({ service, ...(month ? { month } : {}) });
    api<PredData>(`/api/predictions?${qs}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [month, service]);

  // Sélection par défaut : la zone la plus à risque.
  const worst = useMemo(() => {
    if (!data) return null;
    const pool = data.cells.filter((c) => service === "all" || c.service === service);
    return pool.length ? pool.reduce((a, b) => (b.score < a.score ? b : a)) : null;
  }, [data, service]);
  const current = sel ?? (worst ? { operateur: worst.operateur, region: worst.region, service: worst.service } : null);

  if (error) {
    return (
      <Empty icon={BrainCircuit} title="Prédictions indisponibles" action={role === "admin" && <Link href="/admin/modele" className={btn.primary}>Aller au modèle IA</Link>}>
        {error}
      </Empty>
    );
  }
  if (!data) return <PageSkeleton />;

  const single = data.scope.length === 1;

  return (
    <div className="space-y-6">
      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Service" value={service} onChange={(v) => { setService(v); setSel(null); }} options={[{ value: "all", label: "Tous services" }, ...SERVICES.map((s) => ({ value: s, label: SERVICE_LABELS[s] }))]} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2 shadow-card">
            <Sparkles className="h-3.5 w-3.5 text-brand" />
            Modèle v{data.model.version}
            {data.model.mae != null && <> · MAE {fmtNumber(data.model.mae, 1)} pts</>}
            {data.model.r2 != null && <> · R² {fmtNumber(data.model.r2, 2)}</>}
            <span className="text-faint">· dataset v{data.dataset.version}</span>
          </span>
          <Select aria-label="Mois" value={data.month} onChange={(e) => { setMonth(e.target.value); setSel(null); }}>
            {[...data.months].reverse().map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
          </Select>
        </div>
      </div>

      {/* Jauges */}
      {single ? <SingleOperatorHeader data={data} service={service} /> : (
        <div className="grid gap-4 md:grid-cols-3">
          {data.national.map((n) => <OperatorGauge key={n.operateur} n={n} prevMonth={data.prevMonth} />)}
        </div>
      )}

      {/* Carte de chaleur + explication */}
      <div className="grid gap-6 xl:grid-cols-5">
        <Card
          className="xl:col-span-3"
          title="Carte de satisfaction prédite"
          subtitle={`${fmtMonth(data.month)} · ${single ? "par région et par service" : service === "all" ? "moyenne des services, par région et opérateur" : `${SERVICE_LABELS[service]}, par région et opérateur`} · cliquez une case pour l'expliquer`}
        >
          <Heatmap data={data} service={service} single={single} sel={current} onSelect={setSel} />
        </Card>
        <div className="xl:col-span-2">
          <div className="xl:sticky xl:top-20">
            {current ? <ExplainPanel key={`${current.operateur}-${current.region}-${current.service}-${data.month}`} sel={current} month={data.month} role={role} /> : null}
          </div>
        </div>
      </div>

      {/* Évolution + risques */}
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Évolution de la satisfaction prédite" subtitle={`Moyenne nationale par mois${service === "all" ? "" : ` · ${SERVICE_LABELS[service]}`}`}>
          <TrendChart
            data={data.trend}
            series={data.scope.map((op) => ({ key: op, name: op, color: OPERATOR_COLORS[op] }))}
            unit="/100"
            digits={1}
            ariaLabel="Évolution de la satisfaction prédite par opérateur"
          />
        </Card>
        <Card className="xl:col-span-2" title="Zones à risque" subtitle="Les 8 scores prédits les plus bas ce mois-ci">
          <RiskList cells={data.cells.filter((c) => service === "all" || c.service === service)} onSelect={setSel} single={single} />
        </Card>
      </div>

      <Card title="Le modèle colle-t-il à la réalité ?" subtitle={`Satisfaction prédite vs satisfaction observée dans les avis, 3 derniers mois · ${fmtNumber(data.fit.n)} cas${data.fit.mae != null ? ` · écart moyen ${fmtNumber(data.fit.mae, 1)} pts` : ""}`}>
        <FitScatter points={data.fit.points} scope={data.scope} />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ Jauges */

function OperatorGauge({ n, prevMonth }: { n: PredData["national"][number]; prevMonth: string | null }) {
  const delta = n.score != null && n.prev != null ? n.score - n.prev : null;
  const t = n.classes.satisfait + n.classes.neutre + n.classes.insatisfait;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-card">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: OPERATOR_COLORS[n.operateur] }} />
      <div className="flex items-center gap-5">
        {n.score != null ? <QualityRing score={n.score} size={92} stroke={8} label="/100" /> : <Skeleton className="h-[92px] w-[92px] rounded-full" />}
        <div className="min-w-0 flex-1">
          <OperatorTag code={n.operateur} label={opName(n.operateur)} />
          <div className="mt-1 text-xs text-muted">Satisfaction prédite</div>
          {delta != null && (
            <div className={cx("mt-2 inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium", Math.abs(delta) < 0.1 ? "bg-sunken text-ink-2" : delta > 0 ? "bg-good-soft text-good-ink" : "bg-bad-soft text-bad-ink")}>
              {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} {fmtNumber(Math.abs(delta), 1)} pt{prevMonth ? ` vs ${fmtMonth(prevMonth)}` : ""}
            </div>
          )}
          {n.observe != null && <div className="mt-1.5 text-xs text-muted">Observé (avis) : <span className="font-medium text-ink">{fmtNumber(n.observe, 1)}</span></div>}
        </div>
      </div>
      {t > 0 && (
        <div className="mt-4">
          <div className="flex h-2 overflow-hidden rounded-full bg-sunken">
            {(Object.keys(CLASSE) as Classe[]).map((c) => <span key={c} className="transition-all duration-700" style={{ width: `${(n.classes[c] / t) * 100}%`, background: CLASSE[c].color }} />)}
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-muted">
            {(Object.keys(CLASSE) as Classe[]).map((c) => <span key={c}>{n.classes[c]} {CLASSE[c].label.toLowerCase()}{n.classes[c] > 1 ? "s" : ""}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

function SingleOperatorHeader({ data, service }: { data: PredData; service: "all" | Service }) {
  const n = data.national[0];
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_2fr]">
      <OperatorGauge n={n} prevMonth={data.prevMonth} />
      <div className="grid grid-cols-2 gap-3">
        {SERVICES.map((s) => {
          const sc = mean(data.cells.filter((c) => c.service === s).map((c) => c.score));
          return (
            <div key={s} className={cx("rounded-2xl border bg-surface px-4 py-3 shadow-card transition", service === s ? "border-brand" : "border-line")}>
              <div className="text-[13px] font-medium text-ink-2">{SERVICE_LABELS[s]}</div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-semibold tabular-nums" style={{ color: sc != null ? heat(sc) : undefined }}>{sc == null ? "—" : fmtNumber(sc, 1)}</span>
                <span className="text-xs text-muted">/100</span>
              </div>
              {sc != null && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken"><span className="block h-full rounded-full transition-all duration-700" style={{ width: `${sc}%`, background: heat(sc) }} /></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Carte de chaleur */

function Heatmap({ data, service, single, sel, onSelect }: { data: PredData; service: "all" | Service; single: boolean; sel: Sel | null; onSelect: (s: Sel) => void }) {
  const [sort, setSort] = useState<"nom" | "score">("score");
  const columns: { key: string; label: string; color?: string }[] = single
    ? SERVICES.map((s) => ({ key: s, label: SERVICE_LABELS[s] }))
    : data.scope.map((op) => ({ key: op, label: op, color: OPERATOR_COLORS[op] }));

  // Valeur d'une case + case sous-jacente à expliquer (le service le plus faible si on agrège).
  const cellFor = (region: string, col: string) => {
    const pool = data.cells.filter((c) => c.region === region && (single ? c.service === col : c.operateur === col && (service === "all" || c.service === service)));
    if (!pool.length) return null;
    const worst = pool.reduce((a, b) => (b.score < a.score ? b : a));
    return { score: mean(pool.map((c) => c.score))!, worst };
  };

  const regions = [...REGIONS]
    .map((r) => ({ r, avg: mean(columns.map((c) => cellFor(r, c.key)?.score).filter((v): v is number => v != null)) }))
    .filter((x) => x.avg != null)
    .sort((a, b) => (sort === "nom" ? a.r.localeCompare(b.r) : a.avg! - b.avg!));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span>30</span>
          <span className="h-2 w-32 rounded-full" style={{ background: `linear-gradient(90deg, ${heat(30)}, ${heat(57)}, ${heat(85)})` }} />
          <span>85+</span>
        </div>
        <button type="button" className={cx(btn.ghost, btn.sm)} onClick={() => setSort((s) => (s === "nom" ? "score" : "nom"))}>
          <ArrowDownWideNarrow /> {sort === "score" ? "Tri : plus faibles d'abord" : "Tri : alphabétique"}
        </button>
      </div>
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th className="text-left text-xs font-medium text-muted">Région</th>
              {columns.map((c) => (
                <th key={c.key} className="min-w-20 text-center text-xs font-medium text-ink-2">
                  <span className="inline-flex items-center gap-1.5">{c.color && <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />}{c.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {regions.map(({ r }) => (
              <tr key={r}>
                <td className="whitespace-nowrap pr-2 text-[13px] text-ink">{r}</td>
                {columns.map((c) => {
                  const v = cellFor(r, c.key);
                  if (!v) return <td key={c.key} className="rounded-md bg-sunken text-center text-xs text-faint">—</td>;
                  const active = sel && sel.region === r && (single ? sel.service === c.key : sel.operateur === c.key);
                  return (
                    <td key={c.key} className="p-0">
                      <button
                        type="button"
                        onClick={() => onSelect({ operateur: v.worst.operateur, region: r, service: v.worst.service })}
                        title={`${r} · ${c.label} : ${fmtNumber(v.score, 1)}/100`}
                        className={cx("w-full rounded-md py-1.5 text-center text-[13px] font-semibold tabular-nums text-white transition hover:scale-105 hover:shadow-pop", active && "ring-2 ring-ink ring-offset-2 ring-offset-surface")}
                        style={{ background: heat(v.score) }}
                      >
                        {fmtNumber(v.score, 0)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Explication */

function ExplainPanel({ sel, month, role }: { sel: Sel; month: string; role: "admin" | "operator" }) {
  const [d, setD] = useState<Explain | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams({ operateur: sel.operateur, region: sel.region, service: sel.service, date: month });
    api<Explain>(`/api/predictions/explain?${qs}`).then(setD).catch((e) => setErr(e.message));
  }, [sel, month]);

  if (err) return <Alert>{err}</Alert>;
  if (!d) return <Skeleton className="h-[560px] rounded-2xl" />;

  const c = d.cell;
  const maxAbs = Math.max(...d.contributions.map((x) => Math.abs(x.contribution)), 0.5);
  const gainTotal = d.potentiel - c.score;

  return (
    <section className="animate-fade-in overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="relative p-5" style={{ background: `linear-gradient(135deg, ${heat(c.score, 0.14)}, transparent 70%)` }}>
        <div className="flex items-center gap-2 text-xs text-muted">
          <MousePointerClick className="h-3.5 w-3.5" /> Pourquoi ce score ?
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <OperatorTag code={c.operateur} />
          <span className="text-muted">·</span>
          <span className="inline-flex items-center gap-1 font-medium text-ink"><MapPin className="h-3.5 w-3.5 text-muted" />{c.region}</span>
          <span className="text-muted">·</span>
          <span className="font-medium text-ink">{SERVICE_LABELS[c.service]}</span>
        </div>
        <div className="mt-4 flex items-end gap-4">
          <div>
            <div className="text-5xl font-semibold leading-none tracking-tight tabular-nums" style={{ color: heat(c.score) }}>{fmtNumber(c.score, 1)}</div>
            <div className="mt-1 text-xs text-muted">sur 100 · {fmtMonth(c.date)}</div>
          </div>
          <div className="mb-1 space-y-1">
            <Badge tone={CLASSE[c.classe].tone}>{CLASSE[c.classe].label} · {fmtNumber((c.probas[c.classe] ?? 0) * 100)} %</Badge>
            <div className="text-xs text-muted">
              Situation typique : <b className="text-ink">{fmtNumber(d.typique, 1)}</b>
              {c.observe != null && <> · observé : <b className="text-ink">{fmtNumber(c.observe, 1)}</b> ({c.nbAvis} avis)</>}
            </div>
          </div>
        </div>
        <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-sunken" title="Probabilités par classe">
          {(Object.keys(CLASSE) as Classe[]).map((k) => <span key={k} style={{ width: `${(c.probas[k] ?? 0) * 100}%`, background: CLASSE[k].color }} />)}
        </div>
      </div>

      <div className="border-t border-line p-5">
        <h3 className="text-[13px] font-semibold text-ink">Ce qui pèse sur la prédiction</h3>
        <p className="mt-0.5 text-xs text-muted">Effet de chaque indicateur par rapport à sa valeur médiane, en points de satisfaction.</p>
        <ul className="mt-3 space-y-1.5">
          {d.contributions.slice(0, 8).map((x) => {
            const w = (Math.abs(x.contribution) / maxAbs) * 50;
            const pos = x.contribution >= 0;
            return (
              <li key={x.feature} className="grid grid-cols-[minmax(0,9rem)_1fr_3.2rem] items-center gap-2 text-xs" title={`${flabel(x.feature)} : ${fval(x.feature, x.valeur)} (médiane ${fval(x.feature, x.typique)})`}>
                <span className="truncate text-ink-2">{flabel(x.feature)}</span>
                <span className="relative h-4">
                  <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
                  <span
                    className="absolute inset-y-0.5 rounded-sm transition-all duration-700"
                    style={{ left: pos ? "50%" : `${50 - w}%`, width: `${w}%`, background: pos ? "var(--color-good)" : "var(--color-bad)" }}
                  />
                </span>
                <span className={cx("text-right font-medium tabular-nums", pos ? "text-good-ink" : "text-bad-ink")}>{pos ? "+" : ""}{fmtNumber(x.contribution, 1)}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {d.leviers.length > 0 && (
        <div className="border-t border-line bg-page/50 p-5">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink"><Lightbulb className="h-4 w-4 text-warn" /> Leviers d&apos;amélioration</h3>
          <ul className="mt-2 space-y-2">
            {d.leviers.map((l) => (
              <li key={l.feature} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-ink-2">
                  {flabel(l.feature)} : <span className="tabular-nums">{fval(l.feature, l.valeur)}</span> <ArrowRight className="inline h-3 w-3" /> <span className="font-medium tabular-nums text-ink">{fval(l.feature, l.cible)}</span>
                </span>
                <span className="shrink-0 rounded-md bg-good-soft px-1.5 py-0.5 font-medium tabular-nums text-good-ink">+{fmtNumber(l.gain, 1)} pt</span>
              </li>
            ))}
          </ul>
          {gainTotal > 0.2 && (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-good/25 bg-good-soft px-3 py-2 text-xs text-good-ink">
              <Sparkles className="h-4 w-4 shrink-0" />
              <span>En ramenant ces indicateurs à la médiane, le score passerait de <b>{fmtNumber(c.score, 1)}</b> à <b>{fmtNumber(d.potentiel, 1)}</b> (+{fmtNumber(gainTotal, 1)} pts).</span>
            </div>
          )}
        </div>
      )}

      {d.historique.length > 1 && (
        <div className="border-t border-line p-5">
          <h3 className="text-[13px] font-semibold text-ink">Historique de cette zone</h3>
          <div className="mt-2 h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={d.historique} margin={{ top: 6, right: 6, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="date" tickFormatter={(v) => fmtMonth(v)} tick={{ fill: CHART.tick, fontSize: 10 }} tickLine={false} axisLine={{ stroke: CHART.axis }} minTickGap={20} />
                <YAxis domain={[0, 100]} tick={{ fill: CHART.tick, fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip labelFormatter={(v) => fmtMonth(String(v))} formatter={(v, n) => [fmtNumber(Number(v), 1), n === "score" ? "Prédit" : "Observé"]} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <ReferenceLine x={c.date} stroke={CHART.axis} strokeDasharray="3 3" />
                <Line type="monotone" dataKey="score" stroke={OPERATOR_COLORS[c.operateur]} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="observe" stroke={CHART.ink2} strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex gap-4 text-[11px] text-muted">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: OPERATOR_COLORS[c.operateur] }} />Prédit</span>
            <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t border-dashed border-ink-2" />Observé (avis)</span>
          </div>
        </div>
      )}

      {role === "admin" && (
        <div className="border-t border-line px-5 py-3 text-right">
          <Link href="/admin/modele" className="text-[13px] font-medium text-brand hover:underline">Tester d&apos;autres valeurs dans le simulateur →</Link>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ Zones à risque */

function RiskList({ cells, onSelect, single }: { cells: CellPred[]; onSelect: (s: Sel) => void; single: boolean }) {
  const risks = [...cells].sort((a, b) => a.score - b.score).slice(0, 8);
  if (!risks.length) return <p className="text-sm text-muted">Aucune donnée.</p>;
  return (
    <ul className="space-y-1.5">
      {risks.map((c, i) => (
        <li key={`${c.operateur}-${c.region}-${c.service}`}>
          <button
            type="button"
            onClick={() => onSelect({ operateur: c.operateur, region: c.region, service: c.service })}
            className="flex w-full items-center gap-3 rounded-xl border border-line px-3 py-2 text-left transition hover:border-line-strong hover:bg-page"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-semibold text-white" style={{ background: heat(c.score) }}>{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink">{c.region}</span>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                {!single && <><span className="h-2 w-2 rounded-full" style={{ background: OPERATOR_COLORS[c.operateur] }} />{c.operateur} ·</>} {SERVICE_LABELS[c.service]}
              </span>
            </span>
            {c.classe === "insatisfait" && <TriangleAlert className="h-4 w-4 text-bad" />}
            <span className="text-sm font-semibold tabular-nums" style={{ color: heat(c.score) }}>{fmtNumber(c.score, 1)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ Prédit vs observé */

function FitScatter({ points, scope }: { points: PredData["fit"]["points"]; scope: OperatorCode[] }) {
  if (!points.length) return <p className="py-6 text-center text-sm text-muted">Pas encore d&apos;avis sur les derniers mois pour comparer.</p>;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_14rem]">
      <div className="h-72" role="img" aria-label="Nuage de points satisfaction prédite contre observée">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
            <CartesianGrid stroke={CHART.grid} />
            <XAxis type="number" dataKey="observe" name="Observé" domain={[0, 100]} tick={{ fill: CHART.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: CHART.axis }} label={{ value: "Observé (avis)", position: "insideBottomRight", offset: -2, fill: CHART.tick, fontSize: 11 }} />
            <YAxis type="number" dataKey="score" name="Prédit" domain={[0, 100]} tick={{ fill: CHART.tick, fontSize: 11 }} tickLine={false} axisLine={false} />
            <ZAxis range={[28, 28]} />
            <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke={CHART.axis} strokeDasharray="4 4" />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v) => fmtNumber(Number(v), 1)} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
            {scope.map((op) => (
              <Scatter key={op} name={op} data={points.filter((p) => p.operateur === op)} fill={OPERATOR_COLORS[op]} fillOpacity={0.6} animationDuration={800} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-3 text-[13px] text-ink-2">
        <p>Chaque point est une zone (région × service × mois). Plus les points sont proches de la diagonale, plus la prédiction est juste.</p>
        <ul className="space-y-1">
          {scope.map((op) => (
            <li key={op} className="flex items-center gap-2 text-xs"><span className="h-2.5 w-2.5 rounded-full" style={{ background: OPERATOR_COLORS[op] }} />{opName(op)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
