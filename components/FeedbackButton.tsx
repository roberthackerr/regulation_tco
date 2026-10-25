"use client";

import { CheckCircle2, MessageSquareHeart, Star } from "lucide-react";
import { useState } from "react";
import { Alert, btn, cx, input, label as labelCls } from "@/components/ui";
import { Dialog } from "@/components/ui-client";
import { OPERATORS, REGIONS, SERVICES, SERVICE_LABELS } from "@/lib/constants";
import { api } from "@/lib/client/api";
import { analyserSentiment } from "@/lib/sentiment";
import { OPERATOR_COLORS } from "@/lib/theme";

const NOTE_LABELS = ["", "Très mauvais", "Mauvais", "Moyen", "Bon", "Excellent"];
const SENT_UI = {
  positif: { emoji: "😊", text: "Plutôt positif", cls: "text-good-ink bg-good-soft" },
  neutre: { emoji: "😐", text: "Plutôt neutre", cls: "text-ink-2 bg-sunken" },
  negatif: { emoji: "😠", text: "Plutôt négatif", cls: "text-bad-ink bg-bad-soft" },
};

/** Bouton « Donner mon avis » + formulaire public (sans compte), avec analyse de sentiment en direct. */
export function FeedbackButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [op, setOp] = useState<string>("YAS");
  const [region, setRegion] = useState<string>("Analamanga");
  const [service, setService] = useState<string>("data");
  const [note, setNote] = useState(0);
  const [hover, setHover] = useState(0);
  const [texte, setTexte] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const live = texte.trim().length >= 5 ? analyserSentiment(texte) : null;

  const reset = () => {
    setOpen(false);
    setTimeout(() => {
      setDone(false);
      setNote(0);
      setTexte("");
      setError(null);
    }, 200);
  };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!note) return setError("Choisissez une note de 1 à 5 étoiles.");
    setPending(true);
    setError(null);
    try {
      const site = (new FormData(e.currentTarget).get("site") as string) ?? "";
      await api("/api/public/feedback", { method: "POST", json: { operateur: op, region, service, note, commentaire: texte, site } });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" className={cx(btn.secondary, className)} onClick={() => setOpen(true)}>
        <MessageSquareHeart /> Donner mon avis
      </button>
      <Dialog open={open} onClose={reset} title={done ? "Merci pour votre avis !" : "Donner mon avis"} description={done ? undefined : "Anonyme, sans compte. Votre avis aide l'autorité à suivre la qualité de service."}>
        {done ? (
          <div className="flex flex-col items-center py-4 text-center">
            <CheckCircle2 className="h-12 w-12 animate-slide-up text-good" aria-hidden />
            <p className="mt-3 text-sm text-ink-2">Il est transmis à l&apos;autorité de régulation et à l&apos;opérateur concerné.</p>
            <button type="button" className={cx(btn.primary, "mt-5")} onClick={reset}>Fermer</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <span className={labelCls}>Opérateur</span>
              <div className="grid grid-cols-3 gap-2">
                {OPERATORS.map((o) => (
                  <button
                    key={o.code}
                    type="button"
                    onClick={() => setOp(o.code)}
                    aria-pressed={op === o.code}
                    className={cx(
                      "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[13px] font-medium transition",
                      op === o.code ? "border-brand bg-brand-soft text-ink" : "border-line-strong/70 text-ink-2 hover:bg-sunken",
                    )}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: OPERATOR_COLORS[o.code] }} aria-hidden />
                    {o.code === "YAS" ? "Yas" : o.code === "ORANGE" ? "Orange" : "Airtel"}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="fb-region" className={labelCls}>Région</label>
                <select id="fb-region" className={input} value={region} onChange={(e) => setRegion(e.target.value)}>
                  {REGIONS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="fb-service" className={labelCls}>Service</label>
                <select id="fb-service" className={input} value={service} onChange={(e) => setService(e.target.value)}>
                  {SERVICES.map((s) => <option key={s} value={s}>{SERVICE_LABELS[s]}</option>)}
                </select>
              </div>
            </div>
            <div>
              <span className={labelCls}>Note</span>
              <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" aria-label={`${n} étoile${n > 1 ? "s" : ""}`} onMouseEnter={() => setHover(n)} onClick={() => setNote(n)} className="p-0.5 transition-transform hover:scale-110">
                    <Star className={cx("h-7 w-7", (hover || note) >= n ? "fill-warn text-warn" : "text-line-strong")} />
                  </button>
                ))}
                <span className="ml-2 text-[13px] text-muted">{NOTE_LABELS[hover || note]}</span>
              </div>
            </div>
            <div>
              <label htmlFor="fb-text" className={labelCls}>Votre commentaire (français ou malagasy)</label>
              <textarea id="fb-text" className={cx(input, "min-h-24 resize-y")} maxLength={1000} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Ex. : Tapaka foana ny connexion eto Toamasina…" />
              <div className="mt-1.5 flex min-h-6 items-center justify-between gap-2 text-xs text-muted">
                {live ? (
                  <span className={cx("inline-flex animate-fade-in items-center gap-1 rounded-full px-2 py-0.5 font-medium", SENT_UI[live.label].cls)}>
                    {SENT_UI[live.label].emoji} IA : {SENT_UI[live.label].text}
                  </span>
                ) : <span />}
                <span>{texte.length}/1000</span>
              </div>
            </div>
            <input type="text" name="site" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
            {error && <Alert>{error}</Alert>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className={btn.secondary} onClick={reset}>Annuler</button>
              <button type="submit" className={btn.primary} disabled={pending}>{pending ? "Envoi…" : "Envoyer mon avis"}</button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
