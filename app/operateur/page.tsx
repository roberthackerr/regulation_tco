import type { Metadata } from "next";
import { MetricsView } from "@/components/MetricsView";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Mes indicateurs" };

export default function OperateurHomePage() {
  return (
    <>
      <PageHeader
        eyebrow="Espace opérateur"
        title="Mes indicateurs"
        subtitle="Qualité de service issue de vos imports approuvés par l'autorité de régulation."
      />
      <MetricsView uploadHref="/operateur/imports" />
    </>
  );
}
