/**
 * Composants d'interface de base (sans état), partagés par toutes les pages.
 * Les composants interactifs (dialogue, notifications, onglets) sont dans
 * components/ui-client.tsx.
 */
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Info,
  Sparkles,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { IMPORT_STATUS_LABELS, type ImportStatus, type OperatorCode } from "@/lib/constants";
import { OPERATOR_COLORS } from "@/lib/theme";

const cx = (...c: unknown[]) => c.filter((x) => typeof x === "string" && x).join(" ");
export { cx };

/* ------------------------------------------------------------------ En-têtes */

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-xs font-medium uppercase tracking-[0.08em] text-muted">{eyebrow}</div>}
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold text-ink">{children}</h2>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ Cartes */

export function Card({
  title,
  subtitle,
  children,
  actions,
  className,
  padded = true,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={cx("min-w-0 rounded-2xl border border-line bg-surface shadow-card", !padded && "overflow-hidden", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx(padded && "px-5 pb-5", padded && !(title || actions) && "pt-5")}>{children}</div>
    </section>
  );
}

/** Tuile de chiffre clé, avec variation éventuelle par rapport au mois précédent. */
export function Stat({
  label,
  value,
  unit,
  hint,
  delta,
  icon: Icon,
  accent,
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  delta?: { value: number; good: boolean; label?: string } | null;
  icon?: LucideIcon;
  accent?: string;
}) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-card sm:px-5 sm:py-4">
      {accent && <span className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} aria-hidden />}
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] leading-snug font-medium text-ink-2">{label}</div>
        {Icon && <Icon className="h-4 w-4 text-faint" aria-hidden />}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold leading-none tracking-tight text-ink sm:text-[28px]">{value}</span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </div>
      <div className="mt-2 flex min-h-5 flex-wrap items-center gap-2 text-xs text-muted">
        {delta && <Delta {...delta} />}
        {hint}
      </div>
    </div>
  );
}

