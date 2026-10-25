import type { Metadata } from "next";
import { UserAdmin } from "./UserAdmin";

export const metadata: Metadata = { title: "Utilisateurs" };

export default function AdminUsersPage() {
  return <UserAdmin />;
}
