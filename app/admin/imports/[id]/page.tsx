import type { Metadata } from "next";
import { ImportDetail } from "@/components/imports/ImportDetail";

export const metadata: Metadata = { title: "Détail de l'import" };

export default function AdminImportDetailPage() {
  return <ImportDetail backHref="/admin/imports" canReview />;
}
