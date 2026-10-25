import type { Metadata } from "next";
import { PredictionsView } from "@/components/predictions/PredictionsView";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Prédictions" };

export default function AdminPredictionsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Autorité de régulation"
        title="Satisfaction prédite"
        subtitle="Le modèle de deep learning estime la satisfaction des usagers dans chaque région, pour chaque opérateur et chaque service, et explique ses prédictions."
      />
      <PredictionsView role="admin" />
    </>
  );
}
