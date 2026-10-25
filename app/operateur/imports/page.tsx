import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { OperatorImports } from "./OperatorImports";

export const metadata: Metadata = { title: "Mes imports" };

export default function OperateurImportsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Espace opérateur"
        title="Mes imports"
        subtitle="Transmettez vos indicateurs mensuels. Chaque fichier est contrôlé immédiatement, puis approuvé par l'autorité."
      />
      <OperatorImports />
    </>
  );
}
