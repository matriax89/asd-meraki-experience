import "server-only";
import { requireCommerceStaff } from "@/lib/commerce/admin-auth";
import { getLocalizedText } from "@/lib/i18n-utils";
import { fromRomeInput } from "@/lib/commerce/rome-time";
import { parseEventAffiliates } from "@/lib/events/affiliates";
import { loadPaymentFees } from "@/lib/stripe/payment-fees";
import type { AdminAnalytics, AdminAnalyticsInput, AnalyticsAffiliateRow, AnalyticsBreakdown, AnalyticsEventRow, AnalyticsFinancials, AnalyticsMetrics } from "./analytics-types";

type Event = { id: string; titolo: unknown; data_inizio: string; data_fine: string | null; attivo: boolean | null; canceled_at: string | null; capacity: number | null; affiliates: unknown; activities: unknown };
type FinancialRow = { id: string; event_id: string; amount_cents: number | null; state: string; created_at: string | null; expires_at?: string | null; stripe_payment_intent: string | null; stripe_session_id: string | null; refund_status: string | null; affiliate_id: string | null; affiliate_name: string | null; quote_lines?: unknown; quote_discount?: unknown; snapshot_activities?: unknown; upgrade_pass_id?: string | null };
type Pass = { id: string; event_id: string; order_id: string; status: string; created_at: string; affiliate_id: string | null; affiliate_name: string | null };
type Right = { id: string; event_id: string; pass_id: string; order_id: string; activity_id: string; activity_name: string; status: string; checked_in_at: string | null };
type Ticket = { id: string; event_id: string; status: string | null; amount_cents: number | null; created_at: string | null; used_at: string | null; stripe_payment_intent: string | null; stripe_session_id: string | null; affiliate_id: string | null; affiliate_name: string | null };
type Refund = { id: string; event_id: string; order_id: string | null; ticket_reservation_id: string | null; payment_intent: string; amount_cents: number; status: string; stripe_refund_id: string | null };
type RefundMarker = { payment_intent: string; status?: string };
type Waiting = { id: string; event_id: string; status: string; created_at: string };
type Line = { kind: string; label: string; quantity: number; totalCents: number; discountCents?: number; activityAmounts?: Record<string, number>; packageId?: string; tierId?: string; addonId?: string; activityIds?: string[] };
type RevenueKind = AdminAnalytics["revenue"][number]["id"];
type Payment = { id: string; identity: string; paymentIntent: string | null; sessionId: string | null; kind: "commerce" | "legacy"; eventId: string; createdAt: string | null; affiliateId: string; affiliateName: string; amount: number; refunded: number; captured: boolean; state: string; lines: Line[]; activityKinds: Map<string, RevenueKind>; discountTargets: string[] | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
const day = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : "";
const midnight = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Scegli date valide nel formato giorno/mese/anno.");
  fromRomeInput(`${value}T00:00`);
  return value;
};
const advance = (value: string, days: number) => new Date(Date.parse(`${value}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const emptyFinancials = (): AnalyticsFinancials => ({ grossCents: 0, refundedCents: 0, netCents: 0, feesCents: 0, netAfterFeesCents: 0, missingFeePayments: 0 });
const empty = (waiting: number | null = 0): AnalyticsMetrics => ({ ...emptyFinancials(), paidOrders: 0, validParticipants: 0, checkedInParticipants: 0, waiting, pendingOrders: 0, expiredOrders: 0, failedOrders: 0 });
const amount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const alive = (status: string | null) => status === "valid" || status === "used";
const paid = (status: string | null) => status === "paid" || status === "used";

function filters(input: AdminAnalyticsInput): AdminAnalytics["filters"] {
  const eventId = input.eventId?.trim().toLowerCase() || "";
  const affiliateId = input.affiliateId?.trim().toLowerCase() || "all";
  if (eventId && !uuid.test(eventId)) throw new Error("Seleziona un evento valido.");
  if (!["all", "direct"].includes(affiliateId) && !uuid.test(affiliateId)) throw new Error("Seleziona un affiliato valido.");
  const period = input.period || (input.from || input.to ? "custom" : "all");
  if (!["7", "30", "90", "all", "custom"].includes(period)) throw new Error("Seleziona un periodo valido.");
  const today = day(new Date(Date.now()).toISOString());
  const to = period === "all" ? "" : period === "custom" ? midnight(input.to || today) : today;
  const from = period === "all" ? "" : period === "custom" ? midnight(input.from || to) : advance(to, 1 - Number(period));
  if (from && to && from > to) throw new Error("La data iniziale non può essere successiva alla data finale.");
  return { eventId, affiliateId, period, from, to };
}

async function rows<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>, label: string) {
  const result: T[] = [];
  for (let from = 0; ; from += 500) {
    const response = await query(from, from + 499);
    if (response.error || !response.data) throw new Error(`Impossibile caricare ${label}. Riprova.`);
    result.push(...response.data as T[]);
    if (response.data.length < 500) return result;
  }
}

async function count(query: PromiseLike<{ count: number | null; error: unknown }>, label: string) {
  const result = await query;
  if (result.error || result.count === null || !Number.isSafeInteger(result.count) || result.count < 0) throw new Error(`Impossibile caricare ${label}. Riprova.`);
  return result.count;
}

function lines(value: unknown): Line[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    if (!entry || typeof entry !== "object" || !["package", "upgrade", "addon"].includes(entry.kind) || !Number.isSafeInteger(entry.quantity) || entry.quantity < 1 || !amount(entry.totalCents)) return [];
    if (entry.kind === "upgrade" && entry.tierId === "owned") return [];
    const activityAmounts = entry.activityAmounts && typeof entry.activityAmounts === "object" && !Array.isArray(entry.activityAmounts) && Object.values(entry.activityAmounts).every(amount) ? entry.activityAmounts as Record<string, number> : undefined;
    return [{ kind: entry.kind, label: typeof entry.label === "string" ? entry.label : "Formula", quantity: entry.quantity, totalCents: entry.totalCents, discountCents: amount(entry.discountCents) ? entry.discountCents : undefined, activityAmounts, packageId: typeof entry.packageId === "string" ? entry.packageId : undefined, tierId: typeof entry.tierId === "string" ? entry.tierId : undefined, addonId: typeof entry.addonId === "string" ? entry.addonId : undefined, activityIds: Array.isArray(entry.activityIds) ? [...new Set(entry.activityIds.filter((id: unknown): id is string => typeof id === "string"))] as string[] : [] }];
  });
}

/** Integer cumulative allocation preserves every cent, including signed fee adjustments. */
function split(total: number, weights: number[]): number[] {
  const divisor = weights.reduce((sum, weight) => sum + BigInt(weight), BigInt(0));
  if (!divisor) return weights.map(() => 0);
  let cumulative = BigInt(0); let assigned = 0;
  return weights.map(weight => {
    cumulative += BigInt(weight);
    const next = Number(BigInt(total) * cumulative / divisor);
    const cents = next - assigned; assigned = next; return cents;
  });
}

function activityKinds(value: unknown): Map<string, RevenueKind> {
  const result = new Map<string, RevenueKind>();
  if (Array.isArray(value)) for (const raw of value) if (raw && typeof raw === "object" && typeof raw.id === "string" && ["workshop", "masterclass", "dinner", "extra"].includes(raw.kind)) result.set(raw.id, raw.kind);
  return result;
}

function addFinancials(target: AnalyticsFinancials, gross: number, refunded: number, fees: number, missing: number) {
  target.grossCents += gross; target.refundedCents += refunded; target.netCents += gross - refunded;
  target.feesCents += fees; target.missingFeePayments += missing;
  target.netAfterFeesCents = target.missingFeePayments ? null : target.netCents - target.feesCents;
}

/** Allocate only the captured cents, including historical order-level discounts. */
function allocated(payment: Payment) {
  const total = payment.lines.reduce((sum, line) => sum + line.totalCents, 0);
  const weights = payment.lines.map(line => total ? line.totalCents : 1);
  const cents = split(payment.amount, weights);
  return payment.lines.map((line, index) => ({ line, cents: cents[index] }));
}

function revenueAmounts(payment: Payment, notes: Set<string>): Map<RevenueKind, number> {
  const result = new Map<RevenueKind, number>();
  const add = (kind: RevenueKind, cents: number) => result.set(kind, (result.get(kind) || 0) + cents);
  if (!payment.lines.length) add("unallocated", payment.amount);
  for (const { line, cents } of allocated(payment)) {
    const ids = line.activityIds || [];
    if (!ids.length) { add("unallocated", cents); continue; }
    const recorded = line.activityAmounts;
    const explicit = recorded && ids.every(id => amount(recorded[id])) && Object.keys(recorded).length === ids.length;
    const originalCents = line.totalCents + (line.discountCents || 0);
    let weights = explicit ? ids.map(id => recorded[id]) : ids.map((_, index) => Math.floor(originalCents / ids.length) + (index < originalCents % ids.length ? 1 : 0));
    if (!explicit && ids.length > 1 && cents > 0) notes.add("Per le formule storiche senza ripartizione registrata, l’importo è diviso in parti uguali tra le attività incluse, con arrotondamento al centesimo.");
    if (line.discountCents) {
      const eligible = ids.map((id, index) => !payment.discountTargets || payment.discountTargets.includes(id) ? weights[index] : 0);
      const eligibleTotal = eligible.reduce((sum, value) => sum + value, 0);
      const reductions = split(Math.min(line.discountCents, eligibleTotal), eligible);
      weights = weights.map((weight, index) => weight - reductions[index]);
    }
    if (!weights.some(Boolean)) {
      if (cents > 0) { add("unallocated", cents); continue; }
      weights = ids.map(() => 1);
    }
    const amounts = split(cents, weights);
    ids.forEach((id, index) => add(payment.activityKinds.get(id) || "unallocated", amounts[index]));
  }
  if ((result.get("unallocated") || 0) > 0) notes.add("Gli acquisti senza un’attività identificabile sono inclusi in «Non attribuito», senza assegnarli arbitrariamente a masterclass, workshop o cena.");
  return result;
}

/** Staff-only financial reporting. All outputs are explicit DTOs without customer identities or payment capabilities. */
export async function loadAdminAnalytics(input: AdminAnalyticsInput): Promise<AdminAnalytics> {
  const db = await requireCommerceStaff();
  const selected = filters(input);
  const eventRows = await rows<Event>((from, to) => db.from("events").select("id,titolo,data_inizio,data_fine,attivo,canceled_at,capacity,affiliates,activities:commerce_config->activities").order("data_inizio", { ascending: false }).order("id").range(from, to), "gli eventi");
  if (selected.eventId && !eventRows.some(event => event.id === selected.eventId)) throw new Error("Evento non disponibile.");
  const scopedEvents = eventRows.filter(event => !selected.eventId || event.id === selected.eventId);
  const eventMap = new Map(scopedEvents.map(event => [event.id, event]));
  const read = <T>(table: string, fields: string, label: string, global = false) => rows<T>((from, to) => {
    let query = db.from(table).select(fields);
    if (selected.eventId && !global) query = query.eq("event_id", selected.eventId);
    return query.order(global ? "payment_intent" : "id").range(from, to);
  }, label);
  const [orders, reservations, passes, rights, tickets, refunds, commerceRefunds, ticketRefunds, waitlist, newLeads, openShopOrders, confirmedContacts] = await Promise.all([
    read<FinancialRow>("commerce_orders", "id,event_id,state,amount_cents,created_at,expires_at,stripe_payment_intent,stripe_session_id,refund_status,affiliate_id,affiliate_name,upgrade_pass_id,quote_lines:quote->lines,quote_discount:quote->discount,snapshot_activities:event_snapshot->commerce_config->activities", "gli acquisti"),
    read<FinancialRow>("ticket_reservations", "id,event_id,state,amount_cents,created_at,expires_at,stripe_payment_intent,stripe_session_id,refund_status,affiliate_id,affiliate_name", "gli acquisti precedenti"),
    read<Pass>("commerce_passes", "id,event_id,order_id,status,created_at,affiliate_id,affiliate_name", "i partecipanti"),
    read<Right>("commerce_entitlements", "id,event_id,pass_id,order_id,activity_id,activity_name,status,checked_in_at", "gli accessi"),
    read<Ticket>("tickets", "id,event_id,status,amount_cents,created_at,used_at,stripe_payment_intent,stripe_session_id,affiliate_id,affiliate_name", "i biglietti precedenti"),
    read<Refund>("meraki_refunds", "id,event_id,order_id,ticket_reservation_id,payment_intent,amount_cents,status,stripe_refund_id", "i rimborsi"),
    read<RefundMarker>("commerce_payment_refunds", "payment_intent,status", "i rimborsi precedenti", true),
    read<RefundMarker>("ticket_payment_refunds", "payment_intent", "i rimborsi dei biglietti precedenti", true),
    read<Waiting>("commerce_waitlist", "id,event_id,status,created_at", "la lista d’attesa"),
    count(db.from("leads").select("id", { count: "exact", head: true }).eq("status", "nuovo"), "le nuove richieste"),
    count(db.from("orders").select("id", { count: "exact", head: true }).in("status", ["pending", "paid", "processing"]), "gli ordini da gestire"),
    count(db.from("marketing_contacts").select("id", { count: "exact", head: true }).eq("status", "subscribed"), "i contatti confermati"),
  ]);
  const notes = new Set([
    "Il periodo segue il giorno italiano di creazione dell’acquisto (Europe/Rome), non la data di accredito Stripe. I rimborsi riusciti si riferiscono a quegli acquisti anche quando avvenuti successivamente.",
    "Il netto dopo le commissioni sottrae dal lordo i rimborsi riusciti e le commissioni effettive di pagamento Stripe, comprese quelle disponibili per PayPal. Non sottrae imposte o altri costi. Gli ordini gratuiti non aumentano il conteggio degli ordini pagati.",
    "Gli importi di masterclass, workshop e cena seguono la ripartizione salvata nell’acquisto; rimborsi e commissioni del pagamento sono distribuiti in proporzione agli importi delle attività, con arrotondamento al centesimo.",
    "Ogni biglietto/pass valido conta una persona nel periodo di creazione dell’acquisto iniziale. Gli upgrade aumentano gli incassi senza creare un nuovo partecipante. I check-in sono lo stato attuale di queste persone.",
    "La disponibilità residua usa tutti gli accessi attualmente validi, indipendentemente dai filtri su acquisti e affiliati; non comprende prenotazioni temporanee ancora da pagare.",
    "Formule e scaglioni contano vendite e cambi formula; le aggiunte già possedute durante un upgrade non sono conteggiate di nuovo.",
  ]);
  if (selected.affiliateId !== "all") notes.add("La lista d’attesa non è attribuita agli affiliati: il dato non è disponibile con questo filtro.");
  const inPeriod = (createdAt: string | null) => {
    const date = day(createdAt);
    if (!date) { notes.add("Alcuni record storici non hanno una data d’acquisto: sono inclusi soltanto nel periodo completo e non nell’andamento giornaliero."); return selected.period === "all"; }
    return (!selected.from || date >= selected.from) && (!selected.to || date <= selected.to);
  };
  const inAffiliate = (id: string | null) => selected.affiliateId === "all" || (selected.affiliateId === "direct" ? !id : id === selected.affiliateId);
  const title = (eventId: string) => getLocalizedText(eventMap.get(eventId)?.titolo, input.locale) || "Evento";
  const metrics = empty(selected.affiliateId === "all" ? 0 : null);
  const eventStats = new Map<string, AnalyticsEventRow>();
  for (const event of scopedEvents) {
    const now = Date.now();
    const status = event.canceled_at ? "canceled" : !event.attivo ? "draft" : Date.parse(event.data_fine || event.data_inizio) <= now ? "past" : Date.parse(event.data_inizio) <= now ? "ongoing" : "upcoming";
    const capacity = amount(event.capacity) ? event.capacity : null;
    eventStats.set(event.id, { ...empty(metrics.waiting), id: event.id, title: title(event.id), startsAt: event.data_inizio, endsAt: event.data_fine, status, capacity, remaining: capacity });
  }
  const affiliateRows = new Map<string, AnalyticsAffiliateRow>();
  const affiliateOptions = new Map<string, string>();
  const affiliate = (eventId: string, id: string | null, snapshotName?: string | null) => {
    const affiliation = id || "direct";
    const key = `${eventId}:${affiliation}`;
    let row = affiliateRows.get(key);
    if (!row) {
      row = { ...emptyFinancials(), id: affiliation, eventId, eventTitle: title(eventId), name: affiliation === "direct" ? "Acquisti diretti" : snapshotName || "Affiliato archiviato", validParticipants: 0, checkedInParticipants: 0, paidOrders: 0 };
      affiliateRows.set(key, row);
    }
    if (id && !affiliateOptions.has(id)) affiliateOptions.set(id, row.name);
    return row;
  };
  for (const event of scopedEvents) for (const configured of parseEventAffiliates(event.affiliates)) affiliate(event.id, configured.id, configured.name);
  for (const record of [...orders, ...reservations, ...passes, ...tickets]) if (eventMap.has(record.event_id)) affiliate(record.event_id, record.affiliate_id, record.affiliate_name);
  if (!["all", "direct"].includes(selected.affiliateId) && !affiliateOptions.has(selected.affiliateId)) throw new Error("Affiliato non disponibile per questi eventi.");
  const fullRefunds = new Set([...commerceRefunds.filter(refund => refund.status === "succeeded"), ...ticketRefunds].map(refund => refund.payment_intent));
  const refundTotals = new Map<string, number>();
  const seenRefunds = new Set<string>();
  for (const refund of refunds.filter(refund => refund.status === "succeeded")) {
    const key = refund.stripe_refund_id || refund.id;
    if (seenRefunds.has(key)) continue;
    seenRefunds.add(key);
    if (!amount(refund.amount_cents)) throw new Error("Importo di rimborso non valido. Verifica il registro rimborsi.");
    for (const identity of [refund.payment_intent ? `pi:${refund.payment_intent}` : "", refund.order_id ? `commerce:${refund.order_id}` : "", refund.ticket_reservation_id ? `legacy:${refund.ticket_reservation_id}` : ""].filter(Boolean)) refundTotals.set(identity, (refundTotals.get(identity) || 0) + refund.amount_cents);
  }
  const paymentRows = new Map<string, Payment>();
  // Older rows can store only a Checkout session while a later ticket knows
  // its payment intent. Resolve that shared identity before any aggregation.
  const intentsBySession = new Map<string, string>();
  for (const record of [...orders, ...reservations, ...tickets]) if (record.stripe_session_id && record.stripe_payment_intent) {
    const known = intentsBySession.get(record.stripe_session_id);
    if (known && known !== record.stripe_payment_intent) throw new Error("Identità di pagamento incoerenti. Verifica gli acquisti storici.");
    intentsBySession.set(record.stripe_session_id, record.stripe_payment_intent);
  }
  const ticketBySession = new Map(tickets.filter(ticket => ticket.stripe_session_id).map(ticket => [ticket.stripe_session_id!, ticket]));
  const ticketByIntent = new Map(tickets.filter(ticket => ticket.stripe_payment_intent).map(ticket => [ticket.stripe_payment_intent!, ticket]));
  const passOrders = new Set(passes.map(pass => pass.order_id));
  const makePayment = (row: FinancialRow, kind: "commerce" | "legacy", fallbackTicket?: Ticket) => {
    if (!eventMap.has(row.event_id)) return;
    const session = row.stripe_session_id || fallbackTicket?.stripe_session_id;
    const intent = row.stripe_payment_intent || fallbackTicket?.stripe_payment_intent || (session ? intentsBySession.get(session) : null);
    const identity = intent ? `pi:${intent}` : session ? `session:${session}` : `${kind}:${row.id}`;
    if (paymentRows.has(identity)) return;
    if (!amount(row.amount_cents)) { notes.add("Alcuni biglietti storici non hanno un importo registrato: sono esclusi dagli incassi, ma restano nei conteggi dei partecipanti."); return; }
    const settled = Math.max(refundTotals.get(`${kind}:${row.id}`) || 0, intent ? refundTotals.get(`pi:${intent}`) || 0 : 0);
    const full = row.state === "refunded" || fallbackTicket?.status === "refunded" || Boolean(intent && fullRefunds.has(intent));
    const captured = row.state === "fulfilled" || full || settled > 0 || (kind === "commerce" ? passOrders.has(row.id) : Boolean(fallbackTicket && paid(fallbackTicket.status))) || (["refund_required", "refund_pending"].includes(row.state) && Boolean(intent));
    const quoteLines = kind === "commerce" ? lines(row.quote_lines) : [{ kind: "package", label: "Ingresso evento", quantity: 1, totalCents: row.amount_cents, packageId: "legacy", tierId: "legacy" }];
    if (captured && !quoteLines.length && row.amount_cents > 0) notes.add("Alcuni acquisti storici non hanno righe prodotto leggibili: gli incassi sono inclusi nel totale ma non nel dettaglio delle formule.");
    const state = row.state === "reserved" && row.expires_at && Date.parse(row.expires_at) <= Date.now() ? "expired" : row.state;
    const discount = row.quote_discount && typeof row.quote_discount === "object" ? row.quote_discount as { targetType?: unknown; targetIds?: unknown } : null;
    const frozenKinds = activityKinds(row.snapshot_activities);
    // Current configuration is only a fallback when no frozen activity list exists.
    const kinds = Array.isArray(row.snapshot_activities) ? frozenKinds : activityKinds(eventMap.get(row.event_id)?.activities);
    paymentRows.set(identity, { id: row.id, identity, paymentIntent: intent || null, sessionId: session || null, kind, eventId: row.event_id, createdAt: row.created_at, affiliateId: row.affiliate_id || "direct", affiliateName: row.affiliate_name || "Acquisti diretti", amount: row.amount_cents, refunded: Math.min(row.amount_cents, full ? row.amount_cents : settled), captured, state, lines: quoteLines, activityKinds: kinds, discountTargets: discount?.targetType === "activity" && Array.isArray(discount.targetIds) ? discount.targetIds.filter((id): id is string => typeof id === "string") : null });
  };
  for (const order of orders) makePayment(order, "commerce");
  for (const reservation of reservations) makePayment(reservation, "legacy", ticketBySession.get(reservation.stripe_session_id || "") || ticketByIntent.get(reservation.stripe_payment_intent || ""));
  for (const ticket of tickets) {
    if (!paid(ticket.status) && ticket.status !== "refunded") continue;
    makePayment({ ...ticket, state: ticket.status === "refunded" ? "refunded" : "fulfilled", refund_status: null }, "legacy", ticket);
  }
  const scopedPayments = [...paymentRows.values()].filter(payment => inPeriod(payment.createdAt) && inAffiliate(payment.affiliateId === "direct" ? null : payment.affiliateId));
  const paymentFees = await loadPaymentFees(scopedPayments.filter(payment => payment.captured && payment.amount > 0).map(payment => ({ id: payment.identity, paymentIntent: payment.paymentIntent, sessionId: payment.sessionId, amountCents: payment.amount, refundedCents: payment.refunded })));
  const trend = new Map<string, AdminAnalytics["trend"][number]>();
  const revenue = new Map<RevenueKind, AdminAnalytics["revenue"][number]>();
  const revenueNames: Record<RevenueKind, string> = { masterclass: "Masterclass", workshop: "Workshop", dinner: "Cena", extra: "Altre attività", unallocated: "Non attribuito" };
  const revenueRow = (id: RevenueKind) => {
    let row = revenue.get(id);
    if (!row) { row = { id, name: revenueNames[id], ...emptyFinancials() }; revenue.set(id, row); }
    return row;
  };
  for (const id of ["masterclass", "workshop", "dinner"] as const) revenueRow(id);
  const breakdowns = { packages: new Map<string, AnalyticsBreakdown>(), tiers: new Map<string, AnalyticsBreakdown>(), addons: new Map<string, AnalyticsBreakdown>() };
  const increment = (collection: keyof typeof breakdowns, id: string, name: string, count: number, grossCents: number) => {
    const current = breakdowns[collection].get(id) || { id, name, count: 0, grossCents: 0 };
    current.count += count; current.grossCents += grossCents; breakdowns[collection].set(id, current);
  };
  for (const payment of scopedPayments) {
    const event = eventStats.get(payment.eventId)!;
    if (!payment.captured) {
      const key = ["reserved", "awaiting_payment"].includes(payment.state) ? "pendingOrders" : payment.state === "expired" ? "expiredOrders" : payment.state === "payment_failed" ? "failedOrders" : null;
      if (key) { metrics[key] += 1; event[key] += 1; }
      continue;
    }
    const fee = payment.amount === 0 ? { feeCents: 0, complete: true } : paymentFees.get(payment.identity) || { feeCents: 0, complete: false };
    if (!fee.complete) notes.add("Alcune commissioni non sono ancora disponibili o verificabili: sono mostrate solo le commissioni note e il netto dopo le commissioni resta non disponibile per gli importi interessati.");
    const affiliateRow = affiliate(payment.eventId, payment.affiliateId === "direct" ? null : payment.affiliateId, payment.affiliateName);
    for (const item of [metrics, event, affiliateRow]) {
      addFinancials(item, payment.amount, payment.refunded, fee.feeCents, fee.complete ? 0 : 1);
      if (payment.amount > 0) item.paidOrders += 1;
    }
    const date = day(payment.createdAt);
    if (date) {
      const current = trend.get(date) || { date, ...emptyFinancials(), paidOrders: 0 };
      addFinancials(current, payment.amount, payment.refunded, fee.feeCents, fee.complete ? 0 : 1);
      current.paidOrders += payment.amount > 0 ? 1 : 0; trend.set(date, current);
    }
    const categories = [...revenueAmounts(payment, notes)];
    const categoryWeights = categories.map(([, cents]) => cents);
    const categoryRefunds = split(payment.refunded, categoryWeights);
    const categoryFees = split(fee.feeCents, categoryWeights);
    categories.forEach(([id, gross], index) => addFinancials(revenueRow(id), gross, categoryRefunds[index], categoryFees[index], !fee.complete && gross > 0 ? 1 : 0));
    for (const { line, cents } of allocated(payment)) {
      const prefix = selected.eventId ? "" : `${title(payment.eventId)} · `;
      const packageId = `${payment.eventId}:${line.packageId || line.label}`;
      if (line.kind === "addon") increment("addons", `${payment.eventId}:${line.addonId || line.activityIds?.join("+") || line.label}`, `${prefix}${line.label}`, line.quantity, cents);
      else {
        increment("packages", packageId, `${prefix}${line.label.split(" · ")[0]}`, line.quantity, cents);
        if (line.tierId) increment("tiers", `${packageId}:${line.tierId}`, `${prefix}${line.label}`, line.quantity, cents);
      }
    }
  }
  const rightsByPass = new Map<string, Right[]>();
  const originalOrders = new Map(orders.map(order => [order.id, order]));
  const reservationsBySession = new Map(reservations.filter(reservation => reservation.stripe_session_id).map(reservation => [reservation.stripe_session_id!, reservation]));
  const reservationsByIntent = new Map(reservations.filter(reservation => reservation.stripe_payment_intent).map(reservation => [reservation.stripe_payment_intent!, reservation]));
  for (const right of rights) {
    const current = rightsByPass.get(right.pass_id) || [];
    current.push(right); rightsByPass.set(right.pass_id, current);
  }
  const occupancy = new Map<string, number>();
  const activityOccupancy = new Map<string, Set<string>>();
  const activityCounts = new Map<string, { name: string; eventId: string; participants: Set<string>; checked: Set<string> }>();
  for (const event of scopedEvents) if (Array.isArray(event.activities)) for (const raw of event.activities) {
    if (raw && typeof raw === "object" && typeof raw.id === "string") activityCounts.set(`${event.id}:${raw.id}`, { name: typeof raw.name === "string" ? raw.name : "Attività", eventId: event.id, participants: new Set(), checked: new Set() });
  }
  const addPerson = (eventId: string, affiliateId: string | null, name: string | null, checkedIn: boolean) => {
    metrics.validParticipants += 1; eventStats.get(eventId)!.validParticipants += 1;
    const row = affiliate(eventId, affiliateId, name);
    row.validParticipants += 1;
    if (checkedIn) { metrics.checkedInParticipants += 1; eventStats.get(eventId)!.checkedInParticipants += 1; row.checkedInParticipants += 1; }
  };
  for (const pass of passes) {
    const event = eventMap.get(pass.event_id);
    const currentRights = (rightsByPass.get(pass.id) || []).filter(right => alive(right.status));
    if (!event || event.canceled_at || pass.status !== "paid" || !currentRights.length) continue;
    occupancy.set(event.id, (occupancy.get(event.id) || 0) + 1);
    const scoped = inPeriod(originalOrders.get(pass.order_id)?.created_at || pass.created_at) && inAffiliate(pass.affiliate_id);
    if (scoped) addPerson(event.id, pass.affiliate_id, pass.affiliate_name, currentRights.some(right => right.status === "used"));
    for (const right of currentRights) {
      const key = `${event.id}:${right.activity_id}`;
      const seats = activityOccupancy.get(key) || new Set<string>(); seats.add(pass.id); activityOccupancy.set(key, seats);
      const counter = activityCounts.get(key) || { name: right.activity_name, eventId: event.id, participants: new Set<string>(), checked: new Set<string>() };
      if (scoped) { counter.participants.add(pass.id); if (right.status === "used") counter.checked.add(pass.id); }
      activityCounts.set(key, counter);
    }
  }
  for (const ticket of tickets) {
    const event = eventMap.get(ticket.event_id);
    if (!event || event.canceled_at || !paid(ticket.status)) continue;
    occupancy.set(event.id, (occupancy.get(event.id) || 0) + 1);
    const reservation = reservationsBySession.get(ticket.stripe_session_id || "") || reservationsByIntent.get(ticket.stripe_payment_intent || "");
    if (inPeriod(reservation?.created_at || ticket.created_at) && inAffiliate(ticket.affiliate_id)) addPerson(event.id, ticket.affiliate_id, ticket.affiliate_name, ticket.status === "used");
  }
  for (const entry of waitlist) if (selected.affiliateId === "all" && eventMap.has(entry.event_id) && entry.status === "waiting" && inPeriod(entry.created_at)) {
    metrics.waiting! += 1; eventStats.get(entry.event_id)!.waiting! += 1;
  }
  for (const event of eventStats.values()) event.remaining = event.capacity === null ? null : Math.max(0, event.capacity - (occupancy.get(event.id) || 0));
  const activities = [...activityCounts].map(([key, counter]) => {
    const event = eventMap.get(counter.eventId)!;
    const raw = Array.isArray(event.activities) ? event.activities.find(activity => activity && typeof activity === "object" && activity.id === key.slice(event.id.length + 1)) : null;
    const capacity = raw && amount(raw.capacity) ? raw.capacity : null;
    return { id: key.slice(event.id.length + 1), eventId: event.id, eventTitle: title(event.id), name: counter.name, capacity, validAdmissions: counter.participants.size, checkedIn: counter.checked.size, remaining: capacity === null ? null : Math.max(0, capacity - (activityOccupancy.get(key)?.size || 0)) };
  });
  if (selected.from && selected.to) {
    for (let date = selected.from, count = 0; date <= selected.to && count < 3660; date = advance(date, 1), count += 1) if (!trend.has(date)) trend.set(date, { date, ...emptyFinancials(), paidOrders: 0 });
    if (advance(selected.from, 3660) <= selected.to) notes.add("Per intervalli oltre dieci anni l’andamento mantiene tutti i giorni con vendite e omette parte dei giorni senza acquisti.");
  }
  const breakdown = (collection: keyof typeof breakdowns) => [...breakdowns[collection].values()].sort((a, b) => b.grossCents - a.grossCents || a.name.localeCompare(b.name, "it"));
  return {
    filters: selected, events: eventRows.map(event => ({ id: event.id, title: getLocalizedText(event.titolo, input.locale) || "Evento", startsAt: event.data_inizio })),
    affiliateOptions: [...affiliateOptions].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "it")), metrics,
    operations: { newLeads, openShopOrders, confirmedContacts },
    trend: [...trend.values()].sort((a, b) => a.date.localeCompare(b.date)), revenue: [...revenue.values()], packages: breakdown("packages"), tiers: breakdown("tiers"), addons: breakdown("addons"), activities,
    affiliates: [...affiliateRows.values()].filter(row => inAffiliate(row.id === "direct" ? null : row.id)).sort((a, b) => b.netCents - a.netCents || a.name.localeCompare(b.name, "it")), eventStats: [...eventStats.values()], notes: [...notes],
  };
}
