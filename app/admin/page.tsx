import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { AdminOverview } from "./AdminOverview";

export const metadata: Metadata = { title: "Vue d'ensemble" };

export default function AdminHomePage() {
  return (
    <>
      <PageHeader
        eyebrow="Autorité de régulation"
        title="Vue d'ensemble"
        subtitle="Données transmises par les opérateurs, état de la chaîne de traitement et qualité de service nationale."
      />
      <AdminOverview />
    </>
  );
}
