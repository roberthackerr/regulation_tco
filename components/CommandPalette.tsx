"use client";

/**
 * Palette de commandes (Ctrl+K / ⌘K) : navigation et actions rapides au clavier.
 */
import {
  BrainCircuit,
  Command,
  CornerDownLeft,
  FileDown,
  FileUp,
  Gauge,
  Globe,
  LayoutDashboard,
  LineChart,
  LogOut,
  Play,
  Search,
  Upload,
  Users,
  Workflow,
  type LucideIcon,
  Radar,
  Smile,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/client/api";
import type { PipelineOverview } from "@/lib/client/types";
import type { Area } from "./areas";
import { cx } from "./ui";
import { useToast } from "./ui-client";

type Item = { id: string; group: string; label: string; hint?: string; icon: LucideIcon; keywords?: string; run: () => void | Promise<void> };

const OPEN_EVENT = "open-command-palette";

/** Bouton d'ouverture (barre latérale). */
export function PaletteTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className="flex w-full items-center gap-2 rounded-lg border border-line bg-page px-3 py-2 text-left text-[13px] text-muted transition-colors hover:border-line-strong hover:text-ink"
    >
      <Search className="h-4 w-4" aria-hidden />
      Rechercher…
      <kbd className="ml-auto rounded border border-line bg-surface px-1.5 font-sans text-[11px] text-faint">Ctrl K</kbd>
    </button>
  );
}

