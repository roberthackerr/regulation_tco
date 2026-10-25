import type { Metadata } from "next";
import { PredictionsView } from "@/components/predictions/PredictionsView";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Satisfaction prédite" };

export default function OperateurSatisfactionPage() {
  return (
    <>
      <PageHeader
        eyebrow="Espace opérateur"
        title="Satisfaction prédite"
        subtitle="Estimation par l'IA de la satisfaction de vos usagers, région par région, avec les leviers d'amélioration."
      />
      <PredictionsView role="operator" />
    </>
  );
}
