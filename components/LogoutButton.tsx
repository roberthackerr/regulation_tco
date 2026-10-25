"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { btn } from "./ui";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function logout() {
    setPending(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh(); // vide le cache client des pages protégées
  }
  return (
    <button type="button" onClick={logout} disabled={pending} className={btn.icon} aria-label="Se déconnecter" title="Se déconnecter">
      <LogOut />
    </button>
  );
}
