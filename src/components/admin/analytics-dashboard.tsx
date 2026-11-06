"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/routing";
import { CustomSelect } from "@/components/ui/custom-select";
import type { AdminAnalytics, AnalyticsFinancials } from "@/lib/admin/analytics-types";
import { adminAnalyticsCsv } from "@/lib/admin/analytics-csv";

const euro = (cents: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(cents / 100);
const net = (row: AnalyticsFinancials) => row.netAfterFeesCents !== null ? euro(row.netAfterFeesCents) : row.netAfterEstimatedFeesCents != null ? `${euro(row.netAfterEstimatedFeesCents)} (da confermare)` : "Da verificare";
const fees = (row: AnalyticsFinancials) => (row.estimatedFeePayments || 0) > 0
  ? `${euro(row.feesCents)} effettive + ${euro(row.estimatedFeesCents || 0)} calcolate da listino${row.missingFeePayments > (row.estimatedFeePayments || 0) ? " (parziali)" : ""}`
  : `${euro(row.feesCents)}${row.missingFeePayments ? " (parziali)" : ""}`;
const feeDetail = (row: AnalyticsFinancials) => (row.estimatedFeePayments || 0) > 0 ? "Commissioni effettive e quote mancanti calcolate da listino, da confermare" : row.missingFeePayments ? "Importo parziale: mancano alcune commissioni" : "Commissioni effettive dei pagamenti";
const number = (value: number) => value.toLocaleString("it-IT");
const credits = (value: number) => `${number(value)} ${value === 1 ? "credito" : "crediti"}`;
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
    <p className="text-xs leading-5 text-[#5f6c55]">Acquisti online e pagamenti contanti/POS nel periodo selezionato{data.filters.from && data.filters.to ? `: ${day(data.filters.from)} – ${day(data.filters.to)}` : ": tutto lo storico"}. Per contanti e POS vale la data del pagamento registrata. I rimborsi si riferiscono agli stessi acquisti, anche se eseguiti successivamente.</p>
    {pending && <p role="status" className="text-xs font-medium text-[#52654a]">Caricamento dei dati aggiornati…</p>}
  </form>;
}

