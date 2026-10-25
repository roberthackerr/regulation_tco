import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ModelView } from "./ModelView";

export const metadata: Metadata = { title: "Modèle IA" };

export default function ModelPage() {
  return (
    <>
      <PageHeader
        eyebrow="Autorité de régulation"
        title="Modèle de satisfaction"
        subtitle="Entraînement sur Kaggle piloté depuis l'observatoire : publication du dataset, exécution du notebook TensorFlow, récupération du modèle. Puis simulation en direct."
      />
      <ModelView />
    </>
  );
}
