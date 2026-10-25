"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileJson,
  FileSpreadsheet,
  Languages,
  Layers,
  MessageSquareHeart,
  Rows3,
  Tags,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { TrendChart } from "@/components/charts/TrendChart";
import { ClassBar, Histogram, QualityRing } from "@/components/pipeline/bits";
import { Alert, Badge, Card, OperatorTag, PageSkeleton, Select, Stat, btn, cx } from "@/components/ui";
import { Segmented } from "@/components/ui-client";
import { OPERATORS, REGIONS, SERVICES, SERVICE_LABELS, type OperatorCode, type Service } from "@/lib/constants";
import { api, fmtDateTime, fmtMonth, fmtNumber, fmtPeriod } from "@/lib/client/api";
import type { DatasetDetail, DatasetRowView } from "@/lib/client/types";
import { FEATURES, FEATURE_GROUPS, type FeatureDef } from "@/lib/pipeline/definitions";
import { OPERATOR_COLORS } from "@/lib/theme";

const FEATURE_BY_KEY = new Map(FEATURES.map((f) => [f.key, f]));
const labelOf = (k: string) => (k === "satisfaction" ? "Satisfaction" : FEATURE_BY_KEY.get(k)?.label ?? k);

type Filters = { operateur: string; service: string; region: string; classe: string; etiquetees: boolean; sort: string; dir: "asc" | "desc"; page: number };
const INITIAL: Filters = { operateur: "", service: "", region: "", classe: "", etiquetees: false, sort: "date", dir: "desc", page: 1 };

