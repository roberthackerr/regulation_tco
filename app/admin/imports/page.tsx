import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, PageSkeleton } from "@/components/ui";
import { AdminImports } from "./AdminImports";

export const metadata: Metadata = { title: "Imports" };

export default function AdminImportsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Autorité de régulation"
        title="Imports des opérateurs"
        subtitle="Les fichiers conformes attendent votre approbation avant d'être intégrés aux données de référence."
      />
      {/* useSearchParams (filtres dans l'URL) doit être sous un Suspense. */}
      <Suspense fallback={<PageSkeleton />}>
        <AdminImports />
      </Suspense>
    </>
  );
}
