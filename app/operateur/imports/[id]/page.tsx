import type { Metadata } from "next";
import { ImportDetail } from "@/components/imports/ImportDetail";

export const metadata: Metadata = { title: "Détail de l'import" };

export default function OperateurImportDetailPage() {
  return <ImportDetail backHref="/operateur/imports" />;
}