/** Variation (flèche + valeur), colorée selon que l'évolution est bonne ou mauvaise. */
export function Delta({ value, good, label }: { value: number; good: boolean; label?: string }) {
  if (!Number.isFinite(value)) return null;
  const flat = Math.abs(value) < 0.05;
  const arrow = flat ? "→" : value > 0 ? "↑" : "↓";
  const tone = flat ? "bg-sunken text-ink-2" : good ? "bg-good-soft text-good-ink" : "bg-bad-soft text-bad-ink";
  return (
    <span className={cx("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium", tone)}>
      {arrow} {Math.abs(value).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
      {label && <span className="ml-1 font-normal opacity-80">{label}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ Badges */

const STATUS_META: Record<ImportStatus, { icon: LucideIcon; cls: string }> = {
  recu: { icon: Clock, cls: "bg-info-soft text-info-ink" },
  valide: { icon: CheckCircle2, cls: "bg-good-soft text-good-ink" },
  rejete: { icon: XCircle, cls: "bg-bad-soft text-bad-ink" },
  traite: { icon: Sparkles, cls: "bg-brand-soft text-brand" },
};

export function StatusBadge({ status }: { status: ImportStatus }) {
  const { icon: Icon, cls } = STATUS_META[status];
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", cls)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {IMPORT_STATUS_LABELS[status]}
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "bad" | "warn" | "info" | "brand" }) {
  const tones = {
    neutral: "bg-sunken text-ink-2",
    good: "bg-good-soft text-good-ink",
    bad: "bg-bad-soft text-bad-ink",
    warn: "bg-warn-soft text-warn-ink",
    info: "bg-info-soft text-info-ink",
    brand: "bg-brand-soft text-brand",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

/** Pastille de couleur + nom d'opérateur (le texte reste à l'encre, la couleur est sur la pastille). */
export function OperatorTag({ code, label }: { code: OperatorCode | null; label?: string }) {
  if (!code) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-ink">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: OPERATOR_COLORS[code] }} aria-hidden />
      {label ?? code}
    </span>
  );
}

/* ------------------------------------------------------------------ Boutons & champs */

const btnBase =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0";

export const btn = {
  primary: `${btnBase} bg-brand px-4 py-2 text-white hover:bg-brand-hover`,
  secondary: `${btnBase} border border-line-strong/70 bg-surface px-4 py-2 text-ink hover:bg-sunken`,
  success: `${btnBase} bg-good-ink px-3 py-1.5 text-white hover:bg-[#004f00]`,
  danger: `${btnBase} bg-bad px-3 py-1.5 text-white hover:bg-bad-ink`,
  ghost: `${btnBase} px-2.5 py-1.5 text-ink-2 hover:bg-sunken hover:text-ink`,
  icon: `${btnBase} h-9 w-9 text-ink-2 hover:bg-sunken hover:text-ink`,
  sm: "!px-3 !py-1.5 !text-[13px]",
};

export const input =
  "block w-full rounded-lg border border-line-strong/70 bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint transition-colors hover:border-line-strong focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/10";

export const label = "mb-1.5 block text-[13px] font-medium text-ink";

export function Field({ id, label: text, hint, error, children }: { id: string; label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      {children}
      {error ? <p className="mt-1 text-xs text-bad-ink">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Messages */

const ALERT_META = {
  error: { icon: XCircle, cls: "border-bad/25 bg-bad-soft text-bad-ink" },
  success: { icon: CheckCircle2, cls: "border-good/25 bg-good-soft text-good-ink" },
  info: { icon: Info, cls: "border-info-ink/20 bg-info-soft text-info-ink" },
  warn: { icon: AlertTriangle, cls: "border-warn/40 bg-warn-soft text-warn-ink" },
};

export function Alert({ tone = "error", title, children, action }: { tone?: keyof typeof ALERT_META; title?: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const { icon: Icon, cls } = ALERT_META[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex gap-3 rounded-xl border px-4 py-3 text-sm", cls)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cx(title ? "mt-0.5" : null, "text-[13px] leading-relaxed")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ icon: Icon, title, children, action }: { icon?: LucideIcon; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong/70 px-6 py-12 text-center">
      {Icon && (
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-sunken text-ink-2">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      )}
      <div className="font-medium text-ink">{title}</div>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ Chargement */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-sunken", className)} aria-hidden />;
}

/** Squelette générique de page : tuiles + bloc principal. */
export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Chargement">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[116px] rounded-2xl" />)}
      </div>
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-brand" aria-hidden />
      {label}
    </div>
  );
}

/* ------------------------------------------------------------------ Tableaux */

/** Tableau : en-tête discret, lignes séparées par un filet, défilement horizontal sur mobile. */
export function Table({
  head,
  children,
  align,
  flushTop = false,
}: {
  head: ReactNode[];
  children: ReactNode;
  align?: ("left" | "right")[];
  /** Sans filet supérieur : quand le tableau touche directement le haut de sa carte. */
  flushTop?: boolean;
}) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className={cx("border-b border-line bg-page/60 text-left text-xs font-medium text-muted", !flushTop && "border-t")}>
            {head.map((h, i) => (
              <th key={i} scope="col" className={cx("whitespace-nowrap px-5 py-2.5 font-medium", align?.[i] === "right" && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export const td = "whitespace-nowrap px-5 py-3 text-ink-2";
export const tdNum = "whitespace-nowrap px-5 py-3 text-right tabular-nums text-ink";

/** Liste déroulante native, habillée aux couleurs de l'interface. */
export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cx("relative inline-flex", className)}>
      <select
        {...props}
        className="w-full cursor-pointer appearance-none rounded-lg border border-line-strong/70 bg-surface py-1.5 pr-8 pl-3 text-[13px] font-medium text-ink transition-colors hover:border-line-strong focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/10"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
    </span>
  );
}
