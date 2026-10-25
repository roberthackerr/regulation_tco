"use client";

import { useMemo, useState } from "react";
import { Table, btn, cx, td } from "@/components/ui";
import type { Issue } from "@/lib/client/types";

const PAGE = 50;

/**
 * Anomalies d'un import, regroupables par colonne : les puces en haut résument
 * où se trouvent les problèmes et servent de filtre.
 */
export function IssueList({ issues, tone }: { issues: Issue[]; tone: "error" | "warn" }) {
  const [shown, setShown] = useState(PAGE);
  const [column, setColumn] = useState<string | null>(null);

  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of issues) m.set(i.colonne ?? "ligne entière", (m.get(i.colonne ?? "ligne entière") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [issues]);

  const filtered = column ? issues.filter((i) => (i.colonne ?? "ligne entière") === column) : issues;
  const color = tone === "error" ? "text-bad-ink" : "text-warn-ink";

  return (
    <>
      {groups.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filtrer par colonne">
          <Chip active={column === null} onClick={() => setColumn(null)}>Toutes · {issues.length}</Chip>
          {groups.map(([col, n]) => (
            <Chip key={col} active={column === col} onClick={() => setColumn(col)}>
              <span className="font-mono">{col}</span> · {n}
            </Chip>
          ))}
        </div>
      )}
      <Table head={["Ligne", "Colonne", "Valeur", "Problème"]}>
        {filtered.slice(0, shown).map((i, k) => (
          <tr key={k}>
            <td className={cx(td, "tabular-nums text-ink")}>{i.ligne ?? "—"}</td>
            <td className={cx(td, "font-mono text-xs")}>{i.colonne ?? "—"}</td>
            <td className={cx(td, "max-w-48 truncate font-mono text-xs")} title={i.valeur ?? ""}>
              {i.valeur ? <span className="rounded bg-sunken px-1.5 py-0.5">{i.valeur}</span> : "—"}
            </td>
            <td className={cx("px-5 py-3 text-[13px]", color)}>{i.message}</td>
          </tr>
        ))}
      </Table>
      {filtered.length > shown && (
        <div className="mt-4 text-center">
          <button type="button" className={btn.secondary} onClick={() => setShown((s) => s + PAGE)}>
            Afficher plus ({filtered.length - shown} restantes)
          </button>
        </div>
      )}
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cx(
        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
