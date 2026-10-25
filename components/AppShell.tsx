import { Suspense, type ReactNode } from "react";
import { Brand } from "./Brand";
import { CommandPalette, PaletteTrigger } from "./CommandPalette";
import { AREA_TITLES, type Area } from "./areas";
import { MobileBar, SideNav, StaticNav } from "./NavLinks";
import { ToastProvider } from "./ui-client";

/**
 * Cadre des espaces connectés : barre latérale (ordinateur) ou barre supérieure
 * avec tiroir (mobile), puis le contenu.
 * Le cadre est statique ; ce qui dépend de la requête (onglet actif, utilisateur)
 * arrive derrière des <Suspense>.
 */
export function AppShell({ area, userSlot, children }: { area: Area; userSlot: ReactNode; children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="min-h-full flex-1 lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface px-4 py-5 lg:flex">
          <div className="px-1">
            <Brand href={area === "admin" ? "/admin" : "/operateur"} />
          </div>
          <div className="mt-6">
            <PaletteTrigger />
          </div>
          <div className="mt-6 mb-2 px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{AREA_TITLES[area]}</div>
          <Suspense fallback={<StaticNav area={area} />}>
            <SideNav area={area} />
          </Suspense>
          <div className="mt-auto border-t border-line pt-4">{userSlot}</div>
        </aside>

        <div className="flex min-w-0 flex-col">
          <Suspense fallback={null}>
            <MobileBar area={area} userSlot={userSlot} />
          </Suspense>
          <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-8 sm:px-8 lg:py-10">{children}</main>
        </div>
      </div>
      <CommandPalette area={area} />
    </ToastProvider>
  );
}