export function DatasetView() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<DatasetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(INITIAL);
  // Clé de la dernière réponse reçue : tant qu'elle diffère des filtres, le tableau est en chargement.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const key = JSON.stringify(filters);

  useEffect(() => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(JSON.parse(key) as Filters)) if (v !== "" && v !== false) qs.set(k, String(v === true ? 1 : v));
    let stale = false;
    api<DatasetDetail>(`/api/admin/datasets/${id}?${qs}`)
      .then((d) => {
        if (stale) return;
        setData(d);
        setLoadedKey(key);
      })
      .catch((e) => setError(e.message));
    return () => {
      stale = true;
    };
  }, [id, key]);
  const loadingRows = loadedKey !== key;

  if (error) return <Alert title="Version introuvable">{error}</Alert>;
  if (!data) return <PageSkeleton />;

  const update = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, page: 1, ...patch }));
  const prev = data.previous;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/pipeline" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Pipeline
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            <QualityRing score={data.qualite.score ?? 0} size={72} stroke={7} label="Score qualité" />
            <div className="min-w-0">
              <div className="mb-1 text-xs font-medium uppercase tracking-[0.08em] text-muted">Dataset d&apos;entraînement</div>
              <h1 className="flex flex-wrap items-center gap-2 text-[26px] font-semibold leading-tight tracking-tight text-ink">
                Version v{data.version}
                <ChecksumChip value={data.checksum} />
              </h1>
              <p className="mt-1 text-sm text-ink-2">
                {fmtPeriod(data.periodStart, data.periodEnd)} · créée le {fmtDateTime(data.createdAt)} · cible « satisfaction » (0–100)
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`/api/admin/datasets/${id}/export?format=csv`} className={cx(btn.secondary, !data.rowsAvailable && "pointer-events-none opacity-50")}>
              <FileSpreadsheet /> CSV
            </a>
            <a href={`/api/admin/datasets/${id}/export?format=json`} className={cx(btn.secondary, !data.rowsAvailable && "pointer-events-none opacity-50")}>
              <FileJson /> JSON + scaler
            </a>
          </div>
        </div>
      </div>

      {!data.rowsAvailable && (
        <Alert tone="warn" title="Lignes purgées">Seules les 5 dernières versions conservent leurs lignes. Le résumé statistique reste consultable.</Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Lignes" value={fmtNumber(data.nbLignes)} icon={Rows3} delta={prev ? pct(data.nbLignes, prev.nbLignes) : null} hint={prev ? `vs v${prev.version}` : "première version"} />
        <Stat label="Lignes étiquetées" value={`${fmtNumber(data.qualite.etiquetage ?? 0, 1)} %`} icon={Tags} hint={`${fmtNumber(data.nbEtiquetees)} avec un score`} />
        <Stat label="Avis fusionnés" value={fmtNumber(data.nbAvis)} icon={MessageSquareHeart} delta={prev ? pct(data.nbAvis, prev.nbAvis) : null} />
        <Stat label="Features" value={fmtNumber(data.nbFeatures)} icon={Layers} hint={`complétude ${fmtNumber(data.qualite.completude ?? 0, 1)} %`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Satisfaction mensuelle" subtitle="Moyenne des lignes étiquetées, par opérateur">
          <SatisfactionTrend data={data} />
        </Card>
        <Card className="xl:col-span-2" title="Satisfaction par service" subtitle="Score moyen 0–100 · seuils 45 / 65">
          <SatisfactionGrid data={data} />
          <div className="mt-5">
            <div className="mb-2 text-xs font-medium text-muted">Répartition des classes</div>
            <ClassBreakdown classes={data.classes} />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Matrice de corrélation" subtitle="Pearson, sur les paires de valeurs présentes · survolez une case">
          <CorrelationMatrix keys={data.correlations.keys} matrix={data.correlations.matrix} />
        </Card>
        <Card className="xl:col-span-2" title="Ce qui pèse sur la satisfaction" subtitle="Corrélation de chaque feature avec la cible">
          <TargetDrivers keys={data.correlations.keys} matrix={data.correlations.matrix} />
        </Card>
      </div>

      <FeatureCards data={data} />

      <div className="grid gap-6 xl:grid-cols-3">
        <SentimentCard data={data} />
        <Card className="xl:col-span-2" title="Qualité du dataset" subtitle="Comment le score est calculé">
          <QualityBreakdown data={data} />
        </Card>
      </div>

      <Card
        padded={false}
        title="Aperçu des lignes"
        subtitle={`${fmtNumber(data.total)} ligne(s) correspondant aux filtres`}
        actions={
          <button type="button" className={cx(btn.ghost, btn.sm)} onClick={() => setFilters(INITIAL)}>
            Réinitialiser
          </button>
        }
      >
        <RowsTable data={data} filters={filters} update={update} setPage={(page) => setFilters((f) => ({ ...f, page }))} loading={loadingRows} />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ En-tête */

function pct(a: number, b: number) {
  if (!b) return null;
  const v = ((a - b) / b) * 100;
  return { value: v, good: v >= 0 };
}

function ChecksumChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-md bg-sunken px-2 py-1 font-mono text-[11px] font-normal text-muted hover:text-ink"
      title="Copier l'empreinte SHA-256"
    >
      {copied ? <Check className="h-3 w-3 text-good" /> : <Copy className="h-3 w-3" />}
      sha256:{value.slice(0, 12)}
    </button>
  );
}

/* ------------------------------------------------------------------ Satisfaction */

function SatisfactionTrend({ data }: { data: DatasetDetail }) {
  const rows = useMemo(() => {
    const byDate = new Map<string, { date: string } & Record<string, number | string | null>>();
    for (const p of data.satisfaction.parMois) {
      const row = byDate.get(p.date) ?? { date: p.date };
      row[p.operateur] = p.moyenne;
      byDate.set(p.date, row);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [data.satisfaction.parMois]);
  const present = OPERATORS.filter((o) => data.satisfaction.parMois.some((p) => p.operateur === o.code));
  if (!rows.length) return <p className="py-12 text-center text-sm text-muted">Aucune ligne étiquetée : chargez des avis puis relancez le pipeline.</p>;
  return (
    <TrendChart
      data={rows}
      series={present.map((o) => ({ key: o.code, name: o.code, color: OPERATOR_COLORS[o.code] }))}
      unit="/100"
      digits={1}
      height={260}
      ariaLabel="Évolution mensuelle de la satisfaction par opérateur"
    />
  );
}

function scoreTone(v: number) {
  return v >= 65 ? "bg-good-soft text-good-ink" : v >= 45 ? "bg-warn-soft text-warn-ink" : "bg-bad-soft text-bad-ink";
}

function SatisfactionGrid({ data }: { data: DatasetDetail }) {
  const ops = OPERATORS.filter((o) => data.satisfaction.parOpService.some((p) => p.operateur === o.code));
  if (!ops.length) return <p className="py-6 text-center text-sm text-muted">Pas encore de satisfaction calculée.</p>;
  const get = (op: OperatorCode, s: Service) => data.satisfaction.parOpService.find((p) => p.operateur === op && p.service === s);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th />
            {SERVICES.map((s) => (
              <th key={s} scope="col" className="px-1 pb-1 text-center text-xs font-normal text-muted">{SERVICE_LABELS[s]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ops.map((o) => (
            <tr key={o.code}>
              <th scope="row" className="pr-2 text-left text-[13px]"><OperatorTag code={o.code} /></th>
              {SERVICES.map((s) => {
                const c = get(o.code, s);
                return (
                  <td key={s} className="p-0">
                    {c ? (
                      <div className={cx("rounded-lg px-2 py-2.5 text-center font-semibold tabular-nums transition-transform hover:scale-105", scoreTone(c.moyenne))} title={`${o.code} · ${SERVICE_LABELS[s]} : ${c.moyenne}/100 (${c.n} lignes)`}>
                        {fmtNumber(c.moyenne, 1)}
                      </div>
                    ) : (
                      <div className="rounded-lg bg-sunken px-2 py-2.5 text-center text-faint">—</div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClassBreakdown({ classes }: { classes: DatasetDetail["classes"] }) {
  const items = [
    { k: "satisfait", label: "Satisfait", v: classes.satisfait ?? 0, color: "var(--color-good)" },
    { k: "neutre", label: "Neutre", v: classes.neutre ?? 0, color: "var(--color-warn)" },
    { k: "insatisfait", label: "Insatisfait", v: classes.insatisfait ?? 0, color: "var(--color-bad)" },
  ];
  const t = items.reduce((s, i) => s + i.v, 0);
  return (
    <div>
      <ClassBar classes={classes} className="!block !w-full [&>div:first-child]:h-3" />
      <div className="mt-3 grid grid-cols-3 gap-2">
        {items.map((i) => (
          <div key={i.k} className="rounded-lg bg-page px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs text-muted"><span className="h-2 w-2 rounded-full" style={{ background: i.color }} />{i.label}</div>
            <div className="mt-0.5 font-semibold tabular-nums text-ink">{fmtNumber(i.v)} <span className="text-xs font-normal text-muted">{t ? `${Math.round((i.v / t) * 100)} %` : ""}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Corrélations */

function corrColor(r: number | null) {
  if (r == null) return "var(--color-sunken)";
  const a = Math.min(Math.abs(r), 1);
  return r >= 0 ? `rgba(42, 120, 214, ${0.08 + a * 0.85})` : `rgba(235, 104, 52, ${0.08 + a * 0.85})`;
}

function CorrelationMatrix({ keys, matrix }: { keys: string[]; matrix: (number | null)[][] }) {
  const [hover, setHover] = useState<[number, number] | null>(null);
  if (!keys?.length) return <p className="py-6 text-center text-sm text-muted">Corrélations indisponibles.</p>;
  const n = keys.length;
  const h = hover ? { a: keys[hover[0]], b: keys[hover[1]], r: matrix[hover[0]][hover[1]] } : null;
  return (
    <div>
      <div className="mb-3 flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-page px-3 py-2 text-[13px]">
        {h ? (
          <>
            <span className="font-medium text-ink">{labelOf(h.a)}</span>
            <span className="text-faint">×</span>
            <span className="font-medium text-ink">{labelOf(h.b)}</span>
            <span className="ml-auto font-mono font-semibold tabular-nums" style={{ color: h.r == null ? undefined : h.r >= 0 ? "#1c5cab" : "#b8461c" }}>
              r = {h.r == null ? "n/d" : h.r.toLocaleString("fr-FR", { minimumFractionDigits: 3 })}
            </span>
          </>
        ) : (
          <span className="text-muted">Bleu : les deux variables montent ensemble · Orange : l&apos;une monte quand l&apos;autre baisse.</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[520px] gap-[2px]" style={{ gridTemplateColumns: `minmax(120px,160px) repeat(${n}, minmax(0,1fr))` }} onMouseLeave={() => setHover(null)}>
          {matrix.map((row, i) => (
            <div key={keys[i]} className="contents">
              <div className={cx("truncate pr-2 text-right text-[11px] leading-[22px]", keys[i] === "satisfaction" ? "font-semibold text-ink" : "text-ink-2", hover?.[0] === i && "text-brand")}>
                {labelOf(keys[i])}
              </div>
              {row.map((r, j) => (
                <div
                  key={j}
                  onMouseEnter={() => setHover([i, j])}
                  className={cx(
                    "aspect-square min-h-[18px] rounded-[3px] transition-transform",
                    hover && (hover[0] === i || hover[1] === j) ? "ring-1 ring-ink/30" : "",
                    hover?.[0] === i && hover?.[1] === j && "z-10 scale-125 ring-2 ring-ink",
                    (keys[i] === "satisfaction" || keys[j] === "satisfaction") && "outline outline-1 outline-ink/10",
                  )}
                  style={{ background: corrColor(r) }}
                  aria-label={`${labelOf(keys[i])} × ${labelOf(keys[j])} : ${r ?? "n/d"}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted">
        −1
        <span className="h-2 flex-1 rounded-full" style={{ background: "linear-gradient(90deg, rgba(235,104,52,.93), rgba(235,104,52,.1) 48%, rgba(42,120,214,.1) 52%, rgba(42,120,214,.93))" }} />
        +1
      </div>
    </div>
  );
}

function TargetDrivers({ keys, matrix }: { keys: string[]; matrix: (number | null)[][] }) {
  const t = keys?.indexOf("satisfaction") ?? -1;
  if (t < 0) return null;
  const items = keys
    .map((k, i) => ({ k, r: matrix[t][i] }))
    .filter((x): x is { k: string; r: number } => x.k !== "satisfaction" && x.r != null)
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
    .slice(0, 10);
  if (!items.length) return <p className="py-6 text-center text-sm text-muted">Aucune ligne étiquetée.</p>;
  const max = Math.max(...items.map((i) => Math.abs(i.r)), 0.01);
  return (
    <ol className="space-y-2.5">
      {items.map((i, idx) => (
        <li key={i.k} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-[13px]">
          <span className="truncate text-ink-2"><span className="mr-1.5 tabular-nums text-faint">{idx + 1}.</span>{labelOf(i.k)}</span>
          <span className="font-mono text-xs font-semibold tabular-nums" style={{ color: i.r >= 0 ? "#1c5cab" : "#b8461c" }}>{i.r > 0 ? "+" : ""}{i.r.toFixed(2)}</span>
          <div className="col-span-2 grid grid-cols-2 gap-0.5">
            <div className="flex justify-end">
              {i.r < 0 && <span className="h-2 rounded-l-full transition-all duration-700" style={{ width: `${(Math.abs(i.r) / max) * 100}%`, background: "#eb6834" }} />}
            </div>
            <div className="border-l border-ink/20">
              {i.r > 0 && <span className="block h-2 rounded-r-full transition-all duration-700" style={{ width: `${(i.r / max) * 100}%`, background: "#2a78d6" }} />}
            </div>
          </div>
        </li>
      ))}
      <li className="pt-1 text-[11px] text-muted">Corrélation ≠ causalité : le modèle (phase 3) mesurera l&apos;effet propre de chaque facteur.</li>
    </ol>
  );
}

/* ------------------------------------------------------------------ Features */

function FeatureCards({ data }: { data: DatasetDetail }) {
  const [group, setGroup] = useState<FeatureDef["group"] | "tout">("tout");
  const list = FEATURES.filter((f) => group === "tout" || f.group === group);
  const target = data.stats.satisfaction;
  return (
    <Card
      title="Features"
      subtitle="Distribution de chaque variable (16 classes), min · médiane · max"
      actions={
        <Segmented
          size="sm"
          label="Groupe de features"
          value={group}
          onChange={setGroup}
          options={[{ value: "tout" as const, label: "Toutes" }, ...Object.entries(FEATURE_GROUPS).map(([k, v]) => ({ value: k as FeatureDef["group"], label: v }))]}
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {group === "tout" && target && target.n > 0 && <FeatureTile k="satisfaction" label="Satisfaction (cible)" unit="/100" digits={1} description="Cible du modèle : 75 % note + 25 % sentiment." stat={target} highlight />}
        {list.map((f) => {
          const s = data.stats[f.key];
          return s ? <FeatureTile key={f.key} k={f.key} label={f.label} unit={f.unit} digits={f.digits} description={f.description} stat={s} /> : null;
        })}
      </div>
    </Card>
  );
}

function FeatureTile({ k, label, unit, digits, description, stat, highlight }: { k: string; label: string; unit: string; digits: number; description: string; stat: DatasetDetail["stats"][string]; highlight?: boolean }) {
  const d = Math.max(digits, 1);
  return (
    <div className={cx("group rounded-xl border p-3.5 transition-shadow hover:shadow-pop", highlight ? "border-brand/30 bg-brand-soft/40" : "border-line bg-surface")} title={description}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-ink">{label}</div>
          <code className="text-[10px] text-faint">{k}</code>
        </div>
        {stat.manquants > 0 ? <Badge tone="warn">{fmtNumber(stat.manquants)} vides</Badge> : <Badge tone="good">complet</Badge>}
      </div>
      <div className="mt-2">
        <Histogram bins={stat.histogramme} color={highlight ? "var(--color-brand)" : "#2a78d6"} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-faint">
        <span>{fmtNumber(stat.min, d)}</span>
        <span>méd. {fmtNumber(stat.mediane, d)}</span>
        <span>{fmtNumber(stat.max, d)}</span>
      </div>
      <div className="mt-2 text-xs text-ink-2">
        <span className="font-semibold tabular-nums text-ink">{fmtNumber(stat.moyenne, d)}</span> {unit} <span className="text-muted">± {fmtNumber(stat.ecartType, d)}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Sentiment et qualité */

function SentimentCard({ data }: { data: DatasetDetail }) {
  const s = data.sentiment ?? {};
  const dist = s.distribution ?? {};
  const t = (dist.positif ?? 0) + (dist.neutre ?? 0) + (dist.negatif ?? 0);
  const langues = Object.entries(s.langues ?? {}).sort((a, b) => b[1] - a[1]);
  const LANG: Record<string, string> = { fr: "Français", mg: "Malagasy", mixte: "Mixte", inconnue: "Inconnue" };
  return (
    <Card title="Analyse de sentiment" subtitle="Lexique FR / MG avec négations et intensifs">
      {t === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Aucun avis analysé.</p>
      ) : (
        <div className="space-y-4">
          {s.justesse != null && (
            <div className="flex items-center gap-3">
              <QualityRing score={Math.round(s.justesse * 100)} size={56} stroke={5} label="Justesse" />
              <div className="text-[13px] text-ink-2">
                <div className="font-semibold text-ink">Justesse du lexique</div>
                vs étiquette de référence, sur {fmtNumber(s.compares ?? 0)} avis
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            {(["positif", "neutre", "negatif"] as const).map((k) => (
              <div key={k} className="grid grid-cols-[5rem_1fr_3rem] items-center gap-2 text-xs">
                <span className="text-ink-2">{k === "negatif" ? "Négatif" : k[0].toUpperCase() + k.slice(1)}</span>
                <span className="h-2 overflow-hidden rounded-full bg-sunken">
                  <span className="block h-full rounded-full transition-all duration-700" style={{ width: `${((dist[k] ?? 0) / t) * 100}%`, background: k === "positif" ? "var(--color-good)" : k === "neutre" ? "var(--color-warn)" : "var(--color-bad)" }} />
                </span>
                <span className="text-right tabular-nums text-ink">{Math.round(((dist[k] ?? 0) / t) * 100)} %</span>
              </div>
            ))}
          </div>
          {langues.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Languages className="h-3.5 w-3.5 text-muted" />
              {langues.map(([k, v]) => (
                <Badge key={k}>{LANG[k] ?? k} · {fmtNumber(v)}</Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function QualityBreakdown({ data }: { data: DatasetDetail }) {
  const q = data.qualite;
  const parts = [
    { label: "Complétude des valeurs applicables", value: q.completude ?? 0, weight: 45, hint: "Les valeurs sans objet (débit hors data, latence SMS) ne comptent pas." },
    { label: "Lignes étiquetées (objectif 60 %)", value: Math.min(((q.etiquetage ?? 0) / 60) * 100, 100), weight: 35, hint: `${fmtNumber(q.etiquetage ?? 0, 1)} % des lignes ont au moins un avis.` },
    { label: "Valeurs non retouchées", value: Math.max(0, 100 - (q.retouchees ?? 0) * 10), weight: 20, hint: `${fmtNumber(q.retouchees ?? 0, 2)} % de valeurs imputées ou plafonnées.` },
  ];
  return (
    <div className="space-y-4">
      {parts.map((p) => (
        <div key={p.label}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="font-medium text-ink">{p.label}</span>
            <span className="text-xs text-muted">poids {p.weight} % · <b className="tabular-nums text-ink">{fmtNumber(p.value, 1)}</b>/100</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${p.value}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">{p.hint}</p>
        </div>
      ))}
      <div className="flex flex-wrap gap-2 border-t border-line pt-3 text-xs text-muted">
        <Badge>{data.couverture.operateurs?.length ?? 0} opérateurs</Badge>
        <Badge>{data.couverture.mois ?? 0} mois</Badge>
        <Badge>{data.couverture.regions ?? 0} régions</Badge>
        <Badge>{data.couverture.services ?? 0} services</Badge>
        {data.previous && <span className="ml-auto self-center">Version précédente : v{data.previous.version} (qualité {data.previous.qualite.score ?? "—"})</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Tableau des lignes */

const COLUMN_SETS: Record<string, string[]> = {
  qualite: ["taux_coupure", "taux_disponibilite", "debit_moyen_mbps", "latence_ms", "indice_qualite"],
  marche: ["log_abonnes", "reclamations_pour_1000", "part_de_marche", "ecart_tarif_marche"],
  tendance: ["coupure_var_1m", "coupure_moy_3m", "dispo_moy_3m", "reclamations_var_1m", "satisfaction_m1"],
};

function RowsTable({ data, filters, update, setPage, loading }: { data: DatasetDetail; filters: Filters; update: (p: Partial<Filters>) => void; setPage: (p: number) => void; loading: boolean }) {
  const [set, setSet] = useState<keyof typeof COLUMN_SETS>("qualite");
  const cols = COLUMN_SETS[set];
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
        <Select value={filters.operateur} onChange={(e) => update({ operateur: e.target.value })} aria-label="Opérateur">
          <option value="">Tous opérateurs</option>
          {OPERATORS.map((o) => <option key={o.code} value={o.code}>{o.code}</option>)}
        </Select>
        <Select value={filters.service} onChange={(e) => update({ service: e.target.value })} aria-label="Service">
          <option value="">Tous services</option>
          {SERVICES.map((s) => <option key={s} value={s}>{SERVICE_LABELS[s]}</option>)}
        </Select>
        <Select value={filters.region} onChange={(e) => update({ region: e.target.value })} aria-label="Région">
          <option value="">Toutes régions</option>
          {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
        <Select value={filters.classe} onChange={(e) => update({ classe: e.target.value })} aria-label="Classe">
          <option value="">Toutes classes</option>
          <option value="satisfait">Satisfait</option>
          <option value="neutre">Neutre</option>
          <option value="insatisfait">Insatisfait</option>
        </Select>
        <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={filters.etiquetees} onChange={(e) => update({ etiquetees: e.target.checked })} className="h-4 w-4 accent-[var(--color-brand)]" />
          Étiquetées seulement
        </label>
        <div className="ml-auto">
          <Segmented size="sm" label="Colonnes" value={set} onChange={setSet} options={[{ value: "qualite", label: "Qualité" }, { value: "marche", label: "Usage & marché" }, { value: "tendance", label: "Tendances" }]} />
        </div>
      </div>
      <div className={cx("overflow-x-auto transition-opacity", loading && "opacity-50")}>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-y border-line bg-page/60 text-left text-xs text-muted">
              <th scope="col" className="px-3 py-2.5 pl-5 font-medium">Opérateur</th>
              <SortHead filters={filters} update={update} k="date">Mois</SortHead>
              <SortHead filters={filters} update={update} k="region">Région</SortHead>
              <th scope="col" className="px-3 py-2.5 font-medium">Service</th>
              {cols.map((c) => <SortHead filters={filters} update={update} key={c} k={c} right>{FEATURE_BY_KEY.get(c)?.label ?? c}</SortHead>)}
              <SortHead filters={filters} update={update} k="nbAvis" right>Avis</SortHead>
              <SortHead filters={filters} update={update} k="satisfaction" right>Satisfaction</SortHead>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.rows.map((r) => <Row key={`${r.operateur}${r.date}${r.region}${r.service}`} r={r} cols={cols} />)}
            {!data.rows.length && (
              <tr><td colSpan={cols.length + 6} className="px-5 py-10 text-center text-muted">Aucune ligne.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 px-5 py-3 text-xs text-muted">
        <span>Page {data.page} / {pages}</span>
        <div className="flex gap-1">
          <button type="button" className={btn.icon} disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} aria-label="Page précédente"><ChevronLeft /></button>
          <button type="button" className={btn.icon} disabled={data.page >= pages} onClick={() => setPage(data.page + 1)} aria-label="Page suivante"><ChevronRight /></button>
        </div>
      </div>
    </div>
  );
}

function SortHead({ k, children, right, filters, update }: { k: string; children: ReactNode; right?: boolean; filters: Filters; update: (p: Partial<Filters>) => void }) {
  const active = filters.sort === k;
  const Icon = !active ? ArrowUpDown : filters.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className={cx("whitespace-nowrap px-3 py-2.5 font-medium first:pl-5 last:pr-5", right && "text-right")}>
      <button type="button" onClick={() => update({ sort: k, dir: active && filters.dir === "desc" ? "asc" : "desc" })} className={cx("inline-flex items-center gap-1 hover:text-ink", active && "text-ink")}>
        {children}
        <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}

function Row({ r, cols }: { r: DatasetRowView; cols: string[] }) {
  return (
    <tr className="hover:bg-page/60">
      <td className="whitespace-nowrap px-3 py-2.5 pl-5"><OperatorTag code={r.operateur} /></td>
      <td className="whitespace-nowrap px-3 py-2.5 text-ink-2">{fmtMonth(r.date)}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-ink-2">{r.region}</td>
      <td className="whitespace-nowrap px-3 py-2.5 text-ink-2">{SERVICE_LABELS[r.service]}</td>
      {cols.map((c) => {
        const v = r.features[c];
        const def = FEATURE_BY_KEY.get(c);
        return (
          <td key={c} className={cx("whitespace-nowrap px-3 py-2.5 text-right tabular-nums", v == null ? "text-faint" : "text-ink")}>
            {v == null ? "—" : fmtNumber(v, def?.digits ?? 2)}
          </td>
        );
      })}
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink-2">{r.nbAvis}</td>
      <td className="whitespace-nowrap px-3 py-2.5 pr-5 text-right">
        {r.satisfaction == null ? (
          <span className="text-faint">—</span>
        ) : (
          <span className={cx("inline-block min-w-12 rounded-md px-2 py-0.5 text-center text-xs font-semibold tabular-nums", scoreTone(r.satisfaction))}>{fmtNumber(r.satisfaction, 1)}</span>
        )}
      </td>
    </tr>
  );
}
