import type { Metadata } from "next";
import { AdminMetrics } from "./AdminMetrics";

export const metadata: Metadata = { title: "Indicateurs" };

export default function AdminIndicateursPage() {
  return <AdminMetrics />;
}
