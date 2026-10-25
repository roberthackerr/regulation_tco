"use client";

/**
 * Barres horizontales classées (une par région), en HTML/CSS.
 * Une seule série : une seule couleur, valeur au bout de la barre, barres ≤ 16 px
 * à bout arrondi, partant toutes de la même base. La moyenne est tracée en filet.
 */
import { useState } from "react";
import { cx } from "@/components/ui";
import { fmtNumber } from "@/lib/client/api";

export type RankItem = { label: string; value: number | null };

export function RankBars({
  items,
  unit,
  digits = 1,
  color,
  lowerIsBetter,
  limit = 10,
}: {
  items: RankItem[];
  unit: string;
  digits?: number;
  color: string;
  lowerIsBetter: boolean;
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const valid = items.filter((i): i is { label: string; value: number } => i.value != null);
  // Les moins bonnes valeurs d'abord : c'est ce que le régulateur cherche.
  const sorted = [...valid].sort((a, b) => (lowerIsBetter ? b.value - a.value : a.value - b.value));
  const shown = expanded ? sorted : sorted.slice(0, limit);
  const max = Math.max(...valid.map((i) => i.value), 0) || 1;
  const mean = valid.reduce((s, i) => s + i.value, 0) / (valid.length || 1);

  return (
    <div>
      <ol className="space-y-1.5">
        {shown.map((item) => {
          const pct = (item.value / max) * 100;
          return (
            <li key={item.label} className="group grid grid-cols-[minmax(6.5rem,9rem)_1fr_3.5rem] items-center gap-3 text-[13px]" title={`${item.label} : ${fmtNumber(item.value, digits)} ${unit}`}>
              <span className="truncate text-ink-2 group-hover:text-ink">{item.label}</span>
              <div className="relative flex h-5 items-center">
                <div
                  className="h-3.5 rounded-r-[4px] transition-opacity group-hover:opacity-80"
                  style={{ width: `${Math.max(pct, 0.5)}%`, background: color }}
                />
                {/* Filet de la moyenne */}
                <span className="pointer-events-none absolute inset-y-0 w-px bg-ink/40" style={{ left: `${(mean / max) * 100}%` }} aria-hidden />
              </div>
              <span className="text-right tabular-nums text-ink">{fmtNumber(item.value, digits)}</span>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-px bg-ink/40" aria-hidden /> moyenne : {fmtNumber(mean, digits)} {unit}
        </span>
        {sorted.length > limit && (
          <button type="button" onClick={() => setExpanded((e) => !e)} className={cx("font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline")}>
            {expanded ? "Réduire" : `Voir les ${sorted.length} régions`}
          </button>
        )}
      </div>
    </div>
  );
}
