import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { RoleGate, UserMenu, UserMenuSkeleton } from "@/components/RoleGate";
import { PageSkeleton } from "@/components/ui";

/** Espace de l'autorité de régulation (rôle admin uniquement). */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AppShell
      area="admin"
      userSlot={
        <Suspense fallback={<UserMenuSkeleton />}>
          <UserMenu />
        </Suspense>
      }
    >
      <Suspense fallback={<PageSkeleton />}>
        <RoleGate role="admin">{children}</RoleGate>
      </Suspense>
    </AppShell>
  );
}
