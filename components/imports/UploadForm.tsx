"use client";

import { ArrowRight, Download, FileSpreadsheet, UploadCloud, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { Alert, btn, cx } from "@/components/ui";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { api, fmtNumber, fmtSize } from "@/lib/client/api";
import type { ImportSummary } from "@/lib/client/types";

/** Envoi d'un fichier CSV par glisser-déposer ou sélection, avec retour immédiat de la validation. */
export function UploadForm({ onUploaded, detailBase }: { onUploaded: () => void; detailBase: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pick(f: File | undefined) {
    setResult(null);
    setError(null);
    if (f && !/\.csv$/i.test(f.name)) {
      setError("Seuls les fichiers .csv sont acceptés.");
      return;
    }
    if (f && f.size > MAX_UPLOAD_BYTES) {
      setError("Fichier trop volumineux (5 Mo maximum).");
      return;
    }
    setFile(f ?? null);
  }

  function clear() {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files[0]);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setPending(true);
    setError(null);
    const body = new FormData();
    body.set("file", file);
    try {
      const { import: imp } = await api<{ import: ImportSummary }>("/api/imports", { method: "POST", body });
      setResult(imp);
      clear();
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'envoi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {file ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-page/60 px-4 py-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface text-ink-2 shadow-card">
            <FileSpreadsheet className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-ink">{file.name}</div>
            <div className="text-xs text-muted">{fmtSize(file.size)} · prêt à être validé</div>
          </div>
          <button type="button" onClick={clear} disabled={pending} className={btn.icon} aria-label="Retirer le fichier">
            <X />
          </button>
        </div>
      ) : (
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cx(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragging ? "border-brand bg-brand-soft" : "border-line-strong/70 hover:border-line-strong hover:bg-page/60",
          )}
        >
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          <span className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-sunken text-ink-2">
            <UploadCloud className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-sm font-medium text-ink">Glissez votre fichier CSV ici</span>
          <span className="mt-1 text-xs text-muted">ou <span className="font-medium text-brand underline underline-offset-2">parcourez vos fichiers</span> · UTF-8, 5 Mo maximum</span>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={!file || pending} className={btn.primary}>
          {pending ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden /> Validation…
            </>
          ) : (
            <>Envoyer et valider</>
          )}
        </button>
        <a href="/api/imports/template" download className={btn.ghost}>
          <Download /> Modèle CSV
        </a>
      </div>

      {error && <Alert>{error}</Alert>}
      {result && (
        <Alert
          tone={result.status === "rejete" ? "error" : result.warningCount ? "warn" : "success"}
          title={result.status === "rejete" ? "Fichier rejeté" : "Fichier conforme, transmis à l'autorité"}
          action={
            <Link href={`${detailBase}/${result.id}`} className="inline-flex shrink-0 items-center gap-1 self-center text-[13px] font-semibold underline-offset-2 hover:underline">
              Voir le rapport <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {result.status === "rejete" ? (
            <>{fmtNumber(result.errorCount)} erreur(s) à corriger avant de renvoyer le fichier.</>
          ) : (
            <>
              {fmtNumber(result.rowCount)} lignes validées
              {result.warningCount > 0 && <>, {fmtNumber(result.warningCount)} valeur(s) inhabituelle(s) à vérifier</>}. En attente d&apos;approbation.
            </>
          )}
        </Alert>
      )}
    </form>
  );
}
