"use client";

import { Eye, EyeOff } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Field, btn, input } from "@/components/ui";
import { api } from "@/lib/client/api";

export function LoginForm() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [show, setShow] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    try {
      const { redirect } = await api<{ redirect: string }>("/api/auth/login", {
        method: "POST",
        json: { email: form.get("email"), password: form.get("password") },
      });
      // On ne suit le paramètre ?next que s'il pointe vers l'espace du rôle connecté.
      const next = searchParams.get("next");
      // Rechargement complet : les espaces protégés relisent la nouvelle session côté serveur.
      window.location.href = next && (next === redirect || next.startsWith(redirect + "/")) ? next : redirect;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connexion impossible.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5">
      {error && <Alert>{error}</Alert>}
      <Field id="email" label="Adresse email">
        <input id="email" name="email" type="email" autoComplete="email" required autoFocus className={input} placeholder="nom@exemple.mg" />
      </Field>
      <Field id="password" label="Mot de passe">
        <div className="relative">
          <input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" required className={`${input} pr-10`} />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 grid w-10 place-items-center text-faint hover:text-ink"
            aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>
      <button type="submit" disabled={pending} className={`${btn.primary} w-full !py-2.5`}>
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