export function CommandPalette({ area }: { area: Area }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // La recherche est remise à zéro à la fermeture : la palette s'ouvre toujours vierge.
  const close = () => {
    setOpen(false);
    setQuery("");
    setIndex(0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) {
          setOpen(false);
          setQuery("");
          setIndex(0);
        } else setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => router.push(href);
    const logout = async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    };
    const common: Item[] = [
      { id: "public", group: "Navigation", label: "Page publique (open data)", icon: Globe, run: go("/") },
      { id: "logout", group: "Compte", label: "Se déconnecter", icon: LogOut, keywords: "quitter deconnexion", run: logout },
    ];
    if (area === "admin") {
      return [
        { id: "home", group: "Navigation", label: "Vue d'ensemble", icon: LayoutDashboard, keywords: "accueil dashboard", run: go("/admin") },
        { id: "imports", group: "Navigation", label: "Imports", icon: FileUp, keywords: "csv fichiers", run: go("/admin/imports") },
        { id: "pending", group: "Navigation", label: "Imports en attente d'approbation", icon: FileUp, keywords: "recu valider approuver", run: go("/admin/imports?status=recu") },
        { id: "metrics", group: "Navigation", label: "Indicateurs", icon: LineChart, keywords: "qualite service comparer", run: go("/admin/indicateurs") },
        { id: "pipeline", group: "Navigation", label: "Pipeline de traitement", icon: Workflow, keywords: "dataset donnees versions", run: go("/admin/pipeline") },
        { id: "model", group: "Navigation", label: "Modèle IA & simulateur", icon: BrainCircuit, keywords: "kaggle entrainement prediction tensorflow", run: go("/admin/modele") },
        { id: "users", group: "Navigation", label: "Utilisateurs", icon: Users, keywords: "comptes", run: go("/admin/utilisateurs") },
        { id: "predictions", group: "Navigation", label: "Satisfaction prédite (carte des régions)", icon: Smile, keywords: "prediction ia deep learning heatmap risque explication", run: go("/admin/predictions") },
        { id: "veille", group: "Navigation", label: "Veille réseaux sociaux & avis", icon: Radar, keywords: "app store presse youtube facebook twitter scraping sentiment reputation avis", run: go("/admin/veille") },
        {
          id: "run",
          group: "Actions",
          label: "Lancer le pipeline",
          hint: "nettoyage → features → dataset",
          icon: Play,
          keywords: "executer traitement",
          run: async () => {
            await api("/api/admin/pipeline", { method: "POST" });
            toast.success("Pipeline lancé.");
            router.push("/admin/pipeline");
          },
        },
        {
          id: "train",
          group: "Actions",
          label: "Entraîner le modèle sur Kaggle",
          hint: "dataset → notebook → modèle",
          icon: BrainCircuit,
          keywords: "kaggle tensorflow apprentissage",
          run: async () => {
            await api("/api/admin/training", { method: "POST", json: {} });
            toast.success("Entraînement lancé sur Kaggle.");
            router.push("/admin/modele");
          },
        },
        {
          id: "dataset",
          group: "Actions",
          label: "Explorer le dernier dataset",
          icon: Workflow,
          keywords: "version correlations features",
          run: async () => {
            const d = await api<PipelineOverview>("/api/admin/pipeline");
            if (!d.versions[0]) return toast.error("Aucune version du dataset pour l'instant.");
            router.push(`/admin/pipeline/datasets/${d.versions[0].id}`);
          },
        },
        {
          id: "export",
          group: "Actions",
          label: "Télécharger le dernier dataset (CSV)",
          icon: FileDown,
          keywords: "export kaggle",
          run: async () => {
            const d = await api<PipelineOverview>("/api/admin/pipeline");
            if (!d.versions[0]) return toast.error("Aucune version du dataset pour l'instant.");
            // Téléchargement d'un fichier (route API), pas une navigation de page.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.assign(`/api/admin/datasets/${d.versions[0].id}/export?format=csv`);
          },
        },
        ...common,
      ];
    }
    return [
      { id: "home", group: "Navigation", label: "Mes indicateurs", icon: Gauge, run: go("/operateur") },
      { id: "imports", group: "Navigation", label: "Mes imports", icon: Upload, run: go("/operateur/imports") },
      { id: "satisfaction", group: "Navigation", label: "Satisfaction prédite", icon: Smile, keywords: "prediction ia region risque leviers", run: go("/operateur/satisfaction") },
      { id: "veille", group: "Navigation", label: "Veille & e-réputation", icon: Radar, keywords: "app store presse youtube facebook twitter scraping sentiment reputation avis reseaux sociaux", run: go("/operateur/veille") },
      { id: "template", group: "Actions", label: "Télécharger le modèle CSV", icon: FileDown, keywords: "template", run: () => {
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign("/api/imports/template");
        } },
      ...common,
    ];
  }, [area, router, toast]);

  const filtered = useMemo(() => {
    const q = norm(query);
    if (!q) return items;
    return items
      .map((it) => ({ it, s: score(norm(`${it.label} ${it.keywords ?? ""} ${it.group}`), q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.it);
  }, [items, query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  async function exec(it: Item | undefined) {
    if (!it) return;
    close();
    try {
      await it.run();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Palette de commandes">
      <div className="absolute inset-0 animate-fade-in bg-ink/30 backdrop-blur-[2px]" onClick={close} />
      <div className="relative w-full max-w-lg animate-slide-up overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 text-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                exec(filtered[index]);
              }
            }}
            placeholder="Aller à une page, lancer une action…"
            className="h-12 flex-1 bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none"
            aria-label="Rechercher une commande"
          />
          <kbd className="rounded border border-line px-1.5 text-[11px] text-faint">Échap</kbd>
        </div>
        <ul ref={listRef} className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {filtered.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">Aucun résultat pour « {query} »</li>}
          {filtered.map((it, i) => {
            const header = i === 0 || filtered[i - 1].group !== it.group ? it.group : null;
            return (
              <li key={it.id}>
                {header && <div className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{header}</div>}
                <button
                  type="button"
                  data-idx={i}
                  role="option"
                  aria-selected={i === index}
                  onMouseMove={() => setIndex(i)}
                  onClick={() => exec(it)}
                  className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm", i === index ? "bg-brand-soft text-brand" : "text-ink")}
                >
                  <it.icon className={cx("h-4 w-4", i === index ? "text-brand" : "text-faint")} aria-hidden />
                  <span className="flex-1">{it.label}</span>
                  {it.hint && <span className="text-xs text-muted">{it.hint}</span>}
                  {i === index && <CornerDownLeft className="h-3.5 w-3.5" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-3 border-t border-line bg-page px-4 py-2 text-[11px] text-muted">
          <Command className="h-3 w-3" /> Ctrl K pour ouvrir · ↑↓ pour choisir · Entrée pour valider
        </div>
      </div>
    </div>,
    document.body,
  );
}

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Score simple : mot entier > début de mot > sous-séquence de lettres. */
function score(text: string, q: string): number {
  if (text.includes(q)) return text.startsWith(q) ? 100 : text.includes(` ${q}`) ? 80 : 60;
  let ti = 0;
  for (const ch of q) {
    ti = text.indexOf(ch, ti);
    if (ti < 0) return 0;
    ti++;
  }
  return 10;
}
