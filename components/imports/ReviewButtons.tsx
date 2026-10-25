"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import { btn, cx, input } from "@/components/ui";
import { ConfirmDialog, Dialog, useToast } from "@/components/ui-client";
import { api } from "@/lib/client/api";

/** Approuver / Refuser un import (admin). Chaque décision passe par une confirmation. */
export function ReviewButtons({
  importId,
  fileName,
  onDone,
  compact = false,
}: {
  importId: string;
  fileName: string;
  onDone: () => void;
  compact?: boolean;
}) {
  const toast = useToast();
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  async function run(path: "approve" | "reject") {
    setPending(true);
    try {
      await api(`/api/admin/imports/${importId}/${path}`, { method: "POST", json: path === "reject" ? { reason } : {} });
      toast.success(path === "approve" ? `« ${fileName} » approuvé : les données sont intégrées.` : `« ${fileName} » refusé.`);
      setDialog(null);
      setReason("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-1.5">
        <button type="button" onClick={() => setDialog("approve")} className={cx(btn.success, compact && btn.sm)}>
          <Check /> Approuver
        </button>
        {compact ? (
          <button type="button" onClick={() => setDialog("reject")} className={cx(btn.icon, "h-8 w-8 border border-line-strong/70")} aria-label="Refuser" title="Refuser">
            <X />
          </button>
        ) : (
          <button type="button" onClick={() => setDialog("reject")} className={cx(btn.secondary, "!py-1.5")}>
            <X /> Refuser
          </button>
        )}
      </div>

      <ConfirmDialog
        open={dialog === "approve"}
        onClose={() => setDialog(null)}
        onConfirm={() => run("approve")}
        pending={pending}
        title="Approuver cet import ?"
        description={<>Les lignes de « {fileName} » seront intégrées aux données de référence de l&apos;opérateur et utilisées par le pipeline.</>}
        confirmLabel="Approuver"
      />

      <Dialog
        open={dialog === "reject"}
        onClose={() => setDialog(null)}
        title="Refuser cet import"
        description="L'opérateur verra ce motif et pourra renvoyer un fichier corrigé."
        footer={
          <>
            <button type="button" onClick={() => setDialog(null)} className={btn.secondary}>Annuler</button>
            <button type="button" disabled={pending || reason.trim().length < 3} onClick={() => run("reject")} className={cx(btn.danger, "!px-4 !py-2")}>
              {pending ? "…" : "Refuser l'import"}
            </button>
          </>
        }
      >
        <label htmlFor={`reason-${importId}`} className="mb-1.5 block text-[13px] font-medium text-ink">Motif du refus</label>
        <textarea
          id={`reason-${importId}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Ex. : valeurs de débit incohérentes pour Analamanga en mars"
          className={input}
        />
      </Dialog>
    </>
  );
}
