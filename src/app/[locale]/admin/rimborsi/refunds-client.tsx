"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/routing";
import { CustomSelect } from "@/components/ui/custom-select";
import {
  parseRefundAmount, refundableRight, refundAmountText, refundDate, refundMoney, refundStateLabels,
} from "./refund-view";
import type { RefundPanel, RefundPayment, RefundCancellation } from "@/lib/refunds/types";

const inputClass = "min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-offset-2 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-60";
const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-offset-2 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";
const primaryClass = `${buttonClass} border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700`;
const dangerClass = `${buttonClass} border-rose-700 bg-rose-700 text-white hover:bg-rose-800`;

async function adminRequest(url: string, body: object): Promise<Record<string, unknown>> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(typeof result.error === "string" ? result.error : "Operazione non completata. Ricarica i dati prima di riprovare.");
  return result;
}

async function loadPanel(eventId: string): Promise<RefundPanel> {
  const response = await fetch(`/api/admin/refunds${eventId ? `?eventId=${encodeURIComponent(eventId)}` : ""}`, { cache: "no-store" });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(typeof result.error === "string" ? result.error : "Impossibile caricare i rimborsi.");
  return result;
}

function RefundForm({ payment: latestPayment, canceled, onClose, onComplete, onResult }: {
  payment: RefundPayment; canceled: boolean; onClose: () => void; onComplete: () => Promise<void>; onResult: (message: string) => void;
}) {
  // A background status refresh must not change the amount or rights already being reviewed.
  const [payment] = useState(latestPayment);
  const [requestId] = useState(() => crypto.randomUUID());
  const [mode, setMode] = useState("full");
  const [amount, setAmount] = useState(refundAmountText(payment.availableCents));
  const [reason, setReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmUsed, setConfirmUsed] = useState(false);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const rights = payment.participants.flatMap(person => person.entitlements.filter(right => refundableRight(right.status)).map(right => ({ ...right, participant: person.name })));
  const fullMode = mode === "full";
  const cents = fullMode ? payment.availableCents : parseRefundAmount(amount);
  // Refunding the entire balance is a full refund even if typed in the partial field.
  const full = cents === payment.availableCents;
  const revokeIds = full || canceled ? rights.map(right => right.id) : selectedIds;
  const revoked = rights.filter(right => revokeIds.includes(right.id));
  const used = (payment.kind === "legacy" ? rights : revoked).some(right => right.status === "used");
  const valid = cents !== null && cents > 0 && cents <= payment.availableCents && reason.trim().length >= 3 && (!used || confirmUsed);
  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review]);

  const submit = async () => {
    if (busy || !review || !valid) return;
    setBusy(true); setError(""); setAttempted(true);
    try {
      const result = await adminRequest("/api/admin/refunds", {
        requestId, ...(payment.kind === "commerce" ? { orderId: payment.id } : { ticketReservationId: payment.id }),
        amountCents: cents, expectedAvailableCents: payment.availableCents, reason: reason.trim(), entitlementIds: payment.kind === "commerce" ? revokeIds : [], confirm: true, confirmUsed,
      });
      const status = result.refund && typeof result.refund === "object" && "status" in result.refund ? String(result.refund.status) : "unknown";
      await onComplete();
      onResult(status === "succeeded" ? "Stripe ha confermato il rimborso. Consulta lo storico per lo stato dell’email." : ["failed", "canceled"].includes(status) ? "Stripe non ha completato il rimborso. Controlla lo storico prima di preparare un nuovo tentativo." : "Richiesta registrata. Il rimborso è ancora in attesa di conferma: puoi verificarne l’esito nello storico.");
      onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Impossibile verificare il rimborso. Ricarica lo storico prima di riprovare."); }
    finally { setBusy(false); }
  };

  return <section aria-label={`Nuovo rimborso per ${payment.buyerEmail}`} className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 sm:p-5">
    {review ? <>
      <h3 ref={reviewHeading} tabIndex={-1} className="text-base font-semibold text-slate-900 outline-none">Conferma il rimborso</h3>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Importo da rimborsare</dt><dd className="mt-1 text-xl font-bold text-slate-900">{refundMoney(cents || 0)}</dd></div><div><dt className="text-slate-500">Acquirente</dt><dd className="mt-1 break-all font-medium text-slate-900">{payment.buyerEmail}</dd></div><div className="sm:col-span-2"><dt className="text-slate-500">Motivo</dt><dd className="mt-1 whitespace-pre-wrap break-words text-slate-900">{reason.trim()}</dd></div></dl>
      <p className="mt-4 text-sm leading-6 text-slate-700">Il denaro verrà restituito con Stripe al metodo di pagamento originale. L’email di conferma partirà quando Stripe confermerà il rimborso.</p>
      {payment.kind === "legacy" ? <p className="mt-2 text-sm font-medium text-slate-800">{canceled ? "Il biglietto e il QR sono sospesi perché l’evento è annullato." : full ? "Il biglietto e il QR verranno revocati." : "Il biglietto rimane valido: questo rimborso parziale non revoca l’ingresso."}</p> : <div className="mt-3 text-sm leading-6 text-slate-800">{revoked.length ? <><p className="font-semibold">Accessi da revocare dopo la conferma Stripe:</p><ul className="mt-1 list-disc space-y-1 pl-5">{revoked.map(right => <li key={right.id}>{right.participant} · {right.name}{right.status === "used" ? " · check-in già registrato" : ""}</li>)}</ul></> : !canceled && <p className="font-medium">Gli accessi rimangono validi. Stai rimborsando solo una parte dell’importo.</p>}</div>}
      {canceled && <p className="mt-3 text-sm text-rose-800">L’evento è annullato: gli accessi sono già sospesi.</p>}
    </> : <>
      <h3 className="text-base font-semibold text-slate-900">Prepara il rimborso</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><div className="space-y-2"><label htmlFor={`refund-mode-${payment.id}`} className="block text-sm font-semibold text-slate-700">Tipo di rimborso</label><CustomSelect id={`refund-mode-${payment.id}`} value={mode} disabled={busy || attempted} onChange={event => { setMode(event.target.value); setConfirmUsed(false); }} className={inputClass}><option value="full">Intero importo ancora rimborsabile</option><option value="partial">Importo parziale</option></CustomSelect></div><div className="space-y-2"><label htmlFor={`refund-amount-${payment.id}`} className="block text-sm font-semibold text-slate-700">Importo (€)</label><input id={`refund-amount-${payment.id}`} type="text" inputMode="decimal" autoComplete="off" value={fullMode ? refundAmountText(payment.availableCents) : amount} readOnly={fullMode} disabled={busy || attempted} onChange={event => setAmount(event.target.value)} className={inputClass} aria-describedby={`refund-available-${payment.id}`} /><p id={`refund-available-${payment.id}`} className="text-xs text-slate-500">Massimo {refundMoney(payment.availableCents)} · formato 25,00</p></div></div>
      {!full && payment.kind === "commerce" && !canceled && <fieldset className="mt-4 space-y-2"><legend className="mb-2 text-sm font-semibold text-slate-700">Quali accessi vuoi revocare?</legend><p className="pb-1 text-xs leading-5 text-slate-500">Lascia tutto deselezionato per mantenere validi i biglietti. Seleziona solo le attività che il cliente non potrà più utilizzare. L’importo è quello inserito sopra.</p>{rights.map(right => <label key={right.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"><input type="checkbox" checked={selectedIds.includes(right.id)} disabled={busy || attempted} onChange={event => { setSelectedIds(ids => event.target.checked ? [...ids, right.id] : ids.filter(id => id !== right.id)); setConfirmUsed(false); }} className="h-4 w-4 shrink-0 accent-indigo-600" /><span className="break-words">{right.participant} · {right.name}{right.status === "used" && <span className="ml-2 font-medium text-amber-800">Check-in già registrato</span>}</span></label>)}{!rights.length && <p className="text-sm text-slate-500">Nessun accesso attivo per questo pagamento.</p>}</fieldset>}
      {full && <p className="mt-3 text-sm leading-6 text-slate-600">Verrà rimborsato tutto l’importo disponibile e saranno revocati gli accessi acquistati con questo pagamento. {canceled ? "Gli ingressi restano sospesi per l’annullamento dell’evento." : "Le attività pagate con altri ordini restano valide."}</p>}
      {used && <label className="mt-3 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900"><input type="checkbox" checked={confirmUsed} disabled={busy || attempted} onChange={event => setConfirmUsed(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-amber-700" /><span>{payment.kind === "legacy" && !full ? "Confermo il rimborso parziale di un biglietto con check-in già registrato. L’ingresso rimane valido." : "Confermo di voler rimborsare e revocare anche gli accessi con check-in già registrato."}</span></label>}
      <div className="mt-4 space-y-2"><label htmlFor={`refund-reason-${payment.id}`} className="block text-sm font-semibold text-slate-700">Motivo del rimborso</label><textarea id={`refund-reason-${payment.id}`} rows={2} maxLength={1000} value={reason} disabled={busy || attempted} onChange={event => setReason(event.target.value)} className={inputClass} placeholder="Es. rinuncia del partecipante" /><p className="text-xs text-slate-500">Verrà riportato nell’email al cliente. Non inserire note interne o dati sensibili.</p></div>
      {cents !== null && cents > payment.availableCents && <p role="alert" className="mt-2 text-sm text-rose-700">L’importo supera il residuo rimborsabile.</p>}
    </>}
    {error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-800">{error}</p>}
    {attempted && error && <p className="mt-2 text-xs leading-5 text-slate-600">Il tentativo conserva lo stesso identificativo. Riprova questa richiesta senza crearne una nuova, oppure ricarica i dati per verificarne lo stato.</p>}
    <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className={buttonClass}>Chiudi</button>{review ? <><button type="button" disabled={busy || attempted} onClick={() => setReview(false)} className={buttonClass}>Modifica</button><button type="button" disabled={busy || !valid} onClick={submit} className={dangerClass}>{busy ? "Verifica con Stripe…" : `Conferma rimborso di ${refundMoney(cents || 0)}`}</button></> : <button type="button" disabled={!valid || busy} onClick={() => { setReview(true); setError(""); }} className={primaryClass}>Rivedi il rimborso →</button>}</div>
  </section>;
}

function PaymentCard({ payment, canManage, canceled, refresh }: {
  payment: RefundPayment; canManage: boolean; canceled: boolean; refresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [retryId, setRetryId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState("");
  const [resultMessage, setResultMessage] = useState("");
  const retry = async (refundId: string) => {
    if (retryId) return;
    setRetryId(refundId); setRetryError("");
    try { await adminRequest("/api/admin/refunds/retry", { refundId }); await refresh(); }
    catch (failure) { setRetryError(failure instanceof Error ? failure.message : "Impossibile verificare l’esito del rimborso."); }
    finally { setRetryId(null); }
  };
  return <li className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h2 className="break-all font-semibold text-slate-900">{payment.buyerEmail}</h2><p className="mt-1 text-xs text-slate-500">{refundDate(payment.createdAt)} · {payment.kind === "commerce" ? "Formule e attività" : "Ingresso singolo"}</p><p className="mt-1 break-words text-sm text-slate-600">{payment.participants.map(person => person.name).join(", ")}</p></div>{canManage && payment.availableCents > 0 && payment.pendingCents === 0 && !open && <button type="button" onClick={() => setOpen(true)} className={buttonClass}>Prepara rimborso</button>}</div>
    <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-4"><div><dt className="text-xs text-slate-500">Pagato</dt><dd className="mt-1 font-semibold text-slate-900">{refundMoney(payment.amountCents)}</dd></div><div><dt className="text-xs text-slate-500">Rimborsato</dt><dd className="mt-1 font-semibold text-slate-900">{refundMoney(payment.refundedCents)}</dd></div><div><dt className="text-xs text-slate-500">In lavorazione</dt><dd className="mt-1 font-semibold text-amber-800">{refundMoney(payment.pendingCents)}</dd></div><div><dt className="text-xs text-slate-500">Ancora rimborsabile</dt><dd className="mt-1 font-semibold text-slate-900">{refundMoney(payment.availableCents)}</dd></div></dl>
    {payment.pendingCents > 0 && <p className="mt-3 text-sm leading-6 text-amber-800">C’è già un rimborso in lavorazione per questo pagamento. Verifica il tentativo nello storico e attendi il suo esito prima di prepararne un altro.</p>}
    {payment.refunds.length > 0 && <details className="mt-4 border-t border-slate-100 pt-3"><summary className="min-h-8 cursor-pointer text-sm font-semibold text-slate-700">Storico rimborsi ({payment.refunds.length})</summary><ul className="mt-3 divide-y divide-slate-100">{payment.refunds.map(refund => <li key={refund.id} className="py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong className="text-slate-900">{refundMoney(refund.amountCents)}</strong><span className={refund.status === "succeeded" ? "font-medium text-emerald-700" : ["failed", "canceled", "unknown"].includes(refund.status) ? "font-medium text-rose-700" : "font-medium text-amber-800"}>{refundStateLabels[refund.status] || "Da verificare"}</span></div><p className="mt-1 break-words text-slate-600">{refund.reason}</p><p className="mt-1 text-xs text-slate-500">{refundDate(refund.createdAt)}{refund.status === "succeeded" ? refund.emailSentAt ? " · Email inviata" : " · Email di conferma da inviare" : ""}</p>{refund.error && <p className="mt-1 break-words text-xs text-rose-700">{refund.error}</p>}{canManage && ["preparing", "pending", "requires_action", "unknown"].includes(refund.status) && <button type="button" disabled={retryId !== null} onClick={() => void retry(refund.id)} className={`${buttonClass} mt-3`}>{retryId === refund.id ? "Verifica in corso…" : "Verifica / riprendi questo tentativo"}</button>}</li>)}</ul></details>}
    {retryError && <p role="alert" className="mt-3 text-sm text-rose-800">{retryError}</p>}
    {resultMessage && <p role="status" className="mt-3 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">{resultMessage}</p>}
    {open && payment.pendingCents === 0 && <RefundForm key={payment.id} payment={payment} canceled={canceled} onClose={() => setOpen(false)} onComplete={refresh} onResult={setResultMessage} />}
  </li>;
}

function CancellationPanel({ event, cancellation, canManage, refresh }: {
  event: NonNullable<RefundPanel["event"]>; cancellation: RefundCancellation | null;
  canManage: boolean; refresh: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancel = async () => {
    if (busy || confirmation !== event.title || reason.trim().length < 3) return;
    setBusy(true); setError("");
    try { await adminRequest("/api/admin/refunds/cancel-event", { eventId: event.id, reason: reason.trim(), confirmTitle: confirmation, requestId }); await refresh(); setOpen(false); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Annullamento non verificabile. Ricarica i dati prima di riprovare."); }
    finally { setBusy(false); }
  };
  const process = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try { const result = await adminRequest("/api/admin/refunds/process", { eventId: event.id }); await refresh(); if (Array.isArray(result.errors) && result.errors.length) setError(result.errors.join(" · ")); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Elaborazione non completata. Gli importi già confermati non vengono duplicati."); }
    finally { setBusy(false); }
  };
  return <section aria-label="Annullamento evento" className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold text-slate-900">{event.canceledAt ? "Evento annullato" : "Annullamento dell’evento"}</h2>{!event.canceledAt && canManage && !open && <button type="button" onClick={() => setOpen(true)} className={`${buttonClass} border-rose-200 text-rose-800`}>Prepara annullamento</button>}</div>
    {event.canceledAt ? <><p className="mt-2 text-sm leading-6 text-slate-700">Vendite e check-in sono bloccati dal {refundDate(event.canceledAt)}. {event.cancellationReason}</p>{cancellation && <><p role="status" className="mt-3 text-sm font-medium text-slate-800">Stato: {refundStateLabels[cancellation.status] || "In lavorazione"}</p><dl className="mt-3 flex flex-wrap gap-x-6 gap-y-3 text-sm">{[["Pagamenti", cancellation.totalPayments], ["Confermati", cancellation.completed], ["In attesa", cancellation.pending], ["Da elaborare", cancellation.remaining], ["Non riusciti", cancellation.failed], ["Email da inviare", cancellation.emailsRemaining]].map(([label, value]) => typeof value === "number" ? <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-slate-900">{value}</dd></div> : null)}</dl></>}{canManage && <div className="mt-4"><button type="button" onClick={process} disabled={busy} className={buttonClass}>{busy ? "Elaborazione in corso…" : "Elabora rimborsi e invia comunicazioni"}</button><p className="mt-2 text-xs leading-5 text-slate-600">Elaborazione a piccoli gruppi. Puoi riprenderla finché tutti i rimborsi e gli avvisi risultano completati; gli importi già confermati restano registrati.</p></div>}</> : <p className="mt-2 text-sm leading-6 text-slate-600">Se l’evento non si svolgerà, puoi bloccare le vendite e gli ingressi, avvisare gli iscritti e rimborsare gli importi ancora dovuti.</p>}
    {open && !event.canceledAt && <div className="mt-4 space-y-4 border-t border-rose-200 pt-4"><p className="text-sm leading-6 text-rose-900">L’annullamento blocca subito i biglietti e il check-in di tutti gli iscritti. Verrà preparato l’elenco dei rimborsi e degli avvisi: li eseguirai con “Elabora rimborsi e invia comunicazioni” nel passaggio successivo.</p><div className="space-y-2"><label htmlFor="cancel-event-reason" className="block text-sm font-semibold text-slate-700">Motivo da comunicare agli iscritti</label><textarea id="cancel-event-reason" rows={2} maxLength={1000} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} className={inputClass} /></div><div className="space-y-2"><label htmlFor="cancel-event-confirmation" className="block text-sm font-semibold text-slate-700">Per confermare, riscrivi: <span className="break-words">{event.title}</span></label><input id="cancel-event-confirmation" autoComplete="off" value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} className={inputClass} /></div><div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={() => setOpen(false)} className={buttonClass}>Chiudi</button><button type="button" disabled={busy || confirmation !== event.title || reason.trim().length < 3} onClick={cancel} className={dangerClass}>{busy ? "Annullamento in corso…" : "Conferma annullamento dell’evento"}</button></div></div>}
    {error && <p role="alert" className="mt-3 text-sm leading-6 text-rose-800">{error}</p>}
  </section>;
}

export function RefundsClient({ initialEventId, initialPanel }: { initialEventId: string; initialPanel: RefundPanel }) {
  const [eventId, setEventId] = useState(initialEventId);
  const [data, setData] = useState<RefundPanel | null>(initialPanel);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [processing, setProcessing] = useState(false);
  const [processMessage, setProcessMessage] = useState("");
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const result = await loadPanel(eventId);
      if (generation.current === current) { setData(result); setError(""); }
    } catch (failure) { if (generation.current === current) { setError(failure instanceof Error ? failure.message : "Impossibile caricare i rimborsi."); setData(null); } }
    finally { if (generation.current === current) setLoading(false); }
  }, [eventId]);
  const changeEvent = async (next: string) => {
    if (loading || next === eventId) return;
    setLoading(true); setError(""); setSearch(""); setProcessMessage(""); setData(null); setEventId(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("event", next); else url.searchParams.delete("event");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    const current = ++generation.current;
    try { const panel = await loadPanel(next); if (generation.current === current) setData(panel); }
    catch (failure) { if (generation.current === current) setError(failure instanceof Error ? failure.message : "Impossibile caricare i rimborsi."); }
    finally { if (generation.current === current) setLoading(false); }
  };
  const processPending = async () => {
    if (processing || !data?.event) return;
    setProcessing(true); setProcessMessage("");
    try {
      const result = await adminRequest("/api/admin/refunds/process", { eventId: data.event.id });
      await refresh();
      setProcessMessage(Array.isArray(result.errors) && result.errors.length ? result.errors.join(" · ") : "Verifica completata. Consulta lo storico per l’esito dei rimborsi e delle email.");
    } catch (failure) { setProcessMessage(failure instanceof Error ? failure.message : "Verifica non completata. Riprova dopo aver controllato lo storico."); }
    finally { setProcessing(false); }
  };
  const query = search.trim().toLocaleLowerCase("it-IT");
  const payments = (data?.payments || []).filter(payment => `${payment.buyerEmail} ${payment.participants.map(person => person.name).join(" ")}`.toLocaleLowerCase("it-IT").includes(query));
  return <div className="min-w-0 space-y-5"><header><h1 className="text-3xl font-bold tracking-tight text-slate-900">Rimborsi</h1><p className="mt-2 text-sm leading-6 text-slate-500">Gestisci restituzioni totali, parziali e annullamenti. Importi in euro; date e orari italiani.</p></header>
    <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2"><div className="min-w-0 space-y-2"><label htmlFor="refund-event" className="block text-sm font-semibold text-slate-700">Evento</label><CustomSelect id="refund-event" value={eventId || data?.event?.id || ""} disabled={loading || processing} onChange={event => changeEvent(event.target.value)} className={inputClass}><option value="">Seleziona un evento</option>{data?.events.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}</CustomSelect></div><div className="space-y-2"><label htmlFor="refund-search" className="block text-sm font-semibold text-slate-700">Cerca acquirente o partecipante</label><input id="refund-search" type="search" value={search} disabled={loading} onChange={event => setSearch(event.target.value)} className={inputClass} placeholder="Nome o email" /></div></div>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">{error}<button type="button" onClick={refresh} className="ml-3 min-h-11 font-semibold underline underline-offset-4">Riprova</button></div>}
    {loading && <p role="status" className="py-4 text-sm text-slate-500">Caricamento dei pagamenti…</p>}
    {!loading && data && <>{!data.canManage && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Puoi consultare lo storico. Solo gli amministratori possono eseguire rimborsi e annullare eventi.</p>}{data.event ? <>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="break-words text-lg font-semibold text-slate-900">{data.event.title}</h2><Link href={`/admin/biglietti?event=${data.event.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-indigo-600">Iscritti e check-in →</Link></div>
      <section aria-label="Pagamenti e rimborsi" className="space-y-3"><p role="status" className="text-sm text-slate-500">{payments.length} {payments.length === 1 ? "pagamento" : "pagamenti"}{query ? " corrispondenti alla ricerca" : " dell’evento"}</p>{payments.length ? <ul className="space-y-3">{payments.map(payment => <PaymentCard key={payment.id} payment={payment} canManage={data.canManage} canceled={Boolean(data.event?.canceledAt)} refresh={refresh} />)}</ul> : <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">{query ? "Nessun pagamento corrisponde alla ricerca." : "Non ci sono pagamenti rimborsabili per questo evento."}</p>}</section>
      {data.canManage && !data.event.canceledAt && <div className="space-y-2"><button type="button" onClick={processPending} disabled={processing} className={buttonClass}>{processing ? "Verifica in corso…" : "Verifica rimborsi e invia le email in sospeso"}</button><p className="text-xs leading-5 text-slate-500">Riprende i tentativi già autorizzati e l’invio delle conferme. Non prepara nuovi rimborsi.</p></div>}
      {processMessage && <p role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">{processMessage}</p>}
      <CancellationPanel key={data.event.id} event={data.event} cancellation={data.cancellation} canManage={data.canManage} refresh={refresh} />
    </> : <p className="py-4 text-sm text-slate-500">Seleziona un evento per vedere i pagamenti e lo storico dei rimborsi.</p>}</>}
  </div>;
}
