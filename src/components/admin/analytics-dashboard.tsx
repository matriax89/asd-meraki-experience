"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/routing";
import { CustomSelect } from "@/components/ui/custom-select";
import type { AdminAnalytics, AnalyticsFinancials } from "@/lib/admin/analytics-types";
import { adminAnalyticsCsv } from "@/lib/admin/analytics-csv";

const euro = (cents: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);
const net = (cents: number | null) => cents === null ? "Da verificare" : euro(cents);
const fees = (row: AnalyticsFinancials) => `${euro(row.feesCents)}${row.missingFeePayments ? " (parziali)" : ""}`;
const number = (value: number) => value.toLocaleString("it-IT");
const day = (value: string) => new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
const displayInputDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : "";
const input = "min-h-11 w-full min-w-0 rounded-xl border border-[#dce1d7] bg-white px-3 text-sm text-[#24382c] outline-offset-2 focus-visible:outline-2 focus-visible:outline-[#ad9160] disabled:opacity-60";
const panel = "min-w-0 rounded-2xl border border-[#e0e5db] bg-white p-4 sm:p-5";
const link = "inline-flex min-h-10 items-center justify-center rounded-lg border border-[#dce2d6] bg-white px-3 text-xs font-semibold text-[#36523e] transition hover:border-[#a9b89d] hover:bg-[#f5f7f1]";
const statusLabels = { draft: "Bozza", upcoming: "In programma", ongoing: "In corso", past: "Concluso", canceled: "Annullato" };

function parseInputDay(value: string): string | null {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, date, month, year] = match;
  const instant = new Date(Date.UTC(Number(year), Number(month) - 1, Number(date)));
  return Number(year) >= 1900 && instant.getUTCFullYear() === Number(year) && instant.getUTCMonth() === Number(month) - 1 && instant.getUTCDate() === Number(date) ? `${year}-${month}-${date}` : null;
}

