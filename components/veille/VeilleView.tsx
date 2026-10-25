"use client";

import {
  AlertTriangle,
  ExternalLink,
  Flame,
  Heart,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Radar,
  Search,
  Smile,
  Star,
  ThumbsDown,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendChart } from "@/components/charts/TrendChart";
import { Alert, Badge, Card, Empty, PageSkeleton, Select, Stat, btn, cx, input } from "@/components/ui";
import { Segmented, useToast } from "@/components/ui-client";
import { SERVICE_LABELS, type OperatorCode, type Service } from "@/lib/constants";
import { api, fmtDate, fmtNumber } from "@/lib/client/api";
import { SOURCE_COLORS, SOURCE_LABELS, THEME_LABELS, type MentionSource, type MentionTheme, type SourceMode } from "@/lib/scraping/types";
import { CHART } from "@/lib/theme";

/* ------------------------------------------------------------------ Types */

type Label = "positif" | "neutre" | "negatif";

type Mention = {
  _id: string;
  source: MentionSource;
  note: number | null;
  auteur: string | null;
  texte: string;
  url: string | null;
  publishedAt: string;
  langue: string;
  sentiment: { label: Label; score: number };
  termes: { terme: string; poids: number }[];
  theme: MentionTheme;
  region: string | null;
  engagement: number;
};

type RunSource = { source: MentionSource; collectes: number; nouveaux: number; erreur: string | null; dureeMs: number };
type Run = { _id: string; status: string; sources: RunSource[]; nouveaux: number; createdAt: string; finishedAt: string | null };

type VeilleData = {
  operator: OperatorCode;
  days: number;
  kpis: { total: number; prevTotal: number; nss: number | null; prevNss: number | null; negPct: number | null; engagement: number; pos: number; neg: number };
  sources: { source: MentionSource; mode: SourceMode; detail: string; count: number }[];
  timeline: { date: string; positif: number; neutre: number; negatif: number }[];
  themes: { theme: MentionTheme; total: number; positif: number; neutre: number; negatif: number }[];
  regions: { region: string; total: number; negatif: number }[];
  terms: { terme: string; count: number; poids: number }[];
  alerte: { mentions: number; ratio: number | null; theme: MentionTheme | null; region: string | null } | null;
  mentions: Mention[];
  lastRun: Run | null;
  avis: {
    total: number;
    public: number;
    noteMoyenne: number | null;
    distribution: { note: number; count: number }[];
    parMois: { date: string; note: number; n: number }[];
    appStore: number;
    recents: { id: string; source: "formulaire" | "app_store"; date: string; region: string | null; service: Service | null; note: number; commentaire: string; url: string | null; sentiment: { label: Label; score: number } }[];
  };
};

/* ------------------------------------------------------------------ Constantes visuelles */

const SENT: Record<Label, { label: string; color: string; soft: string; ink: string }> = {
  positif: { label: "Positif", color: "#0ca30c", soft: "bg-good-soft", ink: "text-good-ink" },
  neutre: { label: "Neutre", color: "#a9a89f", soft: "bg-sunken", ink: "text-ink-2" },
  negatif: { label: "Négatif", color: "#d03b3b", soft: "bg-bad-soft", ink: "text-bad-ink" },
};

const MODE_BADGE: Record<SourceMode, { text: string; tone: "good" | "neutral" }> = {
  reel: { text: "Réel", tone: "good" },
  off: { text: "À configurer", tone: "neutral" },
};

const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
function ago(d: string) {
  const s = (new Date(d).getTime() - Date.now()) / 1000;
  const a = Math.abs(s);
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (a < 30 * 86400) return rtf.format(Math.round(s / 86400), "day");
  return fmtDate(d);
}
const fmtDay = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

/* ------------------------------------------------------------------ Vue principale */

/**
 * Veille e-réputation d'un opérateur : réseaux sociaux, presse et avis publics.
 * `operator` n'est utilisé que par l'admin ; un opérateur voit toujours les siens.
 */
