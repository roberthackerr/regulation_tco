"use client";

import { ChevronRight, FileSpreadsheet, Inbox } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Empty, OperatorTag, StatusBadge, Table, cx, td, tdNum } from "@/components/ui";
import { fmtDateTime, fmtNumber, fmtPeriod } from "@/lib/client/api";
import type { ImportSummary } from "@/lib/client/types";

/**
 * Liste des imports. Toute la ligne mène au détail. `actions` ajoute des
 * boutons en fin de ligne (approbation côté admin).
 */
export function ImportTable({
  imports,
  basePath,
  showOperator = false,
  actions,
  emptyText = "Aucun import pour le moment.",
  flushTop = false,
}: {
  imports: ImportSummary[];
  basePath: string;
  showOperator?: boolean;
  actions?: (imp: ImportSummary) => ReactNode;
  emptyText?: string;
  flushTop?: boolean;
}) {
  const router = useRouter();
  if (imports.length === 0) return <Empty icon={Inbox} title={emptyText} />;

  const head = [
    "Fichier",
    ...(showOperator ? ["Opérateur"] : []),
    "Période",
    "Lignes",
    "Anomalies",
    "Statut",
    "",
  ];

  return (
    <Table flushTop={flushTop} head={head} align={["left", ...(showOperator ? ["left" as const] : []), "left", "right", "left", "left", "right"]}>
      {imports.map((imp) => {
        const href = `${basePath}/${imp.id}`;
        return (
          <tr key={imp.id} className="group cursor-pointer transition-colors hover:bg-page/70" onClick={() => router.push(href)}>
            <td className={cx(td, "max-w-[17rem]")}>
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sunken text-ink-2">
                  <FileSpreadsheet className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  {/* Le lien reste le vrai point d'accès au clavier. */}
                  <Link href={href} title={imp.fileName} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-ink hover:underline">
                    {imp.fileName}
                  </Link>
                  <div className="text-xs text-muted">{fmtDateTime(imp.createdAt)}</div>
                </div>
              </div>
            </td>
            {showOperator && <td className={td}><OperatorTag code={imp.operatorCode} /></td>}
            <td className={td}>{imp.periodStart ? fmtPeriod(imp.periodStart, imp.periodEnd) : <span className="text-faint">—</span>}</td>
            <td className={tdNum}>{fmtNumber(imp.rowCount)}</td>
            <td className={td}>
              <div className="flex items-center gap-2 text-xs">
                {imp.errorCount > 0 && <span className="rounded-md bg-bad-soft px-1.5 py-0.5 font-medium text-bad-ink">{fmtNumber(imp.errorCount)} erreur{imp.errorCount > 1 && "s"}</span>}
                {imp.warningCount > 0 && <span className="rounded-md bg-warn-soft px-1.5 py-0.5 font-medium text-warn-ink">{fmtNumber(imp.warningCount)} avert.</span>}
                {imp.errorCount === 0 && imp.warningCount === 0 && <span className="text-faint">Aucune</span>}
              </div>
            </td>
            <td className={td}><StatusBadge status={imp.status} /></td>
            <td className={cx(td, "!pl-1 text-right")} onClick={(e) => actions && e.stopPropagation()}>
              {actions?.(imp) ?? <ChevronRight className="ml-auto h-4 w-4 text-faint group-hover:text-ink-2" aria-hidden />}
            </td>
          </tr>
        );
      })}
    </Table>
  );
}
