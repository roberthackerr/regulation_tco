"use client";

import {
  BrainCircuit,
  FileUp,
  Gauge,
  LayoutDashboard,
  LineChart,
  Menu,
  Radar,
  Smile,
  Upload,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AREA_TITLES, type Area } from "./areas";
import { BrandMark } from "./Brand";
import { cx } from "./ui";


type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };

/** Menus de chaque espace (définis ici car les icônes ne peuvent pas venir d'un composant serveur). */
const NAV: Record<Area, { items: NavItem[] }> = {
  admin: {
    items: [
      { href: "/admin", label: "Vue d'ensemble", icon: LayoutDashboard, exact: true },
      { href: "/admin/imports", label: "Imports", icon: FileUp },
      { href: "/admin/indicateurs", label: "Indicateurs", icon: LineChart },
      { href: "/admin/predictions", label: "Prédictions", icon: Smile },
      { href: "/admin/pipeline", label: "Pipeline & données", icon: Workflow },
      { href: "/admin/modele", label: "Modèle IA", icon: BrainCircuit },
      { href: "/admin/veille", label: "Veille sociale", icon: Radar },
      { href: "/admin/utilisateurs", label: "Utilisateurs", icon: Users },
    ],
  },
  operator: {
    items: [
      { href: "/operateur", label: "Mes indicateurs", icon: Gauge, exact: true },
      { href: "/operateur/satisfaction", label: "Satisfaction prédite", icon: Smile },
      { href: "/operateur/imports", label: "Mes imports", icon: Upload },
      { href: "/operateur/veille", label: "Veille & e-réputation", icon: Radar },
    ],
  },
};

/** Liste des liens ; `pathname` null = rendu statique sans onglet actif (avant hydratation). */
function NavList({ area, pathname, onNavigate }: { area: Area; pathname: string | null; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Navigation principale">
      {NAV[area].items.map(({ href, label, icon: Icon, exact }) => {
        const active = pathname != null && (exact ? pathname === href : pathname === href || pathname.startsWith(href + "/"));
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cx(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-brand-soft text-brand" : "text-ink-2 hover:bg-sunken hover:text-ink",
            )}
          >
            <Icon className={cx("h-[18px] w-[18px]", active ? "text-brand" : "text-faint group-hover:text-ink-2")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function StaticNav({ area }: { area: Area }) {
  return <NavList area={area} pathname={null} />;
}

export function SideNav({ area }: { area: Area }) {
  return <NavList area={area} pathname={usePathname()} />;
}

/** Barre supérieure mobile avec menu tiroir. */
export function MobileBar({ area, userSlot }: { area: Area; userSlot: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Bloque le défilement de la page quand le tiroir est ouvert.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-3 backdrop-blur lg:hidden">
      <Link href={NAV[area].items[0].href} className="flex items-center gap-2 font-semibold text-ink">
        <BrandMark size={28} />
        <span className="text-[15px] tracking-tight">Observatoire</span>
      </Link>
      <button type="button" onClick={() => setOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 hover:bg-sunken" aria-label="Ouvrir le menu" aria-expanded={open}>
        <Menu className="h-5 w-5" />
      </button>

      {/* Portal : la barre floutée (backdrop-filter) piégerait un élément "fixed" à l'intérieur. */}
      {open && createPortal(
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 animate-fade-in bg-ink/30" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] animate-slide-up flex-col bg-surface p-4 shadow-pop">
            <div className="mb-6 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted">{AREA_TITLES[area]}</span>
              <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-2 hover:bg-sunken" aria-label="Fermer le menu">
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavList area={area} pathname={pathname} onNavigate={() => setOpen(false)} />
            <div className="mt-auto border-t border-line pt-4">{userSlot}</div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
