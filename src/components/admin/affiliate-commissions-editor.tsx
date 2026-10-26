"use client";

import { useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { loadEventAffiliateCommissions, saveEventAffiliateCommissions } from "@/app/api/admin/affiliati/commission-actions";
import { parseAffiliateCommissionEuro, type AffiliateCommissionRates } from "@/lib/events/affiliate-commissions";
import type { EventAffiliate } from "@/lib/events/affiliates";

const moneyInput = (cents: number) => (cents / 100).toLocaleString("it-IT", { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 });
const drafts = (affiliates: EventAffiliate[], rates: AffiliateCommissionRates) => Object.fromEntries(affiliates.map((affiliate) => [affiliate.id, moneyInput(rates[affiliate.id] ?? 0)]));

export function AffiliateCommissionsEditor({ eventId, affiliates, initialRates, loadError }: { eventId: string; affiliates: EventAffiliate[]; initialRates: AffiliateCommissionRates | null; loadError?: string }) {
  const id = useId();
  const router = useRouter();
  const busy = useRef(false);
  const [pending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState(initialRates !== null);
  const [draft, setDraft] = useState(() => initialRates ? drafts(affiliates, initialRates) : {});
  const [invalidId, setInvalidId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ success: boolean; text: string } | null>(loadError ? { success: false, text: loadError } : null);
  const reload = () => {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      try {
        const result = await loadEventAffiliateCommissions(eventId);
        if (!result.success) { setMessage({ success: false, text: result.error }); return; }
        setDraft(drafts(affiliates, result.rates)); setLoaded(true); setMessage(null);
      } catch { setMessage({ success: false, text: "Connessione interrotta. Impossibile caricare i compensi: riprova." }); }
      finally { busy.current = false; }
    });
  };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy.current || !loaded) return;
    const rates: AffiliateCommissionRates = {};
    for (const affiliate of affiliates) {
      const cents = parseAffiliateCommissionEuro(draft[affiliate.id] ?? "");
      if (cents === null) { setInvalidId(affiliate.id); setMessage({ success: false, text: `Controlla il compenso di ${affiliate.name}: usa un importo da 0 a 100.000 €, con al massimo due decimali (es. 5,00).` }); return; }
      rates[affiliate.id] = cents;
    }
    setInvalidId(null); setMessage(null); busy.current = true;
    startTransition(async () => {
      try {
        const result = await saveEventAffiliateCommissions(eventId, rates);
        if (!result.success) { setMessage({ success: false, text: result.error }); return; }
        setDraft(drafts(affiliates, rates));
        setMessage({ success: true, text: "Compensi salvati. Il totale maturato viene ricalcolato sugli iscritti validi dell’evento." });
        router.refresh();
      } catch { setMessage({ success: false, text: "Salvataggio non confermato. Controlla la connessione e riprova." }); }
      finally { busy.current = false; }
    });
  };
  return <section id="compensi-affiliati" aria-labelledby={`${id}-title`} className="min-w-0 scroll-mt-24 space-y-4 rounded-2xl border border-[#dce2d5] bg-white p-5 sm:p-6">
    <div><h2 id={`${id}-title`} className="text-xl font-bold text-[#263f2e]">Compensi degli affiliati</h2><p className="mt-2 text-sm leading-6 text-[#5f6c55]">Imposta quanto riconoscere a ogni affiliato per ciascun iscritto valido di questo evento. Ogni persona conta una volta, anche se acquista workshop e masterclass o aggiunge attività in seguito.</p></div>
    <p className="text-xs leading-5 text-[#5f6c55]">La modifica si applica anche agli iscritti validi già presenti. Gli iscritti annullati o senza più accessi validi non maturano il compenso; gli acquisti diretti non sono attribuiti ad alcun affiliato. Salva prima l’evento se hai aggiunto nuovi affiliati.</p>
    {message && <p role={message.success ? "status" : "alert"} className={`rounded-xl p-3 text-sm leading-6 ${message.success ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{message.text}</p>}
    {!loaded ? <div className="space-y-3"><p className="text-sm text-[#5f6c55]">Compensi non disponibili. Carica i valori salvati prima di modificarli.</p><button type="button" disabled={pending} onClick={reload} className="min-h-11 rounded-xl border border-[#dce2d5] px-4 text-sm font-semibold text-[#36523e] disabled:opacity-60">{pending ? "Caricamento…" : "Ricarica compensi"}</button></div> : affiliates.length ? <form onSubmit={save} noValidate aria-busy={pending} className="space-y-4"><div className="space-y-3">{affiliates.map((affiliate, index) => <div key={affiliate.id} className="grid min-w-0 gap-3 rounded-xl border border-[#e3e8dc] p-4 sm:grid-cols-[minmax(0,1fr)_minmax(180px,240px)] sm:items-center"><div className="min-w-0"><h3 className="break-words text-sm font-semibold text-[#36523e]">{affiliate.name}</h3>{!affiliate.active && <p className="mt-1 text-xs text-[#5f6c55]">Disattivato per nuovi acquisti · gli iscritti validi restano conteggiati</p>}</div><div className="min-w-0 space-y-1.5"><label htmlFor={`${id}-rate-${index}`} className="block text-xs font-semibold text-[#53654b]">Compenso per iscritto (€)<span className="sr-only"> · {affiliate.name}</span></label><input id={`${id}-rate-${index}`} inputMode="decimal" lang="it-IT" autoComplete="off" maxLength={12} disabled={pending} value={draft[affiliate.id] ?? ""} aria-invalid={invalidId === affiliate.id} onChange={(event) => { setDraft((current) => ({ ...current, [affiliate.id]: event.target.value })); if (invalidId === affiliate.id) setInvalidId(null); }} className="min-h-11 w-full min-w-0 rounded-xl border border-[#dce2d5] bg-white px-3 text-sm text-[#24382c] disabled:opacity-60" /></div></div>)}</div><div className="flex flex-wrap items-center gap-3"><button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-[#263f2e] px-5 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Salvataggio…" : "Salva compensi"}</button><p className="text-xs text-[#5f6c55]">0,00 € significa nessun compenso per iscritto.</p></div></form> : <p className="rounded-xl bg-[#f5f7f1] p-4 text-sm text-[#5f6c55]">Aggiungi e salva almeno un affiliato nell’evento per impostarne il compenso.</p>}
  </section>;
}