function AnalyticsFilters({ data, fixedEventId }: { data: AdminAnalytics; fixedEventId?: string }) {
  const router = useRouter();
  const [pending, startNavigation] = useTransition();
  const [draft, setDraft] = useState(() => ({ ...data.filters, from: displayInputDay(data.filters.from), to: displayInputDay(data.filters.to) }));
  const [error, setError] = useState("");
  const apply = (next = draft) => {
    if (pending) return;
    const from = next.period === "custom" ? parseInputDay(next.from) : "";
    const to = next.period === "custom" ? parseInputDay(next.to) : "";
    if (next.period === "custom" && (!from || !to)) { setError("Inserisci entrambe le date nel formato gg/mm/aaaa."); return; }
    if (from && to && from > to) { setError("La data iniziale non può essere successiva alla data finale."); return; }
    setError("");
    const url = new URL(window.location.href);
    const fields = { event: fixedEventId ? "" : next.eventId, period: next.period, affiliate: next.affiliateId === "all" ? "" : next.affiliateId, from, to };
    for (const [key, value] of Object.entries(fields)) { if (value) url.searchParams.set(key, value); else url.searchParams.delete(key); }
    startNavigation(() => router.replace(`${url.pathname}${url.search}`, { scroll: false }));
  };
  const submit = (event: FormEvent) => { event.preventDefault(); apply(); };
  return <form onSubmit={submit} aria-label="Filtri statistiche" aria-busy={pending} className={`${panel} space-y-4`}>
    <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <div className="min-w-0 space-y-1.5"><label htmlFor="analytics-event" className="block text-xs font-semibold text-[#53654b]">Evento</label><CustomSelect id="analytics-event" value={draft.eventId} disabled={pending || Boolean(fixedEventId)} className={input} onChange={event => { const next = { ...draft, eventId: event.target.value, affiliateId: "all" }; setDraft(next); apply(next); }}><option value="">Tutti gli eventi</option>{data.events.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}</CustomSelect></div>
      <div className="min-w-0 space-y-1.5"><label htmlFor="analytics-period" className="block text-xs font-semibold text-[#53654b]">Periodo acquisti</label><CustomSelect id="analytics-period" value={draft.period} disabled={pending} className={input} onChange={event => { const next = { ...draft, period: event.target.value as typeof draft.period }; setDraft(next); if (next.period !== "custom") apply(next); }}><option value="7">Ultimi 7 giorni</option><option value="30">Ultimi 30 giorni</option><option value="90">Ultimi 90 giorni</option><option value="all">Tutto lo storico</option><option value="custom">Date personalizzate</option></CustomSelect></div>
      <div className="min-w-0 space-y-1.5"><label htmlFor="analytics-affiliate" className="block text-xs font-semibold text-[#53654b]">Affiliato</label><CustomSelect id="analytics-affiliate" value={draft.affiliateId} disabled={pending} className={input} onChange={event => { const next = { ...draft, affiliateId: event.target.value }; setDraft(next); apply(next); }}><option value="all">Tutti gli affiliati e acquisti diretti</option><option value="direct">Acquisti diretti</option>{data.affiliateOptions.map(affiliate => <option key={affiliate.id} value={affiliate.id}>{affiliate.name}</option>)}</CustomSelect></div>
      <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#243d2e] px-5 text-sm font-semibold text-white transition hover:bg-[#34553e] disabled:opacity-60">{pending ? "Aggiornamento…" : "Applica filtri"}</button>
    </div>
    {draft.period === "custom" && <div className="grid max-w-xl gap-3 sm:grid-cols-2"><div className="space-y-1.5"><label htmlFor="analytics-from" className="block text-xs font-semibold text-[#53654b]">Dal giorno</label><input id="analytics-from" inputMode="numeric" autoComplete="off" placeholder="gg/mm/aaaa" value={draft.from} disabled={pending} aria-describedby="analytics-date-format" aria-invalid={Boolean(error)} onChange={event => setDraft({ ...draft, from: event.target.value })} className={input} /></div><div className="space-y-1.5"><label htmlFor="analytics-to" className="block text-xs font-semibold text-[#53654b]">Al giorno incluso</label><input id="analytics-to" inputMode="numeric" autoComplete="off" placeholder="gg/mm/aaaa" value={draft.to} disabled={pending} aria-describedby="analytics-date-format" aria-invalid={Boolean(error)} onChange={event => setDraft({ ...draft, to: event.target.value })} className={input} /></div><p id="analytics-date-format" className="text-xs text-[#5f6c55] sm:col-span-2">Giorno/mese/anno · Fuso italiano Europe/Rome</p></div>}
    {error && <p role="alert" className="text-sm text-[#a04435]">{error}</p>}
    <p className="text-xs leading-5 text-[#5f6c55]">Acquisti creati nel periodo selezionato{data.filters.from && data.filters.to ? `: ${day(data.filters.from)} – ${day(data.filters.to)}` : ": tutto lo storico"}. I rimborsi si riferiscono agli stessi acquisti, anche se eseguiti successivamente.</p>
    {pending && <p role="status" className="text-xs font-medium text-[#52654a]">Caricamento dei dati aggiornati…</p>}
  </form>;
}

