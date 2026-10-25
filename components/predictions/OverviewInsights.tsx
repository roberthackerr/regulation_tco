"use client";

import { ArrowRight, Radar, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { OPERATORS, type OperatorCode } from "@/lib/constants";
import { api, fmtMonth, fmtNumber } from "@/lib/client/api";
import { OPERATOR_COLORS } from "@/lib/theme";

type Pred = { month: string; model: { version: number }; national: { operateur: OperatorCode; score: number | null; prev: number | null; classes: { insatisfait: number } }[] };
type Veille = { operateurs: { operateur: OperatorCode; mentions: number; nss: number | null; prevNss: number | null; negatives48h: number }[] };

const heat = (s: number) => `hsl(${Math.max(0, Math.min(1, (s - 30) / 55)) * 130} 70% 42%)`;

/** Bandeau « intelligence » de la vue d'ensemble : satisfaction prédite + climat sur les réseaux sociaux. */
export function OverviewInsights() {
  const [pred, setPred] = useState<Pred | null | false>(null);
  const [veille, setVeille] = useState<Veille | null>(null);

  useEffect(() => {
    api<Pred>("/api/predictions").then(setPred).catch(() => setPred(false));
    api<Veille>("/api/admin/veille").then(setVeille).catch(() => setVeille(null));
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-gradient-to-r from-brand-soft to-surface px-5 py-3">
        <div className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <Sparkles className="h-4 w-4 text-brand" /> Intelligence des opérateurs
        </div>
        <div className="flex gap-4 text-[13px] font-medium">
          <Link href="/admin/predictions" className="inline-flex items-center gap-1 text-brand hover:underline">Prédictions <ArrowRight className="h-3.5 w-3.5" /></Link>
          <Link href="/admin/veille" className="inline-flex items-center gap-1 text-brand hover:underline">Veille sociale <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
      </div>
      <div className="grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
        {OPERATORS.map((o) => {
          const p = pred ? pred.national.find((n) => n.operateur === o.code) : null;
          const v = veille?.operateurs.find((x) => x.operateur === o.code);
          const delta = p?.score != null && p.prev != null ? p.score - p.prev : null;
          return (
            <div key={o.code} className="p-5">
              <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: OPERATOR_COLORS[o.code] }} /> {o.nom}
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <div className="text-xs text-muted">Satisfaction prédite{pred ? ` · ${fmtMonth(pred.month)}` : ""}</div>
                  {pred === null ? (
                    <div className="mt-1 h-8 w-20 animate-pulse rounded bg-sunken" />
                  ) : p?.score != null ? (
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-3xl font-semibold tabular-nums" style={{ color: heat(p.score) }}>{fmtNumber(p.score, 1)}</span>
                      {delta != null && <span className={cx("text-xs font-medium", delta >= 0 ? "text-good-ink" : "text-bad-ink")}>{delta >= 0 ? "↑" : "↓"} {fmtNumber(Math.abs(delta), 1)}</span>}
                    </div>
                  ) : (
                    <div className="mt-1 text-sm text-muted">Pas de modèle actif</div>
                  )}
                  {p && p.classes.insatisfait > 0 && <div className="mt-1 text-xs text-bad-ink">{p.classes.insatisfait} zone{p.classes.insatisfait > 1 ? "s" : ""} insatisfaite{p.classes.insatisfait > 1 ? "s" : ""}</div>}
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1 text-xs text-muted"><Radar className="h-3 w-3" /> Réseaux · 7 j</div>
                  {v && v.mentions > 0 ? (
                    <>
                      <div className={cx("mt-1 text-lg font-semibold tabular-nums", (v.nss ?? 0) >= 0 ? "text-good-ink" : "text-bad-ink")}>
                        {v.nss != null && v.nss > 0 ? "+" : ""}{fmtNumber(v.nss, 0)}
                      </div>
                      <div className="text-[11px] text-muted">{fmtNumber(v.mentions)} mentions</div>
                      {v.negatives48h >= 6 && <div className="mt-1 inline-flex rounded-full bg-bad-soft px-2 py-0.5 text-[11px] font-medium text-bad-ink">{v.negatives48h} négatives / 48 h</div>}
                    </>
                  ) : (
                    <div className="mt-1 text-xs text-muted">pas de collecte</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
