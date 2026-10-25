import { BrainCircuit, Building2, FileCheck2, RadioTower, ShieldCheck, Upload, Users } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { FeedbackButton } from "@/components/FeedbackButton";
import { btn } from "@/components/ui";
import { PublicDashboard } from "./PublicDashboard";

/**
 * Page publique : présentation, comparaison agrégée des opérateurs (open data)
 * et fonctionnement de la plateforme. Le bouton « Donner mon avis » ouvre le
 * formulaire public (les signalements arrivent en phase 5).
 */
export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-line/80 bg-page/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Brand />
          <nav className="flex items-center gap-1 text-sm">
            <a href="#comparaison" className="hidden rounded-lg px-3 py-2 font-medium text-ink-2 hover:text-ink sm:block">Comparaison</a>
            <a href="#fonctionnement" className="hidden rounded-lg px-3 py-2 font-medium text-ink-2 hover:text-ink sm:block">Fonctionnement</a>
            <Link href="/login" className={`${btn.secondary} ml-2`}>Espace professionnel</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Accroche */}
        <section className="relative overflow-hidden border-b border-line">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_85%_-10%,#dfe7f3,transparent_60%)]" aria-hidden />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:py-24">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-2 shadow-card">
                <RadioTower className="h-3.5 w-3.5 text-brand" aria-hidden /> Observatoire de la qualité des réseaux mobiles · Madagascar
              </p>
              <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-ink sm:text-5xl">
                La qualité de vos réseaux mobiles, mesurée et comparée.
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2">
                L&apos;autorité de régulation collecte les indicateurs des opérateurs et l&apos;avis des usagers, puis
                prédit la satisfaction région par région grâce au deep learning.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#comparaison" className={`${btn.primary} !px-5 !py-2.5`}>Comparer les opérateurs</a>
                <FeedbackButton className="!px-5 !py-2.5" />
              </div>
            </div>

            <div className="grid content-center gap-3 sm:grid-cols-2">
              {[
                { icon: Building2, title: "3 opérateurs", text: "Yas, Orange et Airtel transmettent leurs indicateurs chaque mois." },
                { icon: RadioTower, title: "23 régions", text: "Coupures, débit, latence, disponibilité et tarifs suivis partout." },
                { icon: Users, title: "La voix des usagers", text: "Avis et signalements intégrés à l'analyse." },
                { icon: BrainCircuit, title: "Deep learning", text: "Un réseau de neurones prédit la satisfaction des usagers." },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-2xl border border-line bg-surface/90 p-5 shadow-card">
                  <Icon className="h-5 w-5 text-brand" aria-hidden />
                  <div className="mt-3 font-semibold text-ink">{title}</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Comparaison open data */}
        <section id="comparaison" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
          <div className="mb-8 max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Données ouvertes</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Comparaison des opérateurs</h2>
            <p className="mt-2 text-ink-2">Moyennes nationales issues des données validées par l&apos;autorité. Aucune donnée commerciale ou individuelle n&apos;est publiée.</p>
          </div>
          <PublicDashboard />
        </section>

        {/* Fonctionnement */}
        <section id="fonctionnement" className="scroll-mt-20 border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="mb-10 max-w-2xl">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted">Fonctionnement</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">De la donnée brute à la prédiction</h2>
            </div>
            <ol className="grid gap-6 md:grid-cols-4">
              {[
                { icon: Upload, title: "Collecte", text: "Les opérateurs transmettent leurs indicateurs mensuels au format CSV standard." },
                { icon: FileCheck2, title: "Contrôle", text: "Chaque fichier est vérifié automatiquement, puis approuvé par l'autorité." },
                { icon: ShieldCheck, title: "Traitement", text: "Les données sont nettoyées et fusionnées avec les avis des usagers." },
                { icon: BrainCircuit, title: "Prédiction", text: "Un modèle entraîné sur Kaggle estime la satisfaction de 0 à 100." },
              ].map(({ icon: Icon, title, text }, i) => (
                <li key={title} className="relative">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-white">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="text-xs font-medium text-muted">Étape {i + 1}</span>
                  </div>
                  <h3 className="mt-4 font-semibold text-ink">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-xs text-muted sm:px-6">
          <span>Projet académique — régulation des télécommunications.</span>
          <span>Données réelles uniquement : indicateurs transmis par les opérateurs, avis des usagers et contenus publics.</span>
        </div>
      </footer>
    </div>
  );
}
