"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "@/i18n/routing";
import { CustomSelect } from "@/components/ui/custom-select";
import { DateTimeField } from "./date-time-field";
import { EuroInput } from "./euro-input";
import { CheckoutContactFields, emptyCheckoutContact, type CheckoutContact } from "@/components/meraki/checkout-contact-fields";
import { checkoutFieldError, type CheckoutFieldError } from "@/components/meraki/checkout-copy";
import { TicketPolicyNotice } from "@/components/meraki/ticket-policy-notice";
import { attendeesSchema } from "@/lib/commerce/attendee";
import { fromRomeInput, toRomeInput } from "@/lib/commerce/rome-time";
import type { CommerceConfig, CommerceParticipant, CommerceQuote } from "@/lib/commerce/types";
import type { ManualEnrollmentResult } from "@/lib/commerce/manual-schema";

type Context = {
  event: { id: string; title: string; startsAt: string }; config: CommerceConfig;
  affiliates: { id: string; name: string }[];
  upgrade?: { id: string; firstName: string; lastName: string; buyerEmail: string; packageId: string; packageActivityIds: string[]; packagePaidCents: number; ownedActivityIds: string[]; menuChoices: Record<string, string> };
};
type Person = CommerceParticipant & { contact: CheckoutContact; key: string };
type Attempt = Record<string, unknown>;
const field = "mt-1 min-h-12 w-full min-w-0 rounded-xl border border-[#d9ddcf] bg-white px-3 text-sm text-[#24382c] disabled:bg-[#f4f5ef]";
const card = "space-y-5 rounded-[1.8rem] border border-[#dce2d5] bg-white p-5 sm:p-7";
const button = "inline-flex min-h-12 items-center justify-center rounded-xl bg-[#234331] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50";
const euro = (cents: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);

function chosenActivities(person: CommerceParticipant, config: CommerceConfig) {
  return new Set([...(config.packages.find(pkg => pkg.id === person.packageId)?.activityIds || []), ...config.addons.filter(addon => person.addonIds.includes(addon.id)).map(addon => addon.activityId)]);
}
function normalizeSelection(person: Person, config: CommerceConfig): Person {
  const included = config.packages.find(pkg => pkg.id === person.packageId)?.activityIds || [];
  const next = { ...person, addonIds: person.addonIds.filter(id => !included.includes(config.addons.find(addon => addon.id === id)?.activityId || "")) };
  const selected = chosenActivities(next, config);
  return { ...next, menuChoices: Object.fromEntries(config.activities.filter(activity => selected.has(activity.id) && activity.menuOptions.length).map(activity => [activity.id, activity.menuOptions.includes(person.menuChoices[activity.id]) ? person.menuChoices[activity.id] : activity.menuOptions.length === 1 ? activity.menuOptions[0] : ""])) };
}
function newPerson(context: Context, locale: string): Person {
  return normalizeSelection({ key: crypto.randomUUID(), firstName: context.upgrade?.firstName || "", lastName: context.upgrade?.lastName || "", packageId: context.upgrade?.packageId || context.config.packages[0]?.id || "", addonIds: [], menuChoices: context.upgrade?.menuChoices || {}, contact: emptyCheckoutContact(locale) }, context.config);
}

