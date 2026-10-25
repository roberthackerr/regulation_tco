"use client";

import { useState } from "react";
import { PageHeader, cx } from "@/components/ui";
import { VeilleView } from "@/components/veille/VeilleView";
import { OPERATORS, type OperatorCode } from "@/lib/constants";
import { OPERATOR_COLORS } from "@/lib/theme";

/** Veille e-réputation : l'autorité consulte chaque opérateur. */
export function AdminVeille() {
  const [op, setOp] = useState<OperatorCode>("YAS");
  return (
    <>
      <PageHeader
        eyebrow="Autorité de régulation"
        title="Veille réseaux sociaux & avis publics"
        subtitle="Mentions des opérateurs sur les réseaux sociaux et la presse, et avis déposés par les usagers."
      />
      <div className="mb-6 border-b border-line">
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Opérateur">
          {OPERATORS.map((o) => (
            <button
              key={o.code}
              type="button"
              onClick={() => setOp(o.code)}
              aria-current={op === o.code ? "page" : undefined}
              className={cx(
                "inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                op === o.code ? "border-brand text-ink" : "border-transparent text-ink-2 hover:text-ink",
              )}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: OPERATOR_COLORS[o.code] }} aria-hidden />
              {o.nom}
            </button>
          ))}
        </nav>
      </div>
      <VeilleView key={op} operator={op} />
    </>
  );
}