export function VeilleView({ operator }: { operator?: OperatorCode }) {
  const toast = useToast();
  const [data, setData] = useState<VeilleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const [tab, setTab] = useState<"social" | "avis">("social");
  const [scan, setScan] = useState<{ running: boolean; run: Run | null } | null>(null);

  const qs = useCallback((extra = "") => `?days=${days}${operator ? `&operator=${operator}` : ""}${extra}`, [days, operator]);

  const load = useCallback(() => api<VeilleData>(`/api/operator/veille${qs()}`).then(setData).catch((e) => setError(e.message)), [qs]);
  useEffect(() => {
    load();
  }, [load]);

  async function lancer() {
    setScan({ running: true, run: null });
    try {
      const { run } = await api<{ run: Run }>(`/api/operator/veille/scrape${operator ? `?operator=${operator}` : ""}`, { method: "POST" });
      setScan({ running: false, run });
      toast.success(`${fmtNumber(run.nouveaux)} nouvelle${run.nouveaux > 1 ? "s" : ""} mention${run.nouveaux > 1 ? "s" : ""} collectée${run.nouveaux > 1 ? "s" : ""}.`);
      await load();
    } catch (e) {
      setScan(null);
      toast.error((e as Error).message);
    }
  }

  if (error) return <Alert title="Impossible de charger la veille">{error}</Alert>;
  if (!data) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Vue"
          value={tab}
          onChange={setTab}
          options={[
            { value: "social", label: "Réseaux sociaux & presse" },
            { value: "avis", label: `Avis publics · ${fmtNumber(data.avis.total)}` },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          {tab === "social" && (
            <Segmented size="sm" label="Période" value={days} onChange={setDays} options={[{ value: "7", label: "7 j" }, { value: "30", label: "30 j" }, { value: "90", label: "90 j" }]} />
          )}
          <button type="button" className={btn.primary} onClick={lancer} disabled={scan?.running}>
            <Radar className={cx(scan?.running && "animate-spin")} /> {scan?.running ? "Collecte en cours…" : "Lancer la collecte"}
          </button>
        </div>
      </div>

      {scan && <ScanPanel sources={data.sources} scan={scan} onClose={() => setScan(null)} />}

      {tab === "social" ? <SocialTab data={data} onStart={lancer} scanning={!!scan?.running} /> : <AvisTab avis={data.avis} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Panneau de collecte */

function ScanPanel({ sources, scan, onClose }: { sources: VeilleData["sources"]; scan: { running: boolean; run: Run | null }; onClose: () => void }) {
  const active = sources.filter((s) => s.mode === "reel");
  return (
    <div className="relative animate-slide-up overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-brand-soft via-surface to-surface p-5 shadow-card">
      <div className="flex items-start gap-4">
        <div className="relative grid h-14 w-14 shrink-0 place-items-center">
          {scan.running && (
            <>
              <span className="absolute inset-0 animate-ping rounded-full bg-brand/15" />
              <span className="absolute inset-2 animate-ping rounded-full bg-brand/20 [animation-delay:300ms]" />
            </>
          )}
          <span className="relative grid h-11 w-11 place-items-center rounded-full bg-brand text-white">
            <Radar className={cx("h-5 w-5", scan.running && "animate-spin [animation-duration:2.5s]")} />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold text-ink">{scan.running ? "Collecte en cours sur les sources publiques…" : `Collecte terminée · ${fmtNumber(scan.run?.nouveaux ?? 0)} nouvelles mentions`}</div>
              <div className="text-xs text-muted">Recherche des mots-clés de la marque, dédoublonnage, analyse de sentiment FR/MG, détection des thèmes et des régions.</div>
            </div>
            {!scan.running && <button type="button" className={cx(btn.ghost, btn.sm)} onClick={onClose}>Masquer</button>}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {active.map((s, i) => {
              const r = scan.run?.sources.find((x) => x.source === s.source);
              return (
                <div key={s.source} className="flex items-center gap-3 rounded-xl border border-line bg-surface/90 px-3 py-2.5" style={{ animationDelay: `${i * 80}ms` }}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SOURCE_COLORS[s.source] }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-ink">{SOURCE_LABELS[s.source]}</div>
                    <div className="truncate text-xs text-muted">
                      {scan.running ? "Analyse…" : r?.erreur ? <span className="text-bad-ink" title={r.erreur}>Échec : {r.erreur}</span> : `${fmtNumber(r?.collectes ?? 0)} lus · +${fmtNumber(r?.nouveaux ?? 0)} · ${((r?.dureeMs ?? 0) / 1000).toFixed(1)} s`}
                    </div>
                  </div>
                  {scan.running ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-brand" />
                  ) : (
                    <Badge tone={r?.erreur ? "bad" : MODE_BADGE[s.mode].tone}>{r?.erreur ? "Erreur" : MODE_BADGE[s.mode].text}</Badge>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Onglet réseaux sociaux */

function SocialTab({ data, onStart, scanning }: { data: VeilleData; onStart: () => void; scanning: boolean }) {
  const { kpis } = data;

  if (kpis.total === 0 && !data.lastRun) {
    return (
      <>
        <SourcesStrip sources={data.sources} />
        <Empty
          icon={Radar}
          title="Aucune mention collectée pour l'instant"
          action={<button type="button" className={btn.primary} onClick={onStart} disabled={scanning}><Radar /> Lancer la première collecte</button>}
        >
          La veille parcourt les réseaux sociaux et la presse en ligne à la recherche de votre marque, puis analyse le ton de chaque publication.
        </Empty>
      </>
    );
  }

  const deltaTotal = kpis.prevTotal ? ((kpis.total - kpis.prevTotal) / kpis.prevTotal) * 100 : null;
  const deltaNss = kpis.nss != null && kpis.prevNss != null ? kpis.nss - kpis.prevNss : null;

  return (
    <>
      <SourcesStrip sources={data.sources} lastRun={data.lastRun} />

      {data.alerte && (
        <div className="flex animate-slide-up items-start gap-3 rounded-2xl border border-bad/30 bg-bad-soft px-5 py-4 text-bad-ink">
          <span className="relative mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bad text-white">
            <span className="absolute inset-0 animate-ping rounded-full bg-bad/40" />
            <Flame className="relative h-4 w-4" />
          </span>
          <div className="text-sm">
            <div className="font-semibold">Pic de mentions négatives détecté</div>
            <div className="mt-0.5 text-[13px]">
              {data.alerte.mentions} mentions négatives en 48 h
              {data.alerte.ratio ? <>, soit <b>×{data.alerte.ratio.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}</b> le rythme habituel</> : null}
              {data.alerte.theme && <> · sujet principal : <b>{THEME_LABELS[data.alerte.theme]}</b></>}
              {data.alerte.region && <> · zone : <b>{data.alerte.region}</b></>}.
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Mentions" icon={MessagesSquare} value={fmtNumber(kpis.total)} delta={deltaTotal != null ? { value: deltaTotal, good: true, label: "vs période préc." } : null} />
        <Stat
          label="Score net de sentiment"
          icon={Smile}
          value={kpis.nss == null ? "—" : `${kpis.nss > 0 ? "+" : ""}${fmtNumber(kpis.nss)}`}
          accent={kpis.nss == null ? undefined : kpis.nss >= 0 ? SENT.positif.color : SENT.negatif.color}
          hint={
            deltaNss != null ? (
              <span className={cx("rounded-md px-1.5 py-0.5 font-medium", deltaNss >= 0 ? "bg-good-soft text-good-ink" : "bg-bad-soft text-bad-ink")}>
                {deltaNss >= 0 ? "↑" : "↓"} {fmtNumber(Math.abs(deltaNss))} pts
              </span>
            ) : "positifs − négatifs, en %"
          }
        />
        <Stat label="Part de mentions négatives" icon={ThumbsDown} value={kpis.negPct == null ? "—" : fmtNumber(kpis.negPct, 1)} unit="%" hint={`${fmtNumber(kpis.neg)} négatives · ${fmtNumber(kpis.pos)} positives`} />
        <Stat label="Engagement cumulé" icon={Heart} value={fmtNumber(kpis.engagement)} hint="j'aime, partages, réponses" />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3" title="Volume et tonalité des mentions" subtitle="Nombre de mentions par jour, réparties par sentiment">
          <SentimentTimeline data={data.timeline} />
        </Card>
        <Card className="xl:col-span-2" title="Répartition" subtitle="Par sentiment et par source">
          <Donuts data={data} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card title="Sujets de conversation" subtitle="Thèmes détectés automatiquement">
          <ThemeBars themes={data.themes} />
        </Card>
        <Card title="Zones sensibles" subtitle="Régions citées, triées par mentions négatives">
          <RegionHeat regions={data.regions} />
        </Card>
        <Card className="lg:col-span-2 xl:col-span-1" title="Mots qui reviennent" subtitle="Taille = fréquence · couleur = tonalité">
          <WordCloud terms={data.terms} />
        </Card>
      </div>

      <MentionFeed mentions={data.mentions} />
    </>
  );
}

function SourcesStrip({ sources, lastRun }: { sources: VeilleData["sources"]; lastRun?: Run | null }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {sources.map((s) => (
          <div key={s.source} title={s.detail} className={cx("rounded-xl border border-line bg-surface px-3 py-2.5 shadow-card", s.mode === "off" && "opacity-60")}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-ink">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SOURCE_COLORS[s.source] }} />
                <span className="truncate">{SOURCE_LABELS[s.source]}</span>
              </span>
              <Badge tone={MODE_BADGE[s.mode].tone}>{MODE_BADGE[s.mode].text}</Badge>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="text-lg font-semibold tabular-nums text-ink">{fmtNumber(s.count)}</span>
              <span className="truncate text-[11px] text-muted">{s.detail.replace(/^À configurer : /, "")}</span>
            </div>
          </div>
        ))}
      </div>
      {lastRun && <p className="mt-2 text-xs text-muted">Dernière collecte {ago(lastRun.createdAt)} · {fmtNumber(lastRun.nouveaux)} nouvelles mentions. Uniquement des contenus publics réels ; les sources « À configurer » attendent une clé d&apos;API dans .env.</p>}
    </div>
  );
}

function SentimentTimeline({ data }: { data: VeilleData["timeline"] }) {
  return (
    <div className="h-[280px]" role="img" aria-label="Évolution quotidienne des mentions par sentiment">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            {(Object.keys(SENT) as Label[]).map((k) => (
              <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SENT[k].color} stopOpacity={0.45} />
                <stop offset="100%" stopColor={SENT[k].color} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fill: CHART.tick, fontSize: 11 }} axisLine={{ stroke: CHART.axis }} tickLine={false} minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fill: CHART.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            labelFormatter={(d) => fmtDay(String(d))}
            formatter={(v, name) => [v, SENT[name as Label]?.label ?? name]}
            contentStyle={{ borderRadius: 12, border: `1px solid ${CHART.grid}`, fontSize: 12 }}
          />
          {(["negatif", "neutre", "positif"] as Label[]).map((k) => (
            <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={SENT[k].color} strokeWidth={2} fill={`url(#g-${k})`} animationDuration={900} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

type DonutRow = { key: string; name: string; value: number; color: string };

function Donut({ rows, center }: { rows: DonutRow[]; center: string }) {
  const total = rows.reduce((n, r) => n + r.value, 0);
  return (
    <div>
      <div className="relative h-36">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="none" animationDuration={900}>
              {rows.map((r) => <Cell key={r.key} fill={r.color} />)}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: 12, border: `1px solid ${CHART.grid}`, fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <span className="text-xs font-medium text-muted">{center}</span>
        </div>
      </div>
      <ul className="mt-2 space-y-1">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 text-ink-2"><span className="h-2 w-2 rounded-full" style={{ background: r.color }} />{r.name}</span>
            <span className="tabular-nums text-ink">{total ? fmtNumber((r.value / total) * 100) : 0} %</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Donuts({ data }: { data: VeilleData }) {
  const sent = (["positif", "neutre", "negatif"] as Label[]).map((k) => ({
    key: k,
    name: SENT[k].label,
    value: data.timeline.reduce((n, d) => n + d[k], 0),
    color: SENT[k].color,
  }));
  const src = data.sources.filter((s) => s.count > 0).map((s) => ({ key: s.source, name: SOURCE_LABELS[s.source], value: s.count, color: SOURCE_COLORS[s.source] }));
  return (
    <div className="grid grid-cols-2 gap-4">
      <Donut rows={sent} center="Sentiment" />
      <Donut rows={src} center="Sources" />
    </div>
  );
}

function ThemeBars({ themes }: { themes: VeilleData["themes"] }) {
  if (!themes.length) return <p className="text-sm text-muted">Pas encore de données.</p>;
  const max = Math.max(...themes.map((t) => t.total));
  return (
    <ul className="space-y-3">
      {themes.map((t) => (
        <li key={t.theme}>
          <div className="mb-1 flex items-baseline justify-between text-[13px]">
            <span className="font-medium text-ink">{THEME_LABELS[t.theme]}</span>
            <span className="text-xs tabular-nums text-muted">{fmtNumber(t.total)} · <span className="text-bad-ink">{fmtNumber((t.negatif / t.total) * 100)} % nég.</span></span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-sunken" style={{ width: `${Math.max(12, (t.total / max) * 100)}%` }}>
            {(["positif", "neutre", "negatif"] as Label[]).map((k) => (
              <span key={k} className="h-full transition-all duration-700" style={{ width: `${(t[k] / t.total) * 100}%`, background: SENT[k].color }} />
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

function RegionHeat({ regions }: { regions: VeilleData["regions"] }) {
  if (!regions.length) return <p className="text-sm text-muted">Aucune région citée dans les mentions.</p>;
  const max = Math.max(...regions.map((r) => r.negatif), 1);
  return (
    <ul className="space-y-1.5">
      {regions.map((r, i) => {
        const heat = r.negatif / max;
        return (
          <li key={r.region} className="flex items-center gap-3 rounded-lg px-2 py-1.5" style={{ background: `rgba(208, 59, 59, ${0.04 + heat * 0.16})` }}>
            <span className="w-4 text-xs tabular-nums text-muted">{i + 1}</span>
            <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: heat > 0.6 ? SENT.negatif.color : CHART.tick }} />
            <span className="flex-1 truncate text-[13px] font-medium text-ink">{r.region}</span>
            <span className="text-xs tabular-nums text-bad-ink">{fmtNumber(r.negatif)} nég.</span>
            <span className="w-14 text-right text-xs tabular-nums text-muted">{fmtNumber(r.total)} au total</span>
          </li>
        );
      })}
    </ul>
  );
}

function WordCloud({ terms }: { terms: VeilleData["terms"] }) {
  if (!terms.length) return <p className="text-sm text-muted">Pas encore de termes significatifs.</p>;
  const max = Math.max(...terms.map((t) => t.count));
  const min = Math.min(...terms.map((t) => t.count));
  // Ordre mélangé mais stable, pour un rendu « nuage ».
  const shuffled = [...terms].sort((a, b) => (a.terme.length * 7 + a.count) % 5 - ((b.terme.length * 7 + b.count) % 5));
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 py-2">
      {shuffled.map((t) => {
        const r = max === min ? 0.5 : (t.count - min) / (max - min);
        const color = t.poids > 0.2 ? SENT.positif.color : t.poids < -0.2 ? SENT.negatif.color : CHART.ink2;
        return (
          <span
            key={t.terme}
            title={`${t.terme} : ${t.count} mention${t.count > 1 ? "s" : ""}`}
            className="cursor-default font-semibold leading-tight transition-transform hover:scale-110"
            style={{ fontSize: `${12 + r * 18}px`, color, opacity: 0.55 + r * 0.45 }}
          >
            {t.terme}
          </span>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ Fil des mentions */

function Highlight({ text, termes }: { text: string; termes: Mention["termes"] }) {
  const parts = useMemo(() => {
    const words = termes.map((t) => t.terme).filter(Boolean);
    if (!words.length) return [{ s: text, p: 0 }];
    const esc = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length);
    const re = new RegExp(`(${esc.join("|")})`, "giu");
    return text.split(re).map((s) => ({ s, p: termes.find((t) => t.terme.toLowerCase() === s.toLowerCase())?.poids ?? 0 }));
  }, [text, termes]);
  return (
    <>
      {parts.map((x, i) =>
        x.p === 0 ? (
          <span key={i}>{x.s}</span>
        ) : (
          <mark key={i} className={cx("rounded px-0.5", x.p > 0 ? "bg-good-soft text-good-ink" : "bg-bad-soft text-bad-ink")}>{x.s}</mark>
        ),
      )}
    </>
  );
}

function MentionFeed({ mentions }: { mentions: Mention[] }) {
  const [source, setSource] = useState<"all" | MentionSource>("all");
  const [sent, setSent] = useState<"all" | Label>("all");
  const [theme, setTheme] = useState<"all" | MentionTheme>("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(20);

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return mentions.filter(
      (m) =>
        (source === "all" || m.source === source) &&
        (sent === "all" || m.sentiment.label === sent) &&
        (theme === "all" || m.theme === theme) &&
        (!nq || m.texte.toLowerCase().includes(nq) || m.region?.toLowerCase().includes(nq)),
    );
  }, [mentions, source, sent, theme, q]);

  const sources = [...new Set(mentions.map((m) => m.source))];

  return (
    <Card
      title="Fil des mentions"
      subtitle={`${fmtNumber(filtered.length)} publication${filtered.length > 1 ? "s" : ""} · les termes qui ont pesé dans l'analyse sont surlignés`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-faint" />
            <input className={cx(input, "!w-48 !py-1.5 pl-8 !text-[13px]")} placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher dans les mentions" />
          </div>
          <Select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
            <option value="all">Toutes les sources</option>
            {sources.map((s) => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
          </Select>
          <Select aria-label="Thème" value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}>
            <option value="all">Tous les thèmes</option>
            {(Object.keys(THEME_LABELS) as MentionTheme[]).map((t) => <option key={t} value={t}>{THEME_LABELS[t]}</option>)}
          </Select>
        </div>
      }
    >
      <div className="mb-4">
        <Segmented
          size="sm"
          label="Sentiment"
          value={sent}
          onChange={setSent}
          options={[{ value: "all", label: "Tous" }, { value: "negatif", label: "😠 Négatifs" }, { value: "neutre", label: "😐 Neutres" }, { value: "positif", label: "😊 Positifs" }]}
        />
      </div>
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Aucune mention ne correspond à ces filtres.</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {filtered.slice(0, limit).map((m) => (
            <li key={m._id} className="group relative animate-fade-in overflow-hidden rounded-xl border border-line bg-surface p-4 transition hover:border-line-strong hover:shadow-card">
              <span className="absolute inset-y-0 left-0 w-1" style={{ background: SENT[m.sentiment.label].color }} />
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SOURCE_COLORS[m.source] }} />
                  <span className="font-medium text-ink">{SOURCE_LABELS[m.source]}</span>
                  {m.auteur && <span className="truncate text-muted">· {m.auteur}</span>}
                  {m.note != null && <Stars value={m.note} size="h-3 w-3" />}
                </span>
                <span className="shrink-0 text-muted" title={new Date(m.publishedAt).toLocaleString("fr-FR")}>{ago(m.publishedAt)}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink"><Highlight text={m.texte} termes={m.termes} /></p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                <span className={cx("rounded-full px-2 py-0.5 font-medium", SENT[m.sentiment.label].soft, SENT[m.sentiment.label].ink)}>
                  {SENT[m.sentiment.label].label} {m.sentiment.score > 0 ? "+" : ""}{m.sentiment.score.toFixed(2)}
                </span>
                <Badge>{THEME_LABELS[m.theme]}</Badge>
                {m.region && <Badge tone="info"><MapPin className="h-3 w-3" />{m.region}</Badge>}
                {m.langue !== "inconnue" && <Badge>{m.langue === "mg" ? "Malagasy" : m.langue === "fr" ? "Français" : "FR + MG"}</Badge>}
                <span className="ml-auto flex items-center gap-3 text-muted">
                  {m.engagement > 0 && <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{fmtNumber(m.engagement)}</span>}
                  {m.url && (
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-ink">
                      Voir <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {filtered.length > limit && (
        <div className="mt-4 text-center">
          <button type="button" className={btn.secondary} onClick={() => setLimit((l) => l + 20)}>Afficher plus ({fmtNumber(filtered.length - limit)} restantes)</button>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ Onglet avis publics */

function Stars({ value, size = "h-4 w-4" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className="relative">
          <Star className={cx(size, "text-line-strong")} />
          <span className="absolute inset-0 overflow-hidden" style={{ width: `${Math.max(0, Math.min(1, value - n + 1)) * 100}%` }}>
            <Star className={cx(size, "fill-warn text-warn")} />
          </span>
        </span>
      ))}
    </span>
  );
}

function AvisTab({ avis }: { avis: VeilleData["avis"] }) {
  const [filter, setFilter] = useState<"all" | "formulaire" | "app_store" | Label>("all");
  if (avis.total === 0) {
    return (
      <Empty icon={MessageCircle} title="Aucun avis publié pour l'instant">
        Lancez une collecte pour récupérer les avis App Store, ou attendez les avis déposés sur la page publique (bouton « Donner mon avis »).
      </Empty>
    );
  }
  const maxDist = Math.max(...avis.distribution.map((d) => d.count), 1);
  const neg = avis.recents.filter((r) => r.sentiment.label === "negatif").length;
  const rows = avis.recents.filter((r) => filter === "all" || (filter === "formulaire" || filter === "app_store" ? r.source === filter : r.sentiment.label === filter));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Avis publiés" icon={MessageCircle} value={fmtNumber(avis.total)} hint="formulaire citoyen + App Store" />
        <Stat label="Note moyenne" icon={Star} value={avis.noteMoyenne == null ? "—" : fmtNumber(avis.noteMoyenne, 2)} unit="/ 5" hint={avis.noteMoyenne != null && <Stars value={avis.noteMoyenne} size="h-3.5 w-3.5" />} />
        <Stat label="Avis App Store" icon={Smile} value={fmtNumber(avis.appStore)} hint={`+ ${fmtNumber(avis.public)} via le formulaire public`} />
        <Stat label="Ton négatif (récents)" icon={AlertTriangle} value={avis.recents.length ? fmtNumber((neg / avis.recents.length) * 100) : "—"} unit="%" hint={`sur les ${avis.recents.length} derniers commentaires`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2" title="Distribution des notes">
          <ul className="space-y-2.5">
            {[...avis.distribution].reverse().map((d) => (
              <li key={d.note} className="flex items-center gap-3 text-[13px]">
                <span className="flex w-10 items-center gap-1 font-medium text-ink">{d.note}<Star className="h-3.5 w-3.5 fill-warn text-warn" /></span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-sunken">
                  <span className="block h-full rounded-full transition-all duration-700" style={{ width: `${(d.count / maxDist) * 100}%`, background: d.note >= 4 ? SENT.positif.color : d.note === 3 ? "#fab219" : SENT.negatif.color }} />
                </span>
                <span className="w-16 text-right text-xs tabular-nums text-muted">{fmtNumber(d.count)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="xl:col-span-3" title="Note moyenne par mois">
          <TrendChart data={avis.parMois.map((m) => ({ date: m.date, v: m.note }))} series={[{ key: "v", name: "Note", color: "#c9a227" }]} unit="/5" digits={2} height={220} ariaLabel="Évolution de la note moyenne des avis" />
        </Card>
      </div>

      <Card
        title="Derniers commentaires"
        subtitle="Les plus récents en premier"
        actions={
          <Segmented
            size="sm"
            label="Filtre des avis"
            value={filter}
            onChange={setFilter}
            options={[{ value: "all", label: "Tous" }, { value: "app_store", label: "App Store" }, { value: "formulaire", label: "Formulaire" }, { value: "negatif", label: "Négatifs" }, { value: "positif", label: "Positifs" }]}
          />
        }
      >
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Aucun avis pour ce filtre.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex gap-4 py-3.5">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SENT[r.sentiment.label].color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Stars value={r.note} size="h-3.5 w-3.5" />
                    {r.region && <><span>{r.region}</span>·</>}{r.service && <><span>{SERVICE_LABELS[r.service]}</span>·</>}<span>{fmtDate(r.date)}</span>{r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 hover:text-ink">voir <ExternalLink className="h-3 w-3" /></a>}
                    {r.source === "app_store" ? <Badge tone="info">App Store</Badge> : <Badge tone="brand">Formulaire</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-ink">{r.commentaire}</p>
                </div>
                <span className={cx("h-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", SENT[r.sentiment.label].soft, SENT[r.sentiment.label].ink)}>{SENT[r.sentiment.label].label}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
