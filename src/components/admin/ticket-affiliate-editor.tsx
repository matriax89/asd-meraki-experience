"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { Pencil, UserPlus } from "lucide-react";
import { assignParticipantAffiliate } from "@/app/api/admin/participants/affiliate-actions";
import { CustomSelect } from "@/components/ui/custom-select";

export type ParticipantAffiliateUpdate = { source: "legacy" | "commerce"; id: string; eventId: string; affiliateId: string | null; affiliateName: string | null };
export type ParticipantAffiliateOption = { id: string; name: string };

export function TicketAffiliateEditor({ source, participantId, eventId, participantName, affiliateId, affiliateName, options, optionsError, disabled, editable = true, onSaved, onPendingChange, onReload }: {
  source: "legacy" | "commerce"; participantId: string; eventId: string; participantName: string;
  affiliateId: string | null; affiliateName: string | null; options: ParticipantAffiliateOption[]; optionsError?: string;
  disabled?: boolean; editable?: boolean; onSaved: (participant: ParticipantAffiliateUpdate) => void; onPendingChange: (pending: boolean) => void; onReload: () => void;
}) {
  const id = useId();
  const busy = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(affiliateId || "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ text: string; conflict: boolean } | null>(null);
  const currentLabel = affiliateId ? affiliateName || options.find(option => option.id === affiliateId)?.name || "Affiliato archiviato" : "Acquisto diretto";
  const currentUnavailable = Boolean(affiliateId && !options.some(option => option.id === affiliateId));
  const unchanged = draft === (affiliateId || "");

  useEffect(() => {
    if (open) document.getElementById(`${id}-select`)?.focus();
    else if (restoreFocus.current && !pending && !disabled) { restoreFocus.current = false; trigger.current?.focus(); }
  }, [open, pending, disabled, id]);

  const close = () => { restoreFocus.current = true; setOpen(false); setError(null); };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy.current || disabled || !editable || unchanged) return;
    if (draft && !options.some(option => option.id === draft)) { setError({ text: "Seleziona un affiliato attivo e abilitato per questo evento.", conflict: false }); return; }
    busy.current = true;
    setError(null);
    onPendingChange(true);
    startTransition(async () => {
      try {
        const result = await assignParticipantAffiliate({ source, id: participantId, eventId, affiliateId: draft || null, expectedAffiliateId: affiliateId });
        if (!result.success) { setError({ text: result.error, conflict: result.code === "conflict" }); return; }
        onSaved(result.participant);
        close();
      } catch { setError({ text: "Connessione interrotta. La modifica non è confermata: i dati selezionati sono ancora qui.", conflict: false }); }
      finally { busy.current = false; onPendingChange(false); }
    });
  };

  return <div className="min-w-48 max-w-72 space-y-2">
    <p className={`break-words text-sm ${affiliateId ? "font-semibold text-[#52604f]" : "text-slate-500"}`}>{currentLabel}</p>
    {currentUnavailable && <p className="text-[11px] leading-4 text-slate-500">Affiliato non disponibile per nuove assegnazioni</p>}
    {editable && <button ref={trigger} type="button" disabled={disabled || pending} aria-expanded={open} aria-controls={`${id}-panel`} aria-label={`${affiliateId ? "Modifica affiliato" : "Assegna affiliato"} per ${participantName}`} onClick={() => { setDraft(affiliateId || ""); setError(null); setOpen(true); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[#43613b] hover:bg-[#eff4e9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8d7750] disabled:opacity-50">{affiliateId ? <Pencil size={13} aria-hidden="true" /> : <UserPlus size={14} aria-hidden="true" />}{affiliateId ? "Modifica affiliato" : "Assegna affiliato"}</button>}
    {open && editable && <form id={`${id}-panel`} aria-label={`Affiliato di ${participantName}`} aria-busy={pending} onSubmit={save} className="space-y-3 rounded-xl border border-[#d9e1d0] bg-[#f7f9f3] p-3">
      <div className="space-y-1.5"><label htmlFor={`${id}-select`} className="block text-xs font-semibold text-[#4b6041]">Affiliato per {participantName}</label><CustomSelect id={`${id}-select`} aria-label={`Affiliato per ${participantName}`} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} value={draft} onChange={event => { setDraft(event.target.value); setError(null); }} disabled={disabled || pending} className="min-h-11 w-full min-w-0 rounded-xl border border-[#d4ddca] bg-white px-3 text-xs text-[#344d38]"><option value="">Acquisto diretto · nessun affiliato</option>{currentUnavailable && <option value={affiliateId!} disabled>{currentLabel} · attuale, non disponibile</option>}{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</CustomSelect></div>
      <p id={`${id}-hint`} className="text-xs leading-5 text-[#6b7a5e]">La modifica riguarda soltanto questo partecipante e aggiorna i conteggi e il compenso dell’affiliato.</p>
      {optionsError && <div className="space-y-1 text-xs leading-5 text-amber-900"><p>{optionsError}</p><button type="button" disabled={pending} onClick={() => { close(); onReload(); }} className="min-h-10 font-semibold underline underline-offset-4">Ricarica affiliati</button></div>}
      {!options.length && !optionsError && <p className="text-xs leading-5 text-[#6b7a5e]">Nessun affiliato attivo è abilitato per questo evento. Abilitalo dalla gestione dell’evento.</p>}
      {!unchanged && <p className="rounded-lg bg-white px-2.5 py-2 text-xs leading-5 text-[#4b6041]">Da <strong>{currentLabel}</strong> a <strong>{draft ? options.find(option => option.id === draft)?.name : "Acquisto diretto"}</strong>. Conferma per salvare.</p>}
      {error && <div className="space-y-1"><p id={`${id}-error`} role="alert" className="text-xs leading-5 text-rose-800">{error.text}</p>{error.conflict && <button type="button" disabled={pending} onClick={() => { close(); onReload(); }} className="min-h-10 text-xs font-semibold text-[#43613b] underline underline-offset-4">Ricarica elenco iscritti</button>}</div>}
      <div className="flex flex-wrap gap-2"><button type="button" disabled={pending} onClick={close} className="min-h-10 rounded-lg border border-[#d6dfcc] bg-white px-3 text-xs font-semibold text-[#5e7050] disabled:opacity-50">Annulla</button><button type="submit" disabled={disabled || pending || unchanged} className="min-h-10 rounded-lg bg-[#254332] px-3 text-xs font-semibold text-white disabled:opacity-50">{pending ? "Salvataggio…" : "Salva affiliato"}</button></div>
    </form>}
  </div>;
}
