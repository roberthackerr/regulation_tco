import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { PipelineView } from "./PipelineView";

export const metadata: Metadata = { title: "Pipeline de traitement" };

export default function PipelinePage() {
  return (
    <>
      <PageHeader
        eyebrow="Autorité de régulation"
        title="Pipeline de traitement"
        subtitle="Des indicateurs validés et des avis d'usagers au jeu de données d'entraînement versionné. Suivi en direct de chaque étape."
      />
      <PipelineView />
    </>
  );
}