export function ManualEnrollmentClient({ eventId, upgradePassId, locale }: { eventId: string; upgradePassId?: string; locale: string }) {
  const [context, setContext] = useState<Context | null>(null);
  const [loadError, setLoadError] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [affiliateId, setAffiliateId] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const [quoteState, setQuoteState] = useState<{ key: string; quote?: CommerceQuote; error?: string }>({ key: "" });
  const [refreshQuote, setRefreshQuote] = useState(0);
  const [method, setMethod] = useState<"cash" | "pos">("cash");
  const [paidAt, setPaidAt] = useState(() => toRomeInput(new Date().toISOString()));
  const [knownFee, setKnownFee] = useState(false);
  const [feeCents, setFeeCents] = useState(0);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [validation, setValidation] = useState<CheckoutFieldError | null>(null);
  const [result, setResult] = useState<ManualEnrollmentResult | null>(null);
  const [emailMessage, setEmailMessage] = useState("");
  const locked = busy || uncertain;

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ event: eventId, locale, ...(upgradePassId ? { upgradePass: upgradePassId } : {}) });
    fetch(`/api/admin/manual-enrollments/context?${params}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Impossibile caricare l’evento.");
      if (!controller.signal.aborted) { setContext(data); setPeople([newPerson(data, locale)]); }
    }).catch(error => { if (!controller.signal.aborted) setLoadError(error.message || "Impossibile caricare l’evento."); });
    return () => controller.abort();
  }, [eventId, upgradePassId, locale]);

  // Quotes contain selections only; contact and identity documents never enter this request.
  const selectionKey = JSON.stringify(people.map(person => ({ firstName: "Partecipante", lastName: "Meraki", packageId: person.packageId, addonIds: person.addonIds, menuChoices: person.menuChoices })));
  const quoteKey = JSON.stringify([selectionKey, eventId, upgradePassId, affiliateId, discountCode, refreshQuote]);
  const quote = quoteState.key === quoteKey ? quoteState.quote || null : null;
  const quoteError = quoteState.key === quoteKey ? quoteState.error || "" : "";
  const quoting = Boolean(context && !quote && !quoteError);
  useEffect(() => {
    if (!context || result || uncertain) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/admin/manual-enrollments/quote", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({ eventId, participants: JSON.parse(selectionKey), ...(upgradePassId ? { upgradePassId } : { affiliateId: affiliateId || null }), ...(discountCode.trim() ? { discountCode: discountCode.trim() } : {}) }) });
        const data = await response.json();
        if (!response.ok || !data.quote) throw new Error(data.error || "Controlla formula, aggiunte e menù.");
        if (!controller.signal.aborted) setQuoteState({ key: quoteKey, quote: data.quote });
      } catch (error) { if (!controller.signal.aborted) setQuoteState({ key: quoteKey, error: error instanceof Error ? error.message : "Impossibile aggiornare l’importo." }); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [context, selectionKey, quoteKey, eventId, upgradePassId, affiliateId, discountCode, result, uncertain]);

  const update = (index: number, changes: Partial<Person>) => {
    setPeople(current => current.map((person, i) => i === index && context ? normalizeSelection({ ...person, ...changes }, context.config) : person));
    setValidation(null); setError(""); setConfirmed(false);
  };
  const sendAttempt = async (body: Attempt) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/manual-enrollments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status >= 500) throw new Error("La risposta non è arrivata completa.");
        attempt.current = null; setUncertain(false); setConfirmed(false);
        setError(data.error || "Registrazione non completata. Controlla i dati.");
        if (response.status === 409) setRefreshQuote(value => value + 1);
        return;
      }
      if (!data.orderId || !Array.isArray(data.passIds)) throw new Error("Risposta incompleta.");
      setResult(data); attempt.current = null; setUncertain(false);
    } catch {
      setUncertain(true);
      setError("La conferma non è arrivata. Riprova la stessa registrazione: il sistema verifica l’esito senza creare un secondo pagamento o biglietto. Mantieni aperta questa pagina.");
    } finally { inFlight.current = false; setBusy(false); }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || uncertain || !context || !quote || quoting || !confirmed || result) return;
    setValidation(null); setError("");
    const participants = people.map(({ firstName, lastName, packageId, addonIds, menuChoices }) => ({ firstName: firstName.trim(), lastName: lastName.trim(), packageId, addonIds, menuChoices }));
    const parsed = context.upgrade ? null : attendeesSchema.safeParse(people.map((person, index) => ({ ...person.contact, firstName: participants[index].firstName, lastName: participants[index].lastName, marketingConsent: false })));
    if (parsed && !parsed.success) { const invalid = checkoutFieldError(parsed.error.issues, locale); setValidation(invalid); setError(`Partecipante ${invalid.participantIndex + 1}: ${invalid.message}`); return; }
    try {
      const paid = fromRomeInput(paidAt);
      if (!paid || Date.parse(paid) > Date.now() + 300000) throw new Error("Inserisci la data e l’ora del pagamento già ricevuto.");
      if (method === "pos" && knownFee && feeCents > quote.totalCents) throw new Error("La commissione POS supera l’importo incassato.");
      const body = { requestId: crypto.randomUUID(), eventId, locale, participants,
        buyerEmail: context.upgrade?.buyerEmail || (parsed?.success ? parsed.data[0].email : ""),
        ...(context.upgrade ? { upgradePassId } : { attendees: parsed?.success ? parsed.data : [], affiliateId: affiliateId || null }),
        ...(discountCode.trim() ? { discountCode: discountCode.trim() } : {}), expectedTotalCents: quote.totalCents,
        paymentMethod: method, paidAt: paid, paymentReference: reference.trim(), feeCents: method === "cash" ? 0 : knownFee ? feeCents : null, note: note.trim(), confirm: true };
      attempt.current = body; void sendAttempt(body);
    } catch (error) { setError(error instanceof Error ? error.message : "Controlla i dati del pagamento."); }
  };
  const resend = async () => {
    if (!result || inFlight.current) return;
    inFlight.current = true; setBusy(true); setEmailMessage("");
    try {
      const response = await fetch(`/api/admin/manual-enrollments/${result.orderId}/email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await response.json();
      if (!response.ok) throw new Error();
      setResult({ ...result, emailStatus: data.emailStatus });
      if (data.emailStatus !== "sent") setEmailMessage("Invio ancora in attesa. Il biglietto è già stato creato; puoi riprovare l’invio più tardi.");
    } catch { setEmailMessage("Impossibile verificare l’invio. Il pagamento e il biglietto sono già registrati."); }
    finally { inFlight.current = false; setBusy(false); }
  };

  if (loadError) return <div className={card}><p role="alert">{loadError}</p><Link href="/admin/biglietti/nuovo">Scegli un altro evento →</Link></div>;
  if (!context) return <p role="status" className={card}>Caricamento dell’evento…</p>;
  if (result) return <section className={card} aria-labelledby="manual-result"><h1 id="manual-result" className="text-2xl font-semibold">{context.upgrade ? "Biglietto aggiornato" : "Iscrizione registrata"}</h1><p>Pagamento ricevuto in {method === "cash" ? "contanti" : "POS"}: <strong>{euro(quote?.totalCents || 0)}</strong>. {context.upgrade ? "Il partecipante mantiene il suo biglietto e QR." : `${result.passIds.length} ${result.passIds.length === 1 ? "biglietto nominale creato" : "biglietti nominali creati"}.`}</p><p role="status">{result.emailStatus === "sent" ? "Email di conferma inviata ai partecipanti." : "Email di conferma in attesa. Il pagamento e i biglietti sono registrati."}</p>{result.emailStatus !== "sent" && <button type="button" className={button} disabled={busy} onClick={resend}>{busy ? "Invio…" : "Riprova invio email"}</button>}{emailMessage && <p role="status">{emailMessage}</p>}<div className="flex flex-wrap gap-5"><Link href={`/admin/biglietti?event=${eventId}`} className="font-semibold text-[#36533e]">Vai all’elenco iscritti →</Link><a href={`/${locale}/admin/biglietti/nuovo?event=${eventId}`} className="font-semibold text-[#36533e]">Nuova iscrizione →</a></div></section>;
  return <div className="min-w-0 space-y-6 text-[#24382c]">
    <header className="space-y-3"><Link href={`/admin/biglietti?event=${eventId}`} className="text-sm font-semibold text-[#63715b]">← Iscritti e check-in</Link><h1 className="text-3xl font-semibold">{context.upgrade ? "Aggiungi attività al biglietto" : "Iscrivi partecipante"}</h1><p className="font-semibold">{context.event.title}</p><p className="text-sm leading-6 text-[#63715b]">{context.upgrade ? "Registra la differenza già ricevuta in contanti o tramite POS. Persona, affiliato e QR restano collegati al biglietto esistente." : "Registra un incasso già ricevuto in contanti o tramite POS. Ogni persona riceverà il proprio biglietto nominale via email."}</p><Link href="/admin/biglietti/nuovo" className="inline-block text-sm font-semibold underline">Cambia evento</Link></header>
    <form onSubmit={submit} className="space-y-6">
      <fieldset disabled={locked} className={`${card} min-w-0`}><legend className="sr-only">Partecipanti e formule</legend><h2 className="text-xl font-semibold">1. Partecipanti e formule</h2>
        {!context.upgrade && <label className="block max-w-64 text-sm font-semibold">Numero di partecipanti<CustomSelect aria-label="Numero di partecipanti" className={field} value={String(people.length)} onChange={event => { const quantity = Number(event.target.value); setPeople(current => Array.from({ length: quantity }, (_, index) => current[index] || newPerson(context, locale))); setConfirmed(false); }}>{Array.from({ length: 10 }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}</CustomSelect></label>}
        {people.map((person, index) => {
          const activities = chosenActivities(person, context.config);
          const packages = context.config.packages.filter(pkg => !context.upgrade || context.upgrade.packageActivityIds.every(id => pkg.activityIds.includes(id)));
          const addons = context.config.addons.filter(addon => !activities.has(addon.activityId) || person.addonIds.includes(addon.id)).filter(addon => !context.upgrade?.ownedActivityIds.includes(addon.activityId));
          return <section key={person.key} className="min-w-0 space-y-5 rounded-2xl border border-[#e2e6da] p-4 sm:p-5" aria-labelledby={`manual-person-${index}`}><h3 id={`manual-person-${index}`} className="font-semibold">{context.upgrade ? `${person.firstName} ${person.lastName}` : `Partecipante ${index + 1}`}</h3>
            {!context.upgrade && <div className="grid gap-4 sm:grid-cols-2">{(["firstName", "lastName"] as const).map(name => <label key={name} className="text-sm font-semibold">{name === "firstName" ? "Nome" : "Cognome"}<input id={`manual-${index}-${name}`} className={field} required maxLength={100} value={person[name]} autoComplete={name === "firstName" ? "given-name" : "family-name"} onChange={event => update(index, { [name]: event.target.value })} aria-invalid={validation?.participantIndex === index && validation.field === name || undefined} /></label>)}</div>}
            <label className="block text-sm font-semibold">Formula<CustomSelect aria-label={`Formula partecipante ${index + 1}`} className={field} required value={person.packageId} onChange={event => update(index, { packageId: event.target.value })}>{packages.map(pkg => <option key={pkg.id} value={pkg.id}>{pkg.name}</option>)}</CustomSelect></label>
            {addons.length > 0 && <fieldset className="space-y-3"><legend className="mb-2 text-sm font-semibold">Aggiunte facoltative</legend>{addons.map(addon => <label key={addon.id} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={person.addonIds.includes(addon.id)} onChange={event => update(index, { addonIds: event.target.checked ? [...person.addonIds, addon.id] : person.addonIds.filter(id => id !== addon.id) })} />{addon.name} · {euro(addon.amountCents)}</label>)}</fieldset>}
            {context.config.activities.filter(activity => activities.has(activity.id) && activity.menuOptions.length && !context.upgrade?.ownedActivityIds.includes(activity.id)).map(activity => <label key={activity.id} className="block text-sm font-semibold">Menù · {activity.name}<CustomSelect aria-label={`Menù ${activity.name} partecipante ${index + 1}`} className={field} required value={person.menuChoices[activity.id] || ""} onChange={event => update(index, { menuChoices: { ...person.menuChoices, [activity.id]: event.target.value } })}><option value="">Scegli il menù</option>{activity.menuOptions.map(option => <option key={option} value={option}>{option}</option>)}</CustomSelect></label>)}
            {context.upgrade ? <p className="text-sm text-[#63715b]">Email dell’acquisto: {context.upgrade.buyerEmail}. I dati anagrafici e assicurativi restano quelli già registrati.</p> : <CheckoutContactFields locale={locale} prefix={`manual-${index}`} value={person.contact} onChange={changes => update(index, { contact: { ...person.contact, ...changes, marketingConsent: false } })} validationError={validation?.participantIndex === index ? validation : undefined} disabled={locked} hideMarketingConsent />}
          </section>;
        })}
        {!context.upgrade && <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Affiliato<CustomSelect className={field} value={affiliateId} onChange={event => { setAffiliateId(event.target.value); setConfirmed(false); }}><option value="">Nessun affiliato · iscrizione diretta</option>{context.affiliates.map(affiliate => <option key={affiliate.id} value={affiliate.id}>{affiliate.name}</option>)}</CustomSelect></label><label className="text-sm font-semibold">Codice sconto (facoltativo)<input className={field} maxLength={50} value={discountCode} onChange={event => { setDiscountCode(event.target.value.toUpperCase()); setConfirmed(false); }} /></label></div>}
        <TicketPolicyNotice locale={locale} />
      </fieldset>
      <fieldset disabled={locked} className={`${card} min-w-0`}><legend className="sr-only">Pagamento ricevuto</legend><h2 className="text-xl font-semibold">2. Pagamento ricevuto</h2><div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-semibold">Metodo di pagamento<CustomSelect className={field} value={method} onChange={event => { setMethod(event.target.value as "cash" | "pos"); setConfirmed(false); }}><option value="cash">Contanti</option><option value="pos">POS / bancomat</option></CustomSelect></label><DateTimeField id="manual-paid-at" label="Data e ora del pagamento" value={paidAt} onChange={value => { setPaidAt(value); setConfirmed(false); }} required disabled={locked} max={toRomeInput(new Date().toISOString())} description="Ora italiana (Europe/Rome)" /><label className="text-sm font-semibold">Riferimento pagamento (facoltativo)<input className={field} maxLength={200} value={reference} onChange={event => setReference(event.target.value)} placeholder="Es. riferimento della ricevuta POS" /></label>{method === "pos" && <div className="space-y-3"><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={knownFee} onChange={event => setKnownFee(event.target.checked)} />Conosco la commissione effettiva del POS</label>{knownFee ? <label className="block text-sm font-semibold">Commissione effettiva (€)<EuroInput className={field} aria-label="Commissione effettiva POS" cents={feeCents} onCentsChange={setFeeCents} required /></label> : <p className="text-xs leading-5 text-[#63715b]">La commissione resterà da verificare negli incassi, finché non sarà nota.</p>}</div>}</div><label className="block text-sm font-semibold">Nota interna (facoltativa)<textarea className={`${field} py-3`} maxLength={2000} rows={2} value={note} onChange={event => setNote(event.target.value)} /></label></fieldset>
      <section className={card} aria-labelledby="manual-summary"><h2 id="manual-summary" className="text-xl font-semibold">3. Riepilogo e conferma</h2>{quoting ? <p role="status">Aggiornamento dell’importo…</p> : quoteError ? <p role="alert" className="text-rose-800">{quoteError}</p> : quote && <><ul className="divide-y divide-[#e5eadf]">{quote.lines.map((line, index) => <li key={index} className="flex justify-between gap-4 py-2 text-sm"><span>{people.length > 1 ? `Partecipante ${(line.participantIndex || 0) + 1} · ` : ""}{line.label}</span><strong className="whitespace-nowrap">{euro(line.totalCents)}</strong></li>)}</ul><p className="flex flex-wrap items-center justify-between gap-3 text-lg font-semibold"><span>{context.upgrade ? "Differenza già incassata" : "Importo già incassato"}</span><span className="text-2xl">{euro(quote.totalCents)}</span></p>{Boolean(quote.discountCents) && <p className="text-sm">Sconto applicato: {euro(quote.discountCents || 0)}. La cena mantiene il prezzo previsto.</p>}<p className="text-xs leading-6 text-[#63715b]">Il prezzo segue le formule e gli sconti dell’evento. Disponibilità e importo saranno ricontrollati alla conferma; la cena viene conteggiata separatamente negli incassi.</p></>}
        <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1" required disabled={locked || !quote || quoting} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>Confermo di avere già ricevuto {quote ? euro(quote.totalCents) : "l’importo indicato"} in {method === "cash" ? "contanti" : "POS"} e di avere verificato i dati {context.upgrade ? "del partecipante" : "di ogni partecipante"}.</span></label>
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{error}</p>}
        {uncertain ? <button className={button} type="button" disabled={busy} onClick={() => { if (attempt.current) void sendAttempt(attempt.current); }}>{busy ? "Verifica in corso…" : "Verifica e riprova la stessa registrazione"}</button> : <button className={button} type="submit" disabled={busy || !quote || quoting || !confirmed}>{busy ? "Registrazione in corso…" : context.upgrade ? "Conferma pagamento ricevuto e aggiorna biglietto" : "Conferma pagamento ricevuto e crea biglietto"}</button>}
      </section>
    </form>
  </div>;
}
