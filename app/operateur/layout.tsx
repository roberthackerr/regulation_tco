import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { RoleGate, UserMenu, UserMenuSkeleton } from "@/components/RoleGate";
import { PageSkeleton } from "@/components/ui";

/** Espace opérateur : chaque opérateur ne voit que ses propres données. */
export default function OperateurLayout({ children }: LayoutProps<"/operateur">) {
  return (
    <AppShell
      area="operator"
      userSlot={
        <Suspense fallback={<UserMenuSkeleton />}>
          <UserMenu />
        </Suspense>
      }
    >
      <Suspense fallback={<PageSkeleton />}>
        <RoleGate role="operator">{children}</RoleGate>
      </Suspense>
    </AppShell>
  );
}
