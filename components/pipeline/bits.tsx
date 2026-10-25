"use client";

/** Petits éléments visuels du pipeline : anneau de qualité, histogramme, icônes d'étapes. */
import {
  DatabaseZap,
  Eraser,
  FlaskConical,
  GitMerge,
  MessageSquareText,
  PackageCheck,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { fmtNumber } from "@/lib/client/api";
import type { DatasetVersionSummary, PipelineStep } from "@/lib/client/types";
import { cx } from "@/components/ui";

export const STEP_ICONS: Record<string, LucideIcon> = {
  extraction: DatabaseZap,
  nettoyage: Eraser,
  sentiment: MessageSquareText,
  normalisation: SlidersHorizontal,
  features: FlaskConical,
  fusion: GitMerge,
  versionnage: PackageCheck,
};

/** Chiffre clé affiché sous chaque étape. */
export function stepHeadline(step: PipelineStep): string | null {
  const s = step.stats ?? {};
  const n = (k: string) => fmtNumber(Number(s[k] ?? 0));
  switch (step.key) {
    case "extraction":
      return `${n("lignes")} lignes · ${n("avis")} avis`;
    case "nettoyage":
      return `${n("imputees")} imputées · ${n("doublons")} doublons`;
    case "sentiment":
      return s.justesse != null ? `${fmtNumber(Number(s.justesse), 1)} % de justesse` : `${n("analyses")} analysés`;
    case "normalisation":
      return `${n("plafonnees")} valeurs plafonnées`;
    case "features":
      return `${n("features")} features`;
    case "fusion":
      return `${n("etiquetees")} lignes étiquetées`;
    case "versionnage":
      return s.unchanged ? `v${s.version} inchangée` : s.version ? `v${s.version} · qualité ${s.score}/100` : null;
    default:
      return null;
  }
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

/** Couleur du score qualité : rouge < 50, ambre < 75, vert au-delà. */
export function scoreColor(score: number) {
  return score >= 75 ? "var(--color-good)" : score >= 50 ? "var(--color-warn)" : "var(--color-bad)";
}

/** Anneau de score 0–100, animé à l'apparition. */
export function QualityRing({ score, size = 64, stroke = 6, label }: { score: number; size?: number; stroke?: number; label?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(score));
    return () => cancelAnimationFrame(id);
  }, [score]);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label ?? "Score"} : ${score} sur 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-sunken)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={scoreColor(score)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown / 100)}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-center font-semibold tabular-nums text-ink" style={{ fontSize: size * 0.28 }}>
        {score}
      </span>
    </div>
  );
}

/** Mini-histogramme SVG (une barre par classe de valeurs). */
export function Histogram({ bins, color = "var(--color-brand)", height = 40 }: { bins: number[]; color?: string; height?: number }) {
  const max = Math.max(...bins, 1);
  const w = 100 / Math.max(bins.length, 1);
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }} aria-hidden>
      {bins.map((b, i) => {
        const h = (b / max) * (height - 2);
        return <rect key={i} x={i * w + 0.6} y={height - h} width={w - 1.2} height={h} rx={0.8} fill={color} opacity={0.85} />;
      })}
    </svg>
  );
}

/** Barre empilée des classes de satisfaction. */
export function ClassBar({ classes, className }: { classes: DatasetVersionSummary["classes"]; className?: string }) {
  const s = classes.satisfait ?? 0;
  const n = classes.neutre ?? 0;
  const ins = classes.insatisfait ?? 0;
  const t = s + n + ins;
  if (!t) return null;
  return (
    <div className={cx("hidden w-28 sm:block", className)} title={`${s} satisfait · ${n} neutre · ${ins} insatisfait`}>
      <div className="flex h-2 overflow-hidden rounded-full bg-sunken">
        <span style={{ width: `${(s / t) * 100}%`, background: "var(--color-good)" }} />
        <span style={{ width: `${(n / t) * 100}%`, background: "var(--color-warn)" }} />
        <span style={{ width: `${(ins / t) * 100}%`, background: "var(--color-bad)" }} />
      </div>
      <div className="mt-1 text-right text-[10px] tabular-nums text-muted">{Math.round((s / t) * 100)} % satisfaits</div>
    </div>
  );
}

