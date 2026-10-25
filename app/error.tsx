"use client";

import { RotateCw } from "lucide-react";
import { btn } from "@/components/ui";

/** Erreur inattendue pendant l'affichage d'une page. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid flex-1 place-items-center px-4 py-16">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-muted">Erreur</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Un problème est survenu</h1>
        <p className="mt-2 text-ink-2">
          La page n&apos;a pas pu s&apos;afficher. Si le problème persiste, vérifiez la connexion à la base de données.
        </p>
        {error.digest && <p className="mt-2 font-mono text-xs text-faint">Référence : {error.digest}</p>}
        <button type="button" onClick={reset} className={`${btn.primary} mt-8`}>
          <RotateCw /> Réessayer
        </button>
      </div>
    </main>
  );
}
