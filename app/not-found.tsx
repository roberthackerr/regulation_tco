import Link from "next/link";
import { BrandMark } from "@/components/Brand";
import { btn } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="grid flex-1 place-items-center px-4 py-16">
      <div className="text-center">
        <div className="flex justify-center"><BrandMark size={40} /></div>
        <p className="mt-6 text-sm font-medium text-muted">Erreur 404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Page introuvable</h1>
        <p className="mt-2 text-ink-2">Cette adresse n&apos;existe pas ou n&apos;est plus disponible.</p>
        <Link href="/" className={`${btn.primary} mt-8`}>Retour à l&apos;accueil</Link>
      </div>
    </main>
  );
}
