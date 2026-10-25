import { ArrowLeft, Building2, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Brand, BrandMark } from "@/components/Brand";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Connexion" };

export default function LoginPage() {
  return (
    <main className="grid flex-1 lg:grid-cols-2">
      {/* Panneau de présentation (grand écran) */}
      <section className="relative hidden overflow-hidden bg-brand p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-24 -bottom-24 h-[28rem] w-[28rem] rounded-full bg-white/5" aria-hidden />
        <div className="pointer-events-none absolute -right-8 -bottom-8 h-64 w-64 rounded-full bg-white/5" aria-hidden />
        <div className="flex items-center gap-2.5">
          <BrandMark size={36} tone="light" />
          <span className="text-lg font-semibold tracking-tight">Observatoire Télécoms</span>
        </div>
        <div className="mt-auto max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">Espace professionnel</h2>
          <p className="mt-3 text-white/75">
            Transmission des indicateurs de qualité de service et supervision des réseaux mobiles.
          </p>
          <ul className="mt-8 space-y-4 text-sm">
            <li className="flex gap-3">
              <ShieldCheck className="h-5 w-5 shrink-0 text-white/80" aria-hidden />
              <span><strong className="font-medium">Autorité de régulation</strong><br /><span className="text-white/70">Validation des données, suivi des modèles, modération.</span></span>
            </li>
            <li className="flex gap-3">
              <Building2 className="h-5 w-5 shrink-0 text-white/80" aria-hidden />
              <span><strong className="font-medium">Opérateurs</strong><br /><span className="text-white/70">Import des indicateurs mensuels et suivi de vos données.</span></span>
            </li>
          </ul>
        </div>
      </section>

      {/* Formulaire */}
      <section className="flex flex-col px-4 py-8 sm:px-8">
        <div className="flex items-center justify-between">
          <span className="lg:hidden"><Brand /></span>
          <Link href="/" className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink">
            <ArrowLeft className="h-4 w-4" /> Site public
          </Link>
        </div>
        <div className="m-auto w-full max-w-sm py-12">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Connexion</h1>
          <p className="mt-1.5 text-sm text-ink-2">Accès réservé à l&apos;autorité de régulation et aux opérateurs.</p>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
          <p className="mt-8 text-[13px] text-muted">
            Vous êtes usager ? Consultez la <Link href="/#comparaison" className="font-medium text-ink underline underline-offset-2">comparaison publique des opérateurs</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