function SalesTrend({ rows }: { rows: (AnalyticsFinancials & { date: string; count: number })[] }) {
  const nonZero = rows.some(row => row.grossCents || row.refundedCents || row.count);
  const complete = rows.every(row => row.netAfterFeesCents !== null);
  const width = 720; const height = 170;
  const minimum = Math.min(0, ...rows.map(row => row.netAfterFeesCents ?? 0));
  const maximum = Math.max(1, ...rows.map(row => row.netAfterFeesCents ?? 0));
  const y = (value: number) => 15 + (maximum - value) / (maximum - minimum) * (height - 30);
  const firstDay = rows.length ? Date.parse(`${rows[0].date}T00:00:00Z`) : 0;
  const span = rows.length > 1 ? Math.max(1, Date.parse(`${rows[rows.length - 1].date}T00:00:00Z`) - firstDay) : 1;
  const points = rows.map(row => `${rows.length > 1 ? (Date.parse(`${row.date}T00:00:00Z`) - firstDay) / span * width : width / 2},${y(row.netAfterFeesCents ?? 0)}`).join(" ");
  return <section className={panel} aria-labelledby="sales-trend-title"><div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 id="sales-trend-title" className="text-base font-semibold text-[#24382c]">Andamento delle attività · cena esclusa</h2><span className="text-xs text-[#5f6c55]">Netto dopo commissioni · {rows.length} {rows.length === 1 ? "giorno visualizzato" : "giorni visualizzati"}</span></div>
    {nonZero && !complete ? <p className="py-8 text-center text-sm leading-6 text-[#756548]">Il grafico del netto sarà disponibile quando le commissioni saranno complete. La tabella sottostante distingue gli importi effettivi da quelli calcolati da listino e da confermare.</p> : nonZero ? <><div className="mb-2 flex justify-between text-[11px] text-[#5f6c55]"><span>{euro(maximum)}</span><span>Min. {euro(minimum)}</span></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="sales-trend-title sales-trend-description" className="block h-40 w-full overflow-visible"><desc id="sales-trend-description">Incassi delle attività, cena esclusa, dopo rimborsi e commissioni di pagamento per giorno di acquisto. I valori completi sono disponibili nella tabella sottostante. I rimborsi sono associati al giorno dell’acquisto originale.</desc><line x1="0" x2={width} y1={y(0)} y2={y(0)} stroke="#e1e7dc" strokeWidth="1" /><polyline points={points} fill="none" stroke="#426844" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />{rows.length === 1 && <circle cx={width / 2} cy={y(rows[0].netAfterFeesCents ?? 0)} r="4" fill="#426844" />}</svg><div className="mt-1 flex justify-between text-[11px] text-[#5f6c55]"><span>{day(rows[0].date)}</span><span>{day(rows[rows.length - 1].date)}</span></div></> : <p className="py-10 text-center text-sm text-[#5f6c55]">Nessuna vendita confermata nel periodo selezionato.</p>}
    {rows.length > 0 && <details className="mt-4 border-t border-[#edf0e9] pt-3"><summary className="cursor-pointer text-xs font-semibold text-[#52694a]">Visualizza i dati del grafico</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><caption className="sr-only">Incassi delle attività per giorno, importi in euro</caption><thead><tr className="border-b border-[#e4e8de] text-[#5f6c55]"><th className="py-2 pr-3">Giorno</th><th className="px-2 py-2">Lordo</th><th className="px-2 py-2">Rimborsi</th><th className="px-2 py-2">Commissioni</th><th className="px-2 py-2">Netto dopo commissioni</th><th className="py-2 pl-3 text-right">Iscrizioni</th></tr></thead><tbody>{rows.map(row => <tr key={row.date} className="border-b border-[#f0f2ec]"><th scope="row" className="whitespace-nowrap py-2 pr-3 font-medium">{day(row.date)}</th><td className="whitespace-nowrap px-2 py-2">{euro(row.grossCents)}</td><td className="whitespace-nowrap px-2 py-2">{euro(row.refundedCents)}</td><td className="whitespace-nowrap px-2 py-2">{fees(row)}</td><td className="whitespace-nowrap px-2 py-2">{net(row)}</td><td className="py-2 pl-3 text-right">{number(row.count)}</td></tr>)}</tbody></table></div></details>}
  </section>;
}

function RevenueBreakdown({ rows }: { rows: AdminAnalytics["revenue"] }) {
  return <section className={panel} aria-labelledby="analytics-revenue-title">
    <h2 id="analytics-revenue-title" className="text-base font-semibold">Incassi per attività</h2>
    <p className="mt-1 text-xs leading-5 text-[#5f6c55]">Quote di masterclass e workshop, comprese le formule combinate. Gli incassi della cena sono nel riepilogo separato.</p>
    <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2">{rows.map(row => <article key={row.id} data-revenue-kind={row.id} className="min-w-0 rounded-xl border border-[#e1e6da] bg-[#fafbf7] p-4">
      <h3 className="break-words text-sm font-semibold text-[#46583f]">{row.name}</h3>
      <p className="mt-3 break-words text-2xl font-semibold tracking-tight tabular-nums">{net(row)}</p><p className="mt-1 text-[11px] text-[#5f6c55]">Netto dopo rimborsi e commissioni</p>
      <dl className="mt-4 space-y-2 text-xs tabular-nums">{[{ label: "Lordo", value: euro(row.grossCents) }, { label: "Rimborsi", value: euro(row.refundedCents) }, { label: "Commissioni di pagamento", value: fees(row) }].map(item => <div key={item.label} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><dt className="text-[#5f6c55]">{item.label}</dt><dd className="font-medium">{item.value}</dd></div>)}</dl>
      {row.missingFeePayments > 0 && <p className="mt-3 text-[11px] leading-5 text-[#83714b]">Commissioni da verificare per {number(row.missingFeePayments)} {row.missingFeePayments === 1 ? "pagamento" : "pagamenti"}.</p>}
    </article>)}</div>
    <p className="mt-3 text-[11px] leading-5 text-[#5f6c55]">Rimborsi e commissioni di ciascun pagamento sono ripartiti in proporzione agli importi delle attività acquistate.</p>
  </section>;
}

