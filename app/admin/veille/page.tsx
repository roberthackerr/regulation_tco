import type { Metadata } from "next";
import { AdminVeille } from "./AdminVeille";

export const metadata: Metadata = { title: "Veille réseaux sociaux" };

export default function AdminVeillePage() {
  return <AdminVeille />;
}
