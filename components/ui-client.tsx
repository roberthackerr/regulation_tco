"use client";

/**
 * Composants interactifs partagés : notifications (toasts), boîte de dialogue,
 * sélecteur segmenté.
 */
import { CheckCircle2, X, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { btn, cx } from "./ui";

/* ------------------------------------------------------------------ Notifications */

type Toast = { id: number; tone: "success" | "error"; message: string };
const ToastContext = createContext<((tone: Toast["tone"], message: string) => void) | null>(null);

/** Fournit `useToast()` aux pages ; les messages disparaissent après 4 s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);

  const push = useCallback((tone: Toast["tone"], message: string) => {
    const id = ++next.current;
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastContext value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex animate-slide-up items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-ink shadow-pop"
          >
            {t.tone === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-good" aria-hidden />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden />
            )}
            <span className="flex-1">{t.message}</span>
            <button type="button" className="text-faint hover:text-ink" aria-label="Fermer" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error("useToast doit être utilisé dans un ToastProvider.");
  return { success: (m: string) => push("success", m), error: (m: string) => push("error", m) };
}

/* ------------------------------------------------------------------ Dialogue */

/** Boîte de dialogue modale (élément <dialog> natif : focus et touche Échap gérés par le navigateur). */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Focus sur le premier champ du formulaire s'il y en a un, sinon sur le premier bouton d'action.
      const field = d.querySelector<HTMLElement>("input:not([type=radio]), select, textarea");
      (field ?? d.querySelector<HTMLElement>("[data-autofocus], footer button:last-child"))?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  // Rendu dans <body> (portal) : le dialogue n'hérite pas des styles de son emplacement
  // (ex. une cellule de tableau alignée à droite) et ses clics ne remontent pas à la ligne.
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!isClient) return null;

  return createPortal(
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[min(440px,calc(100vw-2rem))] animate-slide-up rounded-2xl border border-line bg-surface p-0 text-left text-ink shadow-pop"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="-m-1 rounded-md p-1 text-faint hover:text-ink" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
        {description && <p className="mt-1.5 text-sm text-ink-2">{description}</p>}
        {children && <div className="mt-4">{children}</div>}
      </div>
      {footer && <div className="flex justify-end gap-2 rounded-b-2xl border-t border-line bg-page/60 px-6 py-3">{footer}</div>}
    </dialog>,
    document.body,
  );
}

const noopSubscribe = () => () => {};

/** Dialogue de confirmation prêt à l'emploi. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmer",
  danger = false,
  pending = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  pending?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <button type="button" onClick={onClose} className={btn.secondary}>Annuler</button>
          <button type="button" disabled={pending} onClick={onConfirm} className={cx(danger ? btn.danger : btn.primary, "!px-4 !py-2")}>
            {pending ? "…" : confirmLabel}
          </button>
        </>
      }
    />
  );
}

/* ------------------------------------------------------------------ Sélecteur segmenté */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-lg bg-sunken p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-40",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-[13px]",
              active ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