function ActivityAvailability({ data, eventId }: { data: AdminAnalytics; eventId: string }) {
  return <section className={panel} aria-labelledby="analytics-availability-title">
    <h2 id="analytics-availability-title" className="mb-3 text-base font-semibold">Attività e disponibilità</h2>
    {data.activities.length ? <ul className="divide-y divide-[#edf0e9]">{data.activities.map(activity => <li key={`${activity.eventId}:${activity.id}`} className="space-y-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words text-sm font-medium">{activity.name}</h3>{!eventId && <p className="mt-0.5 break-words text-[11px] text-[#5f6c55]">{activity.eventTitle}</p>}</div><p className="text-xs text-[#53654b]">{activity.remaining === null ? "Senza limite di posti" : `${number(activity.remaining)} posti liberi nella sessione`}</p></div>
      <p className="text-xs text-[#5f6c55]">{number(activity.occupied)} posti occupati attualmente{activity.capacity !== null ? ` su ${number(activity.capacity)}` : ""}.</p>
      <p className="text-xs text-[#5f6c55]">Nel periodo selezionato: {number(activity.validAdmissions)} accessi validi · {number(activity.checkedIn)} check-in.</p>
      {activity.reservedAdmissions > 0 && <p className="text-xs text-[#756548]">{number(activity.reservedAdmissions)} {activity.reservedAdmissions === 1 ? "posto temporaneamente prenotato" : "posti temporaneamente prenotati"}, in attesa di pagamento.</p>}
      {activity.availableForSale !== activity.remaining && <p className="text-xs font-medium text-[#53654b]">Disponibilità per capienza: {activity.availableForSale === null ? "senza limite" : number(activity.availableForSale)}. Il calcolo include le prenotazioni in attesa e l’eventuale limite complessivo dell’evento.</p>}
    </li>)}</ul> : <p className="py-4 text-sm text-[#5f6c55]">Nessuna attività configurata per gli eventi selezionati.</p>}
    {data.attendanceGroups.length > 0 && <div className="mt-4 space-y-3 border-t border-[#e3e8dc] pt-4">{data.attendanceGroups.map(group => <div key={group.eventId} data-attendance-event={group.eventId} className="rounded-xl bg-[#f5f7f1] p-3">
      <h3 className="break-words text-sm font-semibold">{!eventId ? `${group.eventTitle} · ` : ""}{number(group.currentParticipants)} persone distinte attualmente iscritte</h3>
      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-3">{[{ label: "Solo workshop", count: group.workshopOnly }, { label: "Solo masterclass", count: group.masterclassOnly }, { label: "Workshop e masterclass", count: group.both }, ...(group.otherParticipants > 0 ? [{ label: "Altre attività", count: group.otherParticipants }] : [])].map(item => <div key={item.label}><dt className="text-[#5f6c55]">{item.label}</dt><dd className="mt-1 font-semibold">{number(item.count)}</dd></div>)}</dl>
      <p className="mt-3 text-[11px] leading-5 text-[#5f6c55]">Chi partecipa a entrambe le sessioni conta una sola persona e occupa un posto nel workshop e uno nella masterclass. I due conteggi non vanno sommati per ottenere il numero di persone. La cena si aggiunge agli accessi della stessa persona.</p>
      {group.capacity !== null ? <p className="mt-2 text-[11px] leading-5 text-[#756548]">Limite complessivo dell’evento: {number(group.capacity)} persone distinte{group.remaining !== null ? ` · ${number(group.remaining)} posti liberi` : ""}{group.reservedParticipants > 0 ? ` · ${number(group.reservedParticipants)} prenotati in attesa` : ""}. È un limite aggiuntivo alla capienza delle singole sessioni.</p> : <p className="mt-2 text-[11px] leading-5 text-[#5f6c55]">Nessun limite aggiuntivo sul totale delle persone dell’evento.</p>}
    </div>)}</div>}
    <p className="mt-3 text-[11px] leading-5 text-[#5f6c55]">Posti occupati, posti liberi e persone distinte descrivono l’intero evento, indipendentemente dai filtri del report. I posti liberi nella sessione non sottraggono le prenotazioni temporanee; la disponibilità per capienza le considera.</p>
  </section>;
}

function AffiliateResults({ data, eventId }: { data: AdminAnalytics; eventId: string }) {
  const totalCommission = data.affiliates.reduce((sum, affiliate) => sum + affiliate.commissionCents, 0);
  const totalCredits = data.affiliates.reduce((sum, affiliate) => sum + (affiliate.commissionCredits || 0), 0);
  return <section className={panel} aria-labelledby="analytics-affiliates-title">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 id="analytics-affiliates-title" className="text-base font-semibold">Risultati per affiliato</h2>{eventId && <Link prefetch={false} href={`/admin/affiliati?event=${eventId}`} className={link}>Gestisci compensi</Link>}</div>
    {data.affiliates.length ? <><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-[#e3e8dc] text-[#5f6c55]">{["Affiliato", "Iscritti attività", "Cene", "Check-in", "Netto attività", "Netto cena", "Compenso per iscritto", "Compenso maturato", "Elenco"].map(label => <th key={label} className="whitespace-nowrap px-3 py-2 first:pl-0">{label}</th>)}</tr></thead><tbody>{data.affiliates.map(affiliate => <tr key={`${affiliate.eventId}:${affiliate.id}`} className="border-b border-[#f0f2ec]">
      <th scope="row" className="min-w-40 py-3 pr-4 font-medium"><span className="block text-[#3e593a]">{affiliate.name}</span>{!eventId && <span className="mt-0.5 block text-[11px] font-normal text-[#5f6c55]">{affiliate.eventTitle}</span>}</th>
      <td className="px-3 py-3 tabular-nums">{number(affiliate.registrationSummary.count)}</td><td className="px-3 py-3 tabular-nums">{number(affiliate.dinnerSummary.count)}</td><td className="px-3 py-3 tabular-nums">{number(affiliate.checkedInParticipants)}</td>
      <td className="whitespace-nowrap px-3 py-3 font-semibold">{net(affiliate.registrationSummary)}</td><td className="whitespace-nowrap px-3 py-3 font-semibold">{net(affiliate.dinnerSummary)}</td>
      <td className="whitespace-nowrap px-3 py-3">{affiliate.id === "direct" ? "—" : affiliate.commissionType === "credits" ? credits(affiliate.commissionPerParticipantCredits) : euro(affiliate.commissionPerParticipantCents)}</td><td className="whitespace-nowrap px-3 py-3 font-semibold">{affiliate.commissionType === "credits" ? credits(affiliate.commissionCredits) : euro(affiliate.commissionCents)}</td>
      <td className="py-3 pl-3"><Link prefetch={false} href={`/admin/affiliati/${affiliate.id}?event=${affiliate.eventId}`} className="whitespace-nowrap font-semibold text-[#526e45] underline underline-offset-4">Vedi iscritti</Link></td>
    </tr>)}</tbody></table></div><p className="mt-4 text-sm font-semibold">Totale compensi affiliati: {euro(totalCommission)} · {credits(totalCredits)}</p></> : <p className="py-4 text-sm text-[#5f6c55]">Nessun dato per affiliati nel periodo selezionato.</p>}
    <p className="mt-2 text-[11px] leading-5 text-[#5f6c55]">Attività e cena hanno conteggi e incassi separati. Gli upgrade aggiornano la stessa iscrizione. Il compenso è calcolato una sola volta per ogni iscritto valido nell’evento, con accessi alle attività o alla cena, nei filtri selezionati. Gli acquisti diretti non generano compensi. I netti sottraggono le commissioni di pagamento; i compensi agli affiliati sono indicati separatamente in euro e crediti, senza conversioni.</p>
  </section>;
}

