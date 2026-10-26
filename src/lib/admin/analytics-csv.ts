import type { AdminAnalytics, AnalyticsFinancials } from "./analytics-types";

/** Aggregate-only export. Untrusted names remain text when opened in a spreadsheet. */
export function adminAnalyticsCsv(data: AdminAnalytics, includeEvents = true): string {
  type Cell = string | number | null;
  const date = (value: string) => value ? new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value)) : "";
  const state = { draft: "Bozza", upcoming: "In programma", ongoing: "In corso", past: "Concluso", canceled: "Annullato" };
  const financialHeaders = ["Lordo (€)", "Rimborsi (€)", "Netto prima delle commissioni (€)", "Commissioni Stripe / PayPal note (€)", "Netto dopo commissioni (€)", "Stato commissioni"];
  const commissionStatus = (row: AnalyticsFinancials) => row.missingFeePayments ? `Parziali: ${row.missingFeePayments} ${row.missingFeePayments === 1 ? "pagamento" : "pagamenti"} da verificare` : "Complete";
  const afterFees = (row: AnalyticsFinancials) => row.netAfterFeesCents === null ? "Da verificare" : row.netAfterFeesCents / 100;
  const financialCells = (row: AnalyticsFinancials): Cell[] => [row.grossCents / 100, row.refundedCents / 100, row.netCents / 100, row.feesCents / 100, afterFees(row), commissionStatus(row)];
  const rows: Cell[][] = [
    ["Report vendite Meraki"],
    ["Ambito", data.events.find(event => event.id === data.filters.eventId)?.title || "Tutti gli eventi"],
    ["Periodo", data.filters.from ? date(data.filters.from) : "Tutto lo storico", date(data.filters.to)],
    ["Affiliato", data.filters.affiliateId === "direct" ? "Acquisti diretti" : data.affiliateOptions.find(affiliate => affiliate.id === data.filters.affiliateId)?.name || "Tutti gli affiliati e acquisti diretti"],
    ["Criterio", "Acquisti creati nel periodo; rimborsi riferiti agli stessi acquisti, anche se successivi."],
    [], ["Riepilogo", "Valore"],
    ["Lordo (€)", data.metrics.grossCents / 100], ["Rimborsi riusciti (€)", data.metrics.refundedCents / 100], ["Netto prima delle commissioni (€)", data.metrics.netCents / 100],
    ["Commissioni Stripe / PayPal note (€)", data.metrics.feesCents / 100], ["Stato commissioni", commissionStatus(data.metrics)], ["Netto dopo commissioni (€)", afterFees(data.metrics)],
    ["Ordini pagati", data.metrics.paidOrders], ["Iscritti validi", data.metrics.validParticipants], ["Con almeno un check-in", data.metrics.checkedInParticipants],
    ["Contatti in lista d’attesa", data.metrics.waiting === null ? "Non attribuibile all’affiliato" : data.metrics.waiting],
    ["Ordini in attesa", data.metrics.pendingOrders], ["Ordini scaduti", data.metrics.expiredOrders], ["Pagamenti non riusciti", data.metrics.failedOrders],
    [], ["Incassi per attività"], ["Attività", ...financialHeaders],
    ...data.revenue.map(row => [row.name, ...financialCells(row)]),
    [], ["Andamento per giorno di acquisto"], ["Giorno", ...financialHeaders, "Ordini pagati"],
    ...data.trend.map(row => [date(row.date), ...financialCells(row), row.paidOrders]),
  ];
  for (const [title, entries] of [["Formule", data.packages], ["Scaglioni", data.tiers], ["Aggiunte", data.addons]] as const) {
    rows.push([], [title], ["Nome", "Vendite", "Lordo (€)"], ...entries.map(row => [row.name, row.count, row.grossCents / 100]));
  }
  rows.push([], ["Attività: posti residui sugli accessi validi attuali, indipendenti dai filtri; prenotazioni da pagare non sottratte"], ["Evento", "Attività", "Capienza", "Accessi validi", "Check-in", "Posti residui attuali"], ...data.activities.map(row => [row.eventTitle, row.name, row.capacity, row.validAdmissions, row.checkedIn, row.remaining]));
  rows.push([], ["Risultati per affiliato"], ["Evento", "Affiliato", "Iscritti validi", "Check-in", "Ordini pagati", ...financialHeaders], ...data.affiliates.map(row => [row.eventTitle, row.name, row.validParticipants, row.checkedInParticipants, row.paidOrders, ...financialCells(row)]));
  if (includeEvents) rows.push([], ["Riepilogo per evento"], ["Evento", "Data evento", "Stato", ...financialHeaders, "Iscritti validi", "Check-in"], ...data.eventStats.map(row => [row.title, date(row.startsAt), state[row.status], ...financialCells(row), row.validParticipants, row.checkedInParticipants]));
  if (data.notes.length) rows.push([], ["Note sul report"], ...data.notes.map(note => [note]));
  const cell = (value: Cell) => {
    if (value === null) return '"Senza limite"';
    let text = typeof value === "number" ? value.toLocaleString("it-IT", { useGrouping: false, maximumFractionDigits: 2 }) : value;
    if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return "\uFEFF" + rows.map(row => row.map(cell).join(";")).join("\r\n");
}