function SalesTrend({ rows }: { rows: AdminAnalytics["trend"] }) {
  const nonZero = rows.some(row => row.grossCents || row.refundedCents || row.paidOrders);
  const complete = rows.every(row => row.netAfterFeesCents !== null);
  const width = 720; const height = 170;
  const minimum = Math.min(0, ...rows.map(row => row.netAfterFeesCents ?? 0));
  const maximum = Math.max(1, ...rows.map(row => row.netAfterFeesCents ?? 0));
  const y = (value: number) => 15 + (maximum - value) / (maximum - minimum) * (height - 30);
  const firstDay = rows.length ? Date.parse(`${rows[0].date}T00:00:00Z`) : 0;
  const span = rows.length > 1 ? Math.max(1, Date.parse(`${rows[rows.length - 1].date}T00:00:00Z`) - firstDay) : 1;
  const points = rows.map(row => `${rows.length > 1 ? (Date.parse(`${row.date}T00:00:00Z`) - firstDay) / span * width : width / 2},${y(row.netAfterFeesCents ?? 0)}`).join(" ");
  return <section className={panel} aria-labelledby="sales-trend-title"><div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 id="sales-trend-title" className="text-base font-semibold text-[#24382c]">Andamento delle vendite</h2><span className="text-xs text-[#5f6c55]">Netto dopo commissioni · {rows.length} {rows.length === 1 ? "giorno visualizzato" : "giorni visualizzati"}</span></div>
    {nonZero && !complete ? <p className="py-8 text-center text-sm leading-6 text-[#756548]">Il grafico del netto sarà disponibile quando le commissioni saranno complete. Gli importi già verificati sono nella tabella sottostante.</p> : nonZero ? <><div className="mb-2 flex justify-between text-[11px] text-[#5f6c55]"><span>{euro(maximum)}</span><span>Min. {euro(minimum)}</span></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="sales-trend-title sales-trend-description" className="block h-40 w-full overflow-visible"><desc id="sales-trend-description">Incassi netti dopo rimborsi e commissioni Stripe e PayPal per giorno di acquisto. I valori completi sono disponibili nella tabella sottostante. I rimborsi sono associati al giorno dell’acquisto originale.</desc><line x1="0" x2={width} y1={y(0)} y2={y(0)} stroke="#e1e7dc" strokeWidth="1" /><polyline points={points} fill="none" stroke="#426844" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />{rows.length === 1 && <circle cx={width / 2} cy={y(rows[0].netAfterFeesCents ?? 0)} r="4" fill="#426844" />}</svg><div className="mt-1 flex justify-between text-[11px] text-[#5f6c55]"><span>{day(rows[0].date)}</span><span>{day(rows[rows.length - 1].date)}</span></div></> : <p className="py-10 text-center text-sm text-[#5f6c55]">Nessuna vendita confermata nel periodo selezionato.</p>}
    {rows.length > 0 && <details className="mt-4 border-t border-[#edf0e9] pt-3"><summary className="cursor-pointer text-xs font-semibold text-[#52694a]">Visualizza i dati del grafico</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><caption className="sr-only">Vendite per giorno, importi in euro</caption><thead><tr className="border-b border-[#e4e8de] text-[#5f6c55]"><th className="py-2 pr-3">Giorno</th><th className="px-2 py-2">Lordo</th><th className="px-2 py-2">Rimborsi</th><th className="px-2 py-2">Commissioni</th><th className="px-2 py-2">Netto dopo commissioni</th><th className="py-2 pl-3 text-right">Ordini</th></tr></thead><tbody>{rows.map(row => <tr key={row.date} className="border-b border-[#f0f2ec]"><th scope="row" className="whitespace-nowrap py-2 pr-3 font-medium">{day(row.date)}</th><td className="whitespace-nowrap px-2 py-2">{euro(row.grossCents)}</td><td className="whitespace-nowrap px-2 py-2">{euro(row.refundedCents)}</td><td className="whitespace-nowrap px-2 py-2">{fees(row)}</td><td className="whitespace-nowrap px-2 py-2">{net(row.netAfterFeesCents)}</td><td className="py-2 pl-3 text-right">{number(row.paidOrders)}</td></tr>)}</tbody></table></div></details>}
  </section>;
}

function RevenueBreakdown({ rows }: { rows: AdminAnalytics["revenue"] }) {
  return <section className={panel} aria-labelledby="analytics-revenue-title">
    <h2 id="analytics-revenue-title" className="text-base font-semibold">Incassi per attività</h2>
    <p className="mt-1 text-xs leading-5 text-[#5f6c55]">Importi separati per masterclass, workshop e cena, comprese le quote delle formule combinate.</p>
    <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-3">{rows.map(row => <article key={row.id} data-revenue-kind={row.id} className="min-w-0 rounded-xl border border-[#e1e6da] bg-[#fafbf7] p-4">
      <h3 className="break-words text-sm font-semibold text-[#46583f]">{row.name}</h3>
      <p className="mt-3 break-words text-2xl font-semibold tracking-tight tabular-nums">{net(row.netAfterFeesCents)}</p><p className="mt-1 text-[11px] text-[#5f6c55]">Netto dopo rimborsi e commissioni</p>
      <dl className="mt-4 space-y-2 text-xs tabular-nums">{[{ label: "Lordo", value: euro(row.grossCents) }, { label: "Rimborsi", value: euro(row.refundedCents) }, { label: "Commissioni Stripe / PayPal", value: fees(row) }].map(item => <div key={item.label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><dt className="text-[#5f6c55]">{item.label}</dt><dd className="font-medium">{item.value}</dd></div>)}</dl>
      {row.missingFeePayments > 0 && <p className="mt-3 text-[11px] leading-5 text-[#83714b]">Commissioni da verificare per {number(row.missingFeePayments)} {row.missingFeePayments === 1 ? "pagamento" : "pagamenti"}.</p>}
    </article>)}</div>
    <p className="mt-3 text-[11px] leading-5 text-[#5f6c55]">Rimborsi e commissioni di ciascun pagamento sono ripartiti in proporzione agli importi delle attività acquistate.</p>
  </section>;
}