function MetricCards({ items }: { items: { label: string; value: string; detail: string; highlight?: boolean }[] }) {
  return <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{items.map(item => <div key={item.label} className={`min-w-0 rounded-2xl border p-4 ${item.highlight ? "border-[#25422e] bg-[#25422e] text-white" : "border-[#e0e5db] bg-white"}`}><dt className={`text-xs font-medium ${item.highlight ? "text-[#d8dfcc]" : "text-[#53654b]"}`}>{item.label}</dt><dd className="mt-2 break-words text-[25px] font-semibold leading-tight tracking-tight tabular-nums">{item.value}</dd><p className={`mt-2 text-[11px] leading-4 ${item.highlight ? "text-[#cbd6c0]" : "text-[#5f6c55]"}`}>{item.detail}</p></div>)}</dl>;
}

function SalesBreakdown({ title, rows, empty, unit = "iscritti", description }: { title: string; rows: AdminAnalytics["packages"]; empty: string; unit?: "iscritti" | "accessi"; description?: string }) {
  return <section className={panel}><h2 className="mb-3 text-base font-semibold text-[#24382c]">{title}</h2>{rows.length ? <ul className="divide-y divide-[#edf0e9]">{rows.map(row => <li key={row.id} className="flex min-w-0 items-center justify-between gap-4 py-3"><span className="min-w-0 break-words text-sm font-medium text-[#46583f]">{row.name}</span><span className="shrink-0 text-right"><strong className="block text-sm font-semibold text-[#24382c]">{euro(row.netCents)}</strong><span className="text-xs text-[#5f6c55]">{number(row.count)} {row.count === 1 ? unit === "accessi" ? "accesso" : "iscritto" : unit}</span></span></li>)}</ul> : <p className="py-4 text-sm text-[#5f6c55]">{empty}</p>}{description && <p className="mt-3 text-[11px] leading-5 text-[#5f6c55]">{description}</p>}</section>;
}


