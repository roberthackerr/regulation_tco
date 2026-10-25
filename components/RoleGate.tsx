import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/dal";
import { homeForRole } from "@/lib/auth/token";
import { OPERATORS, type Role } from "@/lib/constants";
import { OPERATOR_COLORS } from "@/lib/theme";
import { LogoutButton } from "./LogoutButton";
import { Skeleton } from "./ui";

/**
 * Vérifie côté serveur (en base) que l'utilisateur a le bon rôle avant d'afficher
 * le contenu d'un espace. Doit être placé dans un <Suspense> : il lit le cookie
 * de session, donc il s'exécute à chaque requête.
 */
export async function RoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect(homeForRole(user.role));
  return <>{children}</>;
}

/** Carte utilisateur (initiales, nom, rôle) et bouton de déconnexion. */
export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;

  const operator = OPERATORS.find((o) => o.code === user.operatorCode);
  const initials = operator
    ? operator.code[0]
    : user.nom
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join("") || user.nom.slice(0, 2).toUpperCase();
  const color = user.operatorCode ? OPERATOR_COLORS[user.operatorCode] : "#13294b";

  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white" style={{ background: color }} aria-hidden>
        {initials}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-medium text-ink">{operator?.nom ?? user.nom}</div>
        <div className="truncate text-xs text-muted">{user.email}</div>
      </div>
      <LogoutButton />
    </div>
  );
}

export function UserMenuSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="h-9 w-9 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}