function SalesBreakdown({ title, rows, empty }: { title: string; rows: AdminAnalytics["packages"]; empty: string }) {
  return <section className={panel}><h2 className="mb-3 text-base font-semibold text-[#24382c]">{title}</h2>{rows.length ? <ul className="divide-y divide-[#edf0e9]">{rows.map(row => <li key={row.id} className="flex min-w-0 items-center justify-between gap-4 py-3"><span className="min-w-0 break-words text-sm font-medium text-[#46583f]">{row.name}</span><span className="shrink-0 text-right"><strong className="block text-sm font-semibold text-[#24382c]">{euro(row.grossCents)}</strong><span className="text-xs text-[#5f6c55]">{number(row.count)} vendite</span></span></li>)}</ul> : <p className="py-4 text-sm text-[#5f6c55]">{empty}</p>}</section>;
}

export function AnalyticsDashboard({ data, fixedEventId }: { data: AdminAnalytics; fixedEventId?: string }) {
  const eventId = fixedEventId || data.filters.eventId;
  const selectedEvent = data.events.find(event => event.id === eventId);
  const scope = eventId ? `?event=${eventId}` : "";
  const metrics = data.metrics;
  const kpis = [
    { label: "Vendite lorde", value: euro(metrics.grossCents), detail: "Pagamenti confermati" },
    { label: "Rimborsi", value: euro(metrics.refundedCents), detail: "Rimborsi riusciti degli stessi acquisti" },
    { label: "Commissioni Stripe / PayPal", value: fees(metrics), detail: metrics.missingFeePayments ? "Importo parziale: mancano alcune commissioni" : "Commissioni effettive dei pagamenti" },
    { label: "Incassi netti", value: net(metrics.netAfterFeesCents), detail: `Dopo rimborsi e commissioni · prima delle commissioni: ${euro(metrics.netCents)}`, highlight: true },
    { label: "Ordini pagati", value: number(metrics.paidOrders), detail: "Comprende gli acquisti di aggiunte" },
    { label: "Iscritti validi", value: number(metrics.validParticipants), detail: "Ogni persona conta una volta" },
    { label: "Con check-in", value: number(metrics.checkedInParticipants), detail: "Almeno un accesso registrato" },
    { label: "Lista d’attesa", value: metrics.waiting === null ? "—" : number(metrics.waiting), detail: metrics.waiting === null ? "Non attribuibile a un affiliato" : "Contatti ancora in attesa" },
  ];
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([adminAnalyticsCsv(data, !fixedEventId)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `meraki-statistiche-${data.filters.from || "storico"}-${data.filters.to || "completo"}.csv`;
    anchor.click(); URL.revokeObjectURL(url);
  };
  return <div className="min-w-0 space-y-5 text-[#24382c]">
    <header className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0">{fixedEventId && <Link prefetch={false} href="/admin/eventi" className="mb-3 inline-flex min-h-8 items-center text-xs font-semibold text-[#5f6c55]">← Tutti gli eventi</Link>}<p className="mb-1 text-[10px] font-semibold uppercase tracking-[.16em] text-[#7d6741]">Meraki · Vendite e partecipazione</p><h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{fixedEventId ? selectedEvent?.title || "Statistiche evento" : "Dashboard"}</h1><p className="mt-2 text-sm text-[#5f6c55]">{fixedEventId && selectedEvent ? `${day(selectedEvent.startsAt)} · Statistiche dell’evento` : "Vendite, partecipanti e disponibilità in un’unica vista."}</p></div><Link prefetch={false} href={eventId ? `/admin/eventi/${eventId}` : "/admin/eventi/nuovo"} className="inline-flex min-h-10 items-center rounded-xl bg-[#243d2e] px-4 text-sm font-semibold text-white">{eventId ? "Modifica evento" : "+ Nuovo evento"}</Link></header>
    <AnalyticsFilters key={JSON.stringify(data.filters)} data={data} fixedEventId={fixedEventId} />
    <nav aria-label="Gestione rapida" className="flex flex-wrap gap-2"><Link prefetch={false} href={`/admin/biglietti${scope}`} className={link}>Iscritti e check-in</Link><Link prefetch={false} href={`/admin/affiliati${scope}`} className={link}>Affiliati</Link><Link prefetch={false} href={`/admin/rimborsi${scope}`} className={link}>Rimborsi</Link>{eventId && <Link prefetch={false} href={`/admin/eventi/${eventId}/commerce`} className={link}>Formule e prezzi</Link>}<Link prefetch={false} href="/admin/eventi" className={link}>Elenco eventi</Link><button type="button" className={link} onClick={exportCsv}>Esporta report CSV</button></nav>
    {!fixedEventId && <section className={panel} aria-labelledby="analytics-operations"><div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 id="analytics-operations" className="text-base font-semibold">Da gestire</h2><p className="text-[11px] text-[#5f6c55]">Situazione attuale, indipendente dai filtri</p></div><div className="grid gap-3 sm:grid-cols-3">{[{ label: "Nuove richieste", count: data.operations.newLeads, href: "/admin/leads" }, { label: "Ordini pregressi aperti", count: data.operations.openShopOrders, href: "/admin/ordini" }, { label: "Contatti confermati", count: data.operations.confirmedContacts, href: "/admin/contatti" }].map(operation => <Link key={operation.href} prefetch={false} href={operation.href} className="flex items-center justify-between gap-3 rounded-xl border border-[#e3e8dc] px-4 py-3 text-sm text-[#53654b]"><span>{operation.label}</span><strong className="text-xl font-semibold text-[#24382c]">{number(operation.count)}</strong></Link>)}</div></section>}
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{kpis.map(kpi => <div key={kpi.label} className={`min-w-0 rounded-2xl border p-4 ${kpi.highlight ? "border-[#25422e] bg-[#25422e] text-white" : "border-[#e0e5db] bg-white"}`}><dt className={`text-xs font-medium ${kpi.highlight ? "text-[#d8dfcc]" : "text-[#53654b]"}`}>{kpi.label}</dt><dd className="mt-2 break-words text-[25px] font-semibold leading-tight tracking-tight tabular-nums">{kpi.value}</dd><p className={`mt-2 text-[11px] leading-4 ${kpi.highlight ? "text-[#cbd6c0]" : "text-[#5f6c55]"}`}>{kpi.detail}</p></div>)}</dl>
    {metrics.missingFeePayments > 0 && <p role="status" className="rounded-xl border border-[#e5d9bb] bg-[#faf6e9] px-4 py-3 text-xs leading-6 text-[#83714b]">Commissioni incomplete per {number(metrics.missingFeePayments)} {metrics.missingFeePayments === 1 ? "pagamento" : "pagamenti"}. Il netto resta da verificare finché non sono disponibili tutte le commissioni Stripe e PayPal.</p>}
    <RevenueBreakdown rows={data.revenue} />
    {data.notes.length > 0 && <details className="min-w-0 rounded-xl border border-[#e5dfd1] bg-[#faf8f1] px-4 py-3"><summary className="cursor-pointer text-xs font-semibold text-[#756548]">Come leggere questi dati</summary><ul className="mt-3 space-y-1 break-words text-xs leading-5 text-[#756548]">{data.notes.map(note => <li key={note}>{note}</li>)}</ul></details>}
    <SalesTrend rows={data.trend} />
    <div className="grid min-w-0 gap-4 xl:grid-cols-2"><SalesBreakdown title="Formule vendute" rows={data.packages} empty="Nessuna formula venduta nel periodo." /><section className={panel}><h2 className="mb-3 text-base font-semibold">Attività e disponibilità</h2>{data.activities.length ? <ul className="divide-y divide-[#edf0e9]">{data.activities.map(activity => <li key={`${activity.eventId}:${activity.id}`} className="space-y-2 py-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-sm font-medium">{activity.name}</p>{!eventId && <p className="mt-0.5 break-words text-[11px] text-[#5f6c55]">{activity.eventTitle}</p>}</div><p className="text-xs text-[#53654b]">{activity.remaining === null ? "Senza limite di posti" : `${number(activity.remaining)} posti residui`}</p></div><p className="text-xs text-[#5f6c55]">{number(activity.validAdmissions)} accessi validi nel periodo · {number(activity.checkedIn)} check-in{activity.capacity !== null ? ` · capienza ${number(activity.capacity)}` : ""}</p></li>)}</ul> : <p className="py-4 text-sm text-[#5f6c55]">Nessuna attività configurata per gli eventi selezionati.</p>}<p className="mt-3 text-[11px] leading-5 text-[#5f6c55]">Capienza e posti residui descrivono gli accessi validi attuali dell’intero evento, indipendentemente dai filtri del report. Le prenotazioni ancora da pagare non sono sottratte.</p></section></div>
    <section className={panel} aria-labelledby="analytics-affiliates-title"><h2 id="analytics-affiliates-title" className="mb-3 text-base font-semibold">Risultati per affiliato</h2>{data.affiliates.length ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-[#e3e8dc] text-[#5f6c55]"><th className="py-2 pr-4">Affiliato</th><th className="px-3 py-2 text-right">Iscritti validi</th><th className="px-3 py-2 text-right">Check-in</th><th className="px-3 py-2 text-right">Ordini</th><th className="px-3 py-2 text-right">Netto dopo commissioni</th><th className="py-2 pl-3">Elenco</th></tr></thead><tbody>{data.affiliates.map(affiliate => <tr key={`${affiliate.eventId}:${affiliate.id}`} className="border-b border-[#f0f2ec]"><th scope="row" className="min-w-40 py-3 pr-4 font-medium"><span className="block text-[#3e593a]">{affiliate.name}</span>{!eventId && <span className="mt-0.5 block text-[11px] font-normal text-[#5f6c55]">{affiliate.eventTitle}</span>}</th><td className="px-3 py-3 text-right">{number(affiliate.validParticipants)}</td><td className="px-3 py-3 text-right">{number(affiliate.checkedInParticipants)}</td><td className="px-3 py-3 text-right">{number(affiliate.paidOrders)}</td><td className="whitespace-nowrap px-3 py-3 text-right font-semibold">{net(affiliate.netAfterFeesCents)}</td><td className="py-3 pl-3"><Link prefetch={false} href={`/admin/affiliati/${affiliate.id}?event=${affiliate.eventId}`} className="whitespace-nowrap font-semibold text-[#526e45] underline underline-offset-4">Vedi iscritti</Link></td></tr>)}</tbody></table></div> : <p className="py-4 text-sm text-[#5f6c55]">Nessun dato per affiliati nel periodo selezionato.</p>}</section>
    <details className={panel}><summary className="cursor-pointer text-sm font-semibold">Scaglioni, aggiunte e pagamenti in attesa</summary><div className="mt-4 grid gap-4 xl:grid-cols-2"><SalesBreakdown title="Scaglioni di prezzo" rows={data.tiers} empty="Nessuno scaglione venduto nel periodo." /><SalesBreakdown title="Aggiunte" rows={data.addons} empty="Nessuna aggiunta venduta nel periodo." /></div><p className="mt-4 text-xs leading-6 text-[#5f6c55]">Pagamenti in attesa: {number(metrics.pendingOrders)} · Scaduti: {number(metrics.expiredOrders)} · Non riusciti: {number(metrics.failedOrders)}. Questi ordini non contribuiscono agli incassi confermati.</p></details>
    {!fixedEventId && <section className={panel}><h2 className="mb-3 text-base font-semibold">Riepilogo per evento</h2>{data.eventStats.length ? <ul className="divide-y divide-[#edf0e9]">{data.eventStats.map(event => <li key={event.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><Link prefetch={false} href={`/admin/eventi/${event.id}/statistiche`} className="break-words text-sm font-semibold text-[#3e593a] hover:underline">{event.title}</Link><p className="mt-1 text-xs text-[#5f6c55]">{day(event.startsAt)} · {statusLabels[event.status]}</p></div><div className="flex flex-wrap gap-x-5 gap-y-1 text-right text-xs text-[#5f6c55]"><span><strong className="block text-sm font-semibold text-[#24382c]">{net(event.netAfterFeesCents)}</strong>Netto dopo commissioni</span><span><strong className="block text-sm font-semibold text-[#24382c]">{number(event.validParticipants)}</strong>Iscritti validi</span><Link prefetch={false} href={`/admin/eventi/${event.id}/statistiche`} className="self-center font-semibold text-[#526e45]">Statistiche →</Link></div></li>)}</ul> : <p className="py-4 text-sm text-[#5f6c55]">Non ci sono eventi da mostrare.</p>}</section>}
  </div>;
}