function PaymentChannels({ rows }: { rows: AdminAnalytics["paymentChannels"] }) {
  return <section className={panel} aria-labelledby="analytics-payment-channels">
    <h2 id="analytics-payment-channels" className="text-base font-semibold">Incassi per metodo di pagamento</h2>
    <p className="mt-1 text-xs leading-5 text-[#5f6c55]">Attività e cena restano separate. I contanti non hanno commissioni. Stripe online, Tap to Pay e PayPal dentro Stripe sono distinti. Le quote calcolate da listino e i relativi netti da confermare sono indicati esplicitamente; i dati non verificabili restano da verificare.</p>
    <div className="mt-4 grid gap-3 lg:grid-cols-3">{rows.map(channel => <article key={channel.id} data-payment-channel={channel.id} className="min-w-0 rounded-xl border border-[#e3e8dc] p-4">
      <h3 className="text-sm font-semibold">{channel.name}</h3><p className="mt-1 text-xs text-[#5f6c55]">{number(channel.paidOrders)} pagamenti, esclusi i rimborsi totali</p>
      <dl className="mt-3 space-y-3 text-xs">{[{ label: "Attività · netto", row: channel.registrationSummary }, { label: "Cena · netto", row: channel.dinnerSummary }].map(({ label, row }) => <div key={label}>
        <dt className="text-[#5f6c55]">{label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{net(row)}</dd>
        <dd className="mt-1 break-words leading-5 text-[#5f6c55]">Lordo {euro(row.grossCents)} · rimborsi {euro(row.refundedCents)} · commissioni {fees(row)}</dd>
      </div>)}</dl>
    </article>)}</div>
  </section>;
}

function PaymentFeeGuide() {
  const source = "font-semibold text-[#52694a] underline underline-offset-2";
  return <details className={panel}>
    <summary className="cursor-pointer text-sm font-semibold">Commissioni: tariffe, calcoli e fonti</summary>
    <div className="mt-4 space-y-3 text-xs leading-6 text-[#5f6c55]">
      <p>Listini italiani verificati il 6 novembre 2026. Le commissioni effettive del pagamento hanno sempre precedenza sui calcoli da listino. La quota fissa di elaborazione si applica una volta al pagamento, anche se comprende più persone, attività e cena; il supplemento Tap to Pay segue le autorizzazioni.</p>
      <ul className="list-disc space-y-2 pl-4">
        <li><strong>Stripe online, incluso Link:</strong> carte SEE standard 1,5% + 0,25 €; premium SEE 2,8% + 0,25 €; Regno Unito 2,5% + 0,25 €; altre carte internazionali 3,15% + 0,25 €. Cambio valuta, quando necessario: +2%. Gli esempi verificati di Link e carta online da 65,00 € hanno entrambi 1,23 € di elaborazione + 0,05 € di Radar = 1,28 € di commissioni e 63,72 € netti. <a className={source} href="https://stripe.com/it/pricing" target="_blank" rel="noopener noreferrer">Tariffe Stripe</a>.</li>
        <li><strong>Stripe Tap to Pay:</strong> Terminal 1,4% + 0,10 € per carte SEE e Regno Unito, 2,9% + 0,10 € per tutte le altre carte; si aggiungono 0,10 € per autorizzazione Tap to Pay. Per i POS registrati senza commissione effettiva, il calcolo da listino assume una carta SEE e una sola autorizzazione: 1,4% + 0,20 €. <a className={source} href="https://stripe.com/it/pricing#terminal" target="_blank" rel="noopener noreferrer">Tariffe Terminal e Tap to Pay</a>.</li>
        <li><strong>PayPal dentro Stripe:</strong> Stripe applica 0,2% + 0,10 €, oltre alle commissioni PayPal. Il listino PayPal italiano standard nazionale/SEE è 3,4% + 0,35 €: riferimento di base 3,6% + 0,45 €, prima di eventuali costi Radar. Se gli incassi sono accreditati su PayPal, l’eventuale quota PayPal non disponibile è calcolata da listino separatamente dalla commissione Stripe già verificata solo in assenza di conversione valutaria. <a className={source} href="https://stripe.com/it/pricing/local-payment-methods" target="_blank" rel="noopener noreferrer">Tariffe PayPal su Stripe</a> · <a className={source} href="https://www.paypal.com/it/business/paypal-business-fees" target="_blank" rel="noopener noreferrer">Tariffe PayPal Italia</a>.</li>
      </ul>
      <p>Nell’esempio Tap to Pay da 65,00 €, Stripe mostra 1,01 € di commissioni di elaborazione e 63,99 € netti. Il calcolo mantiene questi importi effettivi. Lo screenshot non mostra un ulteriore addebito di autorizzazione: un eventuale costo separato deve essere verificato nella rendicontazione, senza aggiungerlo automaticamente alla commissione già letta.</p>
      <p>Le commissioni effettive comprendono anche gli eventuali costi Radar già addebitati sul pagamento, conteggiati una sola volta. Esempio PayPal verificato: su 65,00 €, Stripe 0,23 € + Radar 0,05 € + PayPal 2,56 € = 2,84 € di commissioni e 62,16 € netti. Radar dipende dai controlli eseguiti e dal piano dell’account; i 0,05 € dell’esempio non si aggiungono automaticamente a tutti i pagamenti. <a className={source} href="https://docs.stripe.com/radar/how-radar-works" target="_blank" rel="noopener noreferrer">Come viene addebitato Radar</a>.</p>
      <p><strong>Valute estere e Adaptive Pricing:</strong> il cliente può pagare in PLN mentre il report resta in euro. Nell’esempio PayPal polacco, 85,00 € lordi e 81,37 € netti corrispondono a 3,63 € di commissioni complessive. I dettagli mostrano 14,62 PLN e 0,32 €: importi in valute diverse non si sommano direttamente. Per i totali vale la rendicontazione effettiva in euro di Stripe, che comprende già le commissioni convertite; non si aggiungono di nuovo i dettagli, un cambio corrente o un 2% automatico. In assenza di importi in euro verificabili, il totale resta da verificare. <a className={source} href="https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing?payment-ui=stripe-hosted" target="_blank" rel="noopener noreferrer">Adaptive Pricing e valute del pagamento</a>.</p>
      <p>I calcoli da listino sono da confermare e possono differire per carte estere, pagamenti internazionali, cambio valuta o accordi tariffari personalizzati. Non includono costi separati per autorizzazioni aggiuntive o non riuscite, contestazioni e altre voci fatturate a parte. Un rimborso non azzera automaticamente la commissione del pagamento originale; si considerano soltanto gli storni effettivi delle commissioni.</p>
    </div>
  </details>;
}

export function AnalyticsDashboard({ data, fixedEventId }: { data: AdminAnalytics; fixedEventId?: string }) {
  const eventId = fixedEventId || data.filters.eventId;
  const selectedEvent = data.events.find(event => event.id === eventId);
  const scope = eventId ? `?event=${eventId}` : "";
  const metrics = data.metrics;
  const registrations = data.registrationSummary;
  const dinner = data.dinnerSummary;
  const kpis = [
    { label: "Vendite lorde", value: euro(registrations.grossCents), detail: "Attività, cena esclusa" },
    { label: "Rimborsi", value: euro(registrations.refundedCents), detail: "Rimborsi delle attività" },
    { label: "Commissioni di pagamento", value: fees(registrations), detail: feeDetail(registrations) },
    { label: "Incassi netti", value: net(registrations), detail: `Cena esclusa · prima delle commissioni: ${euro(registrations.netCents)}`, highlight: true },
    { label: "Iscritti validi", value: number(registrations.count), detail: "Formula attuale; upgrade già inclusi, rimborsati esclusi" },
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
    <section aria-labelledby="analytics-registration-summary" className={`${panel} space-y-3`}><div><h2 id="analytics-registration-summary" className="text-base font-semibold">Iscrizioni e incassi delle attività</h2><p className="mt-1 text-xs leading-5 text-[#5f6c55]">Cena esclusa. Gli upgrade aggiornano la formula della stessa persona e il relativo incasso, senza creare una nuova iscrizione.</p></div><MetricCards items={kpis} /></section>
    {registrations.missingFeePayments > 0 && <p role="status" className="rounded-xl border border-[#e5d9bb] bg-[#faf6e9] px-4 py-3 text-xs leading-6 text-[#83714b]">Commissioni delle attività incomplete per {number(registrations.missingFeePayments)} {registrations.missingFeePayments === 1 ? "pagamento" : "pagamenti"}. {registrations.netAfterEstimatedFeesCents != null && (registrations.estimatedFeePayments || 0) > 0 ? "Il netto da confermare comprende le quote mancanti calcolate da listino e deve essere verificato con le commissioni effettive." : "Il netto resta da verificare finché non sono disponibili tutte le commissioni di pagamento."}</p>}
    <section className={panel} aria-labelledby="analytics-dinner-summary"><div className="mb-4 flex flex-wrap items-start justify-between gap-4"><div><h2 id="analytics-dinner-summary" className="text-base font-semibold">Cena</h2><p className="mt-1 text-xs leading-5 text-[#5f6c55]">Conteggio e incassi separati dalle attività, anche quando la cena viene acquistata insieme alla formula.</p></div><dl><div><dt className="text-xs text-[#53654b]">Cene prenotate</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{number(dinner.count)}</dd></div></dl></div><MetricCards items={[
      { label: "Vendite cena", value: euro(dinner.grossCents), detail: "Solo quota cena" },
      { label: "Rimborsi cena", value: euro(dinner.refundedCents), detail: "Rimborsi attribuiti alla cena" },
      { label: "Commissioni cena", value: fees(dinner), detail: feeDetail(dinner) },
      { label: "Incassi netti cena", value: net(dinner), detail: `Dopo rimborsi e commissioni · prima delle commissioni: ${euro(dinner.netCents)}`, highlight: true },
    ]} /></section>
    <PaymentChannels rows={data.paymentChannels || []} />
    <PaymentFeeGuide />
    <RevenueBreakdown rows={data.revenue.filter(row => row.id !== "dinner")} />
    {data.notes.length > 0 && <details className="min-w-0 rounded-xl border border-[#e5dfd1] bg-[#faf8f1] px-4 py-3"><summary className="cursor-pointer text-xs font-semibold text-[#756548]">Come leggere questi dati</summary><ul className="mt-3 space-y-1 break-words text-xs leading-5 text-[#756548]">{data.notes.map(note => <li key={note}>{note}</li>)}</ul></details>}
    <SalesTrend rows={data.trend.map(row => ({ date: row.date, ...row.registrationSummary }))} />
    <div className="grid min-w-0 gap-4 xl:grid-cols-2"><SalesBreakdown title="Formule attive" rows={data.packages} empty="Nessuna formula attiva per gli iscritti del periodo." description="Ogni persona conta una sola volta nella formula attuale. Le iscrizioni interamente rimborsate sono escluse. Gli importi includono gli upgrade, al netto dei rimborsi e prima delle commissioni. Il periodo segue il primo acquisto." /><ActivityAvailability data={data} eventId={eventId} /></div>
    <AffiliateResults data={data} eventId={eventId} />
    <details className={panel}><summary className="cursor-pointer text-sm font-semibold">Scaglioni, aggiunte e pagamenti in attesa</summary><div className="mt-4 grid gap-4 xl:grid-cols-2"><SalesBreakdown title="Scaglioni delle formule attive" rows={data.tiers} empty="Nessuno scaglione attivo per gli iscritti del periodo." /><SalesBreakdown title="Aggiunte attive" rows={data.addons} unit="accessi" empty="Nessuna aggiunta attiva per gli iscritti del periodo." /></div><p className="mt-4 text-xs leading-6 text-[#5f6c55]">Pagamenti in attesa: {number(metrics.pendingOrders)} · Scaduti: {number(metrics.expiredOrders)} · Non riusciti: {number(metrics.failedOrders)}. Questi ordini non contribuiscono agli incassi confermati.</p></details>
    <details className={panel}><summary className="cursor-pointer text-sm font-semibold">Storico contabile complessivo · attività e cena</summary><p className="mt-3 text-xs leading-6 text-[#5f6c55]">Comprende i singoli pagamenti di iscrizioni, upgrade e cena. Questi pagamenti non sono il numero degli iscritti.</p><MetricCards items={[
      { label: "Totale lordo contabile", value: euro(metrics.grossCents), detail: "Attività e cena" },
      { label: "Rimborsi complessivi", value: euro(metrics.refundedCents), detail: "Attività e cena" },
      { label: "Commissioni complessive", value: fees(metrics), detail: "Attività e cena" },
      { label: "Netto contabile complessivo", value: net(metrics), detail: "Attività e cena" },
      { label: "Pagamenti ricevuti", value: number(metrics.paidOrders), detail: "Esclusi gratuiti e interamente rimborsati" },
    ]} /></details>
    {!fixedEventId && <section className={panel}><h2 className="mb-3 text-base font-semibold">Riepilogo per evento</h2>{data.eventStats.length ? <ul className="divide-y divide-[#edf0e9]">{data.eventStats.map(event => <li key={event.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><Link prefetch={false} href={`/admin/eventi/${event.id}/statistiche`} className="break-words text-sm font-semibold text-[#3e593a] hover:underline">{event.title}</Link><p className="mt-1 text-xs text-[#5f6c55]">{day(event.startsAt)} · {statusLabels[event.status]}</p></div><div className="flex flex-wrap gap-x-5 gap-y-1 text-right text-xs text-[#5f6c55]"><span><strong className="block text-sm font-semibold text-[#24382c]">{net(event.registrationSummary)}</strong>Netto attività</span><span><strong className="block text-sm font-semibold text-[#24382c]">{number(event.registrationSummary.count)}</strong>Iscritti attività</span><span><strong className="block text-sm font-semibold text-[#24382c]">{net(event.dinnerSummary)}</strong>Netto cena</span><span><strong className="block text-sm font-semibold text-[#24382c]">{number(event.dinnerSummary.count)}</strong>Cene</span><Link prefetch={false} href={`/admin/eventi/${event.id}/statistiche`} className="self-center font-semibold text-[#526e45]">Statistiche →</Link></div></li>)}</ul> : <p className="py-4 text-sm text-[#5f6c55]">Non ci sono eventi da mostrare.</p>}</section>}
  </div>;
}
