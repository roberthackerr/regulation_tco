import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { VeilleView } from "@/components/veille/VeilleView";

export const metadata: Metadata = { title: "Veille & e-réputation" };

export default function OperateurVeillePage() {
  return (
    <>
      <PageHeader
        eyebrow="Espace opérateur"
        title="Veille & e-réputation"
        subtitle="Ce que les usagers disent de vous sur les réseaux sociaux, dans la presse et via les avis publics, analysé par l'IA (français et malagasy)."
      />
      <VeilleView />
    </>
  );
}
