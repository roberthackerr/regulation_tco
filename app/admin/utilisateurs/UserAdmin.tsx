"use client";

import { KeyRound, MoreHorizontal, Plus, Power, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, Badge, Card, Field, OperatorTag, PageHeader, Skeleton, Table, btn, cx, input, td } from "@/components/ui";
import { ConfirmDialog, Dialog, Segmented, useToast } from "@/components/ui-client";
import { OPERATORS, type OperatorCode } from "@/lib/constants";
import { api } from "@/lib/client/api";
import type { UserSummary } from "@/lib/client/types";

export function UserAdmin() {
  const toast = useToast();
  const [users, setUsers] = useState<UserSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [resetFor, setResetFor] = useState<UserSummary | null>(null);
  const [deleteFor, setDeleteFor] = useState<UserSummary | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(() => {
    api<{ users: UserSummary[] }>("/api/admin/users")
      .then((d) => setUsers(d.users))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  async function act(fn: () => Promise<unknown>, success: string) {
    setPending(true);
    try {
      await fn();
      toast.success(success);
      load();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
      return false;
    } finally {
      setPending(false);
    }
  }

  const freeOperators = OPERATORS.filter((o) => !users?.some((u) => u.operatorCode === o.code)).map((o) => o.code);

  return (
    <>
      <PageHeader
        eyebrow="Autorité de régulation"
        title="Utilisateurs"
        subtitle="Comptes de l'autorité et des opérateurs. Désactiver un compte coupe son accès immédiatement."
        actions={
          <button type="button" onClick={() => setCreating(true)} className={btn.primary}>
            <Plus /> Nouveau compte
          </button>
        }
      />

      <Card padded={false}>
        <div className="px-5">
          {error && <div className="py-4"><Alert>{error}</Alert></div>}
          {!users ? (
            <div className="space-y-2 py-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : (
            <Table flushTop head={["Compte", "Rôle", "Statut", "Dernière connexion", ""]}>
              {users.map((u) => (
                <tr key={u.id} className={cx(!u.actif && "opacity-60")}>
                  <td className={td}>
                    <div className="font-medium text-ink">{u.nom}</div>
                    <div className="text-xs text-muted">{u.email}</div>
                  </td>
                  <td className={td}>
                    {u.role === "admin" ? (
                      <Badge tone="brand"><ShieldCheck className="h-3.5 w-3.5" /> Administrateur</Badge>
                    ) : (
                      <span className="text-[13px]"><OperatorTag code={u.operatorCode} label={`Opérateur ${u.operatorCode}`} /></span>
                    )}
                  </td>
                  <td className={td}>{u.actif ? <Badge tone="good">Actif</Badge> : <Badge tone="bad">Désactivé</Badge>}</td>
                  <td className={td}>{u.lastLogin ? relative(u.lastLogin) : <span className="text-faint">Jamais</span>}</td>
                  <td className={cx(td, "text-right")}>
                    <RowMenu
                      user={u}
                      onToggle={() => act(() => api(`/api/admin/users/${u.id}`, { method: "PATCH", json: { actif: !u.actif } }), u.actif ? `${u.email} désactivé.` : `${u.email} réactivé.`)}
                      onReset={() => setResetFor(u)}
                      onDelete={() => setDeleteFor(u)}
                    />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </Card>

      <CreateUserDialog
        open={creating}
        onClose={() => setCreating(false)}
        freeOperators={freeOperators}
        onCreated={(email) => {
          toast.success(`Compte ${email} créé.`);
          setCreating(false);
          load();
        }}
      />

      <ResetPasswordDialog
        user={resetFor}
        pending={pending}
        onClose={() => setResetFor(null)}
        onSubmit={async (password) => {
          if (resetFor && (await act(() => api(`/api/admin/users/${resetFor.id}`, { method: "PATCH", json: { password } }), `Mot de passe de ${resetFor.email} modifié.`))) {
            setResetFor(null);
          }
        }}
      />

      <ConfirmDialog
        open={!!deleteFor}
        onClose={() => setDeleteFor(null)}
        pending={pending}
        danger
        title="Supprimer ce compte ?"
        description={deleteFor && <>Le compte <strong>{deleteFor.email}</strong> sera supprimé définitivement. Ses imports passés sont conservés.</>}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          if (deleteFor && (await act(() => api(`/api/admin/users/${deleteFor.id}`, { method: "DELETE" }), `${deleteFor.email} supprimé.`))) {
            setDeleteFor(null);
          }
        }}
      />
    </>
  );
}

/** « il y a 3 h », « il y a 2 j »… */
function relative(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 30 * 86400) return `il y a ${Math.floor(s / 86400)} j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}

/** Menu d'actions d'une ligne. */
function RowMenu({ user, onToggle, onReset, onDelete }: { user: UserSummary; onToggle: () => void; onReset: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const item = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-sunken [&_svg]:h-4 [&_svg]:w-4";
  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={() => setOpen((o) => !o)} className={btn.icon} aria-label={`Actions pour ${user.email}`} aria-expanded={open}>
        <MoreHorizontal />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-52 animate-fade-in rounded-xl border border-line bg-surface p-1 shadow-pop" role="menu">
          <button type="button" role="menuitem" className={cx(item, "text-ink")} onClick={() => { setOpen(false); onReset(); }}>
            <KeyRound className="text-ink-2" /> Changer le mot de passe
          </button>
          <button type="button" role="menuitem" className={cx(item, "text-ink")} onClick={() => { setOpen(false); onToggle(); }}>
            <Power className="text-ink-2" /> {user.actif ? "Désactiver" : "Réactiver"}
          </button>
          <div className="my-1 h-px bg-line" />
          <button type="button" role="menuitem" className={cx(item, "text-bad-ink")} onClick={() => { setOpen(false); onDelete(); }}>
            <Trash2 /> Supprimer
          </button>
        </div>
      )}
    </div>
  );
}

function ResetPasswordDialog({ user, pending, onClose, onSubmit }: { user: UserSummary | null; pending: boolean; onClose: () => void; onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState("");
  return (
    <Dialog
      open={!!user}
      onClose={() => { setPassword(""); onClose(); }}
      title="Nouveau mot de passe"
      description={user && <>Pour le compte {user.email}. Communiquez-le à son titulaire par un canal sûr.</>}
      footer={
        <>
          <button type="button" onClick={onClose} className={btn.secondary}>Annuler</button>
          <button type="button" disabled={pending || password.length < 8} onClick={() => { onSubmit(password); setPassword(""); }} className={btn.primary}>
            Enregistrer
          </button>
        </>
      }
    >
      <Field id="reset-password" label="Mot de passe" hint="8 caractères minimum, avec lettres et chiffres.">
        <input id="reset-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
      </Field>
    </Dialog>
  );
}

function CreateUserDialog({ open, onClose, freeOperators, onCreated }: { open: boolean; onClose: () => void; freeOperators: OperatorCode[]; onCreated: (email: string) => void }) {
  const [role, setRole] = useState<"operator" | "admin">("operator");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await api("/api/admin/users", {
        method: "POST",
        json: {
          email: form.get("email"),
          nom: form.get("nom"),
          password: form.get("password"),
          role,
          operatorCode: role === "operator" ? form.get("operatorCode") : null,
        },
      });
      formRef.current?.reset();
      onCreated(String(form.get("email")));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPending(false);
    }
  }

  const blocked = role === "operator" && freeOperators.length === 0;
  return (
    <Dialog
      open={open}
      onClose={() => { setError(null); onClose(); }}
      title="Nouveau compte"
      description="Un seul compte par opérateur. Le titulaire pourra se connecter immédiatement."
      footer={
        <>
          <button type="button" onClick={onClose} className={btn.secondary}>Annuler</button>
          <button type="submit" form="create-user" disabled={pending || blocked} className={btn.primary}>
            {pending ? "Création…" : "Créer le compte"}
          </button>
        </>
      }
    >
      <form id="create-user" ref={formRef} onSubmit={onSubmit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Segmented label="Rôle" value={role} onChange={setRole} options={[{ value: "operator", label: "Opérateur" }, { value: "admin", label: "Administrateur" }]} />
        {role === "operator" &&
          (freeOperators.length === 0 ? (
            <Alert tone="info">Chaque opérateur a déjà son compte.</Alert>
          ) : (
            <Field id="operatorCode" label="Opérateur">
              <select id="operatorCode" name="operatorCode" className={input} required>
                {freeOperators.map((c) => <option key={c} value={c}>{OPERATORS.find((o) => o.code === c)!.nom}</option>)}
              </select>
            </Field>
          ))}
        <Field id="nom" label="Nom">
          <input id="nom" name="nom" required minLength={2} className={input} placeholder="Ex. : Direction technique Orange" />
        </Field>
        <Field id="new-email" label="Email">
          <input id="new-email" name="email" type="email" required className={input} />
        </Field>
        <Field id="new-password" label="Mot de passe" hint="8 caractères minimum, avec lettres et chiffres.">
          <input id="new-password" name="password" type="password" required minLength={8} autoComplete="new-password" className={input} />
        </Field>
      </form>
    </Dialog>
  );
}
