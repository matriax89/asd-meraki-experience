import "server-only";
import { z } from "zod";
import { requireCommerceStaff } from "@/lib/commerce/admin-auth";
import { getLocalizedText } from "@/lib/i18n-utils";
import { fromRomeInput } from "@/lib/commerce/rome-time";
import { parseEventAffiliates } from "@/lib/events/affiliates";
import { affiliateCommissionValueSchema, type AffiliateCommissionValue } from "@/lib/events/affiliate-commissions";
import { loadPaymentFees } from "@/lib/stripe/payment-fees";
import type { AdminAnalytics, AdminAnalyticsInput, AnalyticsAffiliateRow, AnalyticsBreakdown, AnalyticsEventRow, AnalyticsFinancials, AnalyticsMetrics } from "./analytics-types";

type Event = { id: string; titolo: unknown; data_inizio: string; data_fine: string | null; attivo: boolean | null; canceled_at: string | null; capacity: number | null; affiliates: unknown; activities: unknown };
type FinancialRow = { id: string; event_id: string; amount_cents: number | null; state: string; created_at: string | null; expires_at?: string | null; demand?: unknown; stripe_payment_intent: string | null; stripe_session_id: string | null; refund_status: string | null; affiliate_id: string | null; affiliate_name: string | null; quote_lines?: unknown; quote_discount?: unknown; quote_discount_exclusions?: unknown; reporting_quote?: unknown; snapshot_activities?: unknown; upgrade_pass_id?: string | null };
type Pass = { id: string; event_id: string; order_id: string; participant_index?: number | null; package_id?: string; package_name?: string; package_activity_ids?: string[]; status: string; created_at: string; affiliate_id: string | null; affiliate_name: string | null };
type Right = { id: string; event_id: string; pass_id: string; order_id: string; activity_id: string; activity_name: string; kind?: string; status: string; checked_in_at: string | null };
type AffiliateCommission = { event_id: string; affiliate_id: string; commission_type?: string; commission_cents: number; commission_credits?: number };
type Ticket = { id: string; event_id: string; status: string | null; amount_cents: number | null; created_at: string | null; used_at: string | null; stripe_payment_intent: string | null; stripe_session_id: string | null; affiliate_id: string | null; affiliate_name: string | null };
type Refund = { id: string; event_id: string; order_id: string | null; ticket_reservation_id: string | null; payment_intent: string; amount_cents: number; status: string; stripe_refund_id: string | null; revoke_entitlement_ids?: string[] };
type RefundMarker = { payment_intent: string; status?: string };
type Waiting = { id: string; event_id: string; status: string; created_at: string };
type Line = { kind: string; label: string; quantity: number; totalCents: number; discountCents?: number; activityAmounts?: Record<string, number>; packageId?: string; tierId?: string; addonId?: string; activityIds?: string[]; participantIndex?: number };
type RevenueKind = AdminAnalytics["revenue"][number]["id"];
type Payment = { id: string; identity: string; paymentIntent: string | null; sessionId: string | null; kind: "commerce" | "legacy"; eventId: string; createdAt: string | null; affiliateId: string; affiliateName: string; amount: number; refunded: number; captured: boolean; state: string; lines: Line[]; activityKinds: Map<string, RevenueKind>; discountTargets: string[] | null; discountExcludedActivityIds: string[]; upgradePassId?: string | null; allocatedLines?: { line: Line; cents: number }[] };
type PaymentAttribution = { affiliateId: string; affiliateName: string; amount: number; refunded: number; lineIndices: Set<number> };
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
    return [{ kind: entry.kind, label: typeof entry.label === "string" ? entry.label : "Formula", quantity: entry.quantity, totalCents: entry.totalCents, discountCents: amount(entry.discountCents) ? entry.discountCents : undefined, activityAmounts, packageId: typeof entry.packageId === "string" ? entry.packageId : undefined, tierId: typeof entry.tierId === "string" ? entry.tierId : undefined, addonId: typeof entry.addonId === "string" ? entry.addonId : undefined, participantIndex: Number.isSafeInteger(entry.participantIndex) && entry.participantIndex >= 0 ? entry.participantIndex : undefined, activityIds: Array.isArray(entry.activityIds) ? [...new Set(entry.activityIds.filter((id: unknown): id is string => typeof id === "string"))] as string[] : [] }];
  });
}

const reportingAmount = z.number().int().min(0).max(10_000_000);
const activityIdsSchema = z.array(z.string().min(1).max(64)).max(30).refine(ids => new Set(ids).size === ids.length);
const reportingLineSchema = z.object({
  kind: z.enum(["package", "addon"]), label: z.string().min(1), quantity: z.literal(1),
  unitAmountCents: reportingAmount, totalCents: reportingAmount, subtotalCents: reportingAmount, discountCents: reportingAmount,
  activityIds: activityIdsSchema.nonempty(), activityAmounts: z.record(z.string(), reportingAmount),
  packageId: z.string().min(1).optional(), tierId: z.string().min(1).optional(), addonId: z.string().min(1).optional(), participantIndex: z.number().int().min(0).max(19),
});
const reportingDiscountSchema = z.object({
  id: z.string().uuid(), code: z.string().min(1), discountType: z.literal("fixed_amount"), discountValue: reportingAmount,
  targetType: z.enum(["order", "package"]), targetIds: activityIdsSchema, eligibleCents: reportingAmount,
});
const reportingQuoteSchema = z.object({
  totalCents: reportingAmount, subtotalCents: reportingAmount, discountCents: reportingAmount,
  lines: z.array(reportingLineSchema).min(1).max(620), discount: reportingDiscountSchema,
  discountExcludedActivityIds: activityIdsSchema.nonempty(),
  reportingAdjustment: z.object({ version: z.literal(1), reason: z.literal("dinner_full_price"), originalDiscountTargetType: z.literal("order"), preservedTotalCents: reportingAmount }),
});

/** Private accounting correction: the paid quote and captured amount remain authoritative. */
function reportingQuote(row: FinancialRow, kinds: Map<string, RevenueKind>) {
  if (row.reporting_quote === null || row.reporting_quote === undefined) return null;
  const corrected = reportingQuoteSchema.safeParse(row.reporting_quote);
  const originalLines = z.array(reportingLineSchema).min(1).max(620).safeParse(row.quote_lines);
  const originalDiscount = reportingDiscountSchema.safeParse(row.quote_discount);
  const invalid = () => { throw new Error("Ripartizione contabile non verificabile. Controlla la rettifica dell’acquisto prima di consultare il report."); };
  if (!corrected.success || !originalLines.success || !originalDiscount.success) return invalid();
  const quote = corrected.data; const before = originalLines.data; const discount = originalDiscount.data;
  const sum = (entries: number[]) => entries.reduce((total, value) => total + value, 0);
  const validLine = (entry: z.infer<typeof reportingLineSchema>) => entry.unitAmountCents === entry.totalCents && entry.totalCents + entry.discountCents === entry.subtotalCents && Object.keys(entry.activityAmounts).length === entry.activityIds.length && entry.activityIds.every(id => amount(entry.activityAmounts[id])) && sum(Object.values(entry.activityAmounts)) === entry.subtotalCents;
  if (quote.totalCents !== row.amount_cents || quote.reportingAdjustment.preservedTotalCents !== row.amount_cents || quote.lines.length !== before.length || !quote.lines.every(validLine) || !before.every(validLine)) return invalid();
  if (discount.targetType !== "order" || discount.targetIds.length || quote.discount.targetType !== "package" || quote.discount.id !== discount.id || quote.discount.code !== discount.code || quote.discount.discountValue !== discount.discountValue || quote.discountCents !== discount.discountValue || !quote.discountCents) return invalid();
  if (sum(before.map(entry => entry.totalCents)) !== row.amount_cents || sum(quote.lines.map(entry => entry.totalCents)) !== row.amount_cents || sum(quote.lines.map(entry => entry.subtotalCents)) !== quote.subtotalCents || sum(quote.lines.map(entry => entry.discountCents)) !== quote.discountCents || sum(before.map(entry => entry.discountCents)) !== quote.discountCents || quote.subtotalCents - quote.discountCents !== row.amount_cents || discount.eligibleCents !== quote.subtotalCents) return invalid();
  const packageWeights = before.map(entry => entry.kind === "package" ? entry.subtotalCents : 0);
  if (quote.discount.eligibleCents !== sum(packageWeights) || quote.discountCents > quote.discount.eligibleCents) return invalid();
  const originalDiscounts = split(quote.discountCents, before.map(entry => entry.subtotalCents));
  if (before.some((entry, index) => entry.discountCents !== originalDiscounts[index])) return invalid();
  const expectedDiscounts = split(quote.discountCents, packageWeights);
  const exclusions = new Set(quote.discountExcludedActivityIds);
  if ([...exclusions].some(id => kinds.get(id) !== "dinner")) return invalid();
  let dinners = 0;
  for (const [index, entry] of quote.lines.entries()) {
    const original = before[index];
    if (["kind", "label", "quantity", "packageId", "tierId", "addonId", "participantIndex", "subtotalCents"].some(key => entry[key as keyof typeof entry] !== original[key as keyof typeof original]) || entry.activityIds.length !== original.activityIds.length || entry.activityIds.some((id, position) => id !== original.activityIds[position] || entry.activityAmounts[id] !== original.activityAmounts[id]) || entry.discountCents !== expectedDiscounts[index]) return invalid();
    if (entry.kind === "package" && (!entry.packageId || !quote.discount.targetIds.includes(entry.packageId) || entry.activityIds.some(id => kinds.get(id) === "dinner"))) return invalid();
    if (entry.kind === "addon" && (entry.discountCents !== 0 || entry.totalCents !== original.subtotalCents)) return invalid();
    if (entry.activityIds.some(id => kinds.get(id) === "dinner")) {
      if (entry.kind !== "addon" || entry.activityIds.length !== 1 || entry.totalCents !== 2000 || !exclusions.has(entry.activityIds[0])) return invalid();
      dinners += 1;
    }
  }
  return dinners ? quote : invalid();
}

function discountExclusions(value: unknown) {
  if (value === null || value === undefined) return [];
  const parsed = activityIdsSchema.safeParse(value);
  if (!parsed.success) throw new Error("Esclusioni dello sconto non verificabili. Controlla l’acquisto prima di consultare il report.");
  return parsed.data;
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
  if (payment.allocatedLines) return payment.allocatedLines;
  const total = payment.lines.reduce((sum, line) => sum + line.totalCents, 0);
  const weights = payment.lines.map(line => total ? line.totalCents : 1);
  const cents = split(payment.amount, weights);
  return payment.lines.map((line, index) => ({ line, cents: cents[index] }));
}

/** Reassign issued people without rewriting a shared order or guessing its owner. */
function paymentAttributions(payment: Payment, orderPasses: Pass[], passesById: Map<string, Pass>): PaymentAttribution[] {
  const attribution = (pass?: Pass) => pass ? { affiliateId: pass.affiliate_id || "direct", affiliateName: pass.affiliate_name || (pass.affiliate_id ? "Affiliato archiviato" : "Acquisti diretti") } : { affiliateId: payment.affiliateId, affiliateName: payment.affiliateName };
  const entries = allocated(payment);
  const one = (owner = attribution()) => [{ ...owner, amount: payment.amount, refunded: payment.refunded, lineIndices: new Set(entries.map((_, index) => index)) }];
  if (payment.kind !== "commerce") return one();
  if (payment.upgradePassId) {
    const pass = passesById.get(payment.upgradePassId);
    if (pass && pass.event_id !== payment.eventId) throw new Error("Affiliazione dell’upgrade incoerente. Verifica il partecipante associato.");
    return one(attribution(pass));
  }
  const people = orderPasses.filter(pass => pass.event_id === payment.eventId);
  if (!people.length) return one();
  const ids = new Set(people.map(pass => pass.affiliate_id || "direct"));
  const uniform = ids.size === 1 ? attribution(people[0]) : null;
  // Old imported groups may lack line indices. A unanimous unchanged owner is safe.
  if (uniform?.affiliateId === payment.affiliateId) return one(uniform);
  const unsafe = () => { throw new Error("Non è possibile ripartire l’acquisto tra gli affiliati. Verifica gli indici dei partecipanti prima di consultare il report."); };
  const indexed = new Map<number, Pass>();
  for (const pass of people) if (Number.isSafeInteger(pass.participant_index) && pass.participant_index! >= 0) {
    if (indexed.has(pass.participant_index!)) return unsafe();
    indexed.set(pass.participant_index!, pass);
  }
  const explicit = entries.every(({ line }) => line.participantIndex !== undefined);
  const packageCount = entries.filter(({ line }) => line.kind === "package").reduce((sum, { line }) => sum + line.quantity, 0);
  const expectedPeople = explicit ? new Set(entries.map(({ line }) => line.participantIndex)).size : packageCount;
  if (uniform && (expectedPeople === people.length || people.length === 1 && expectedPeople <= 1)) return one(uniform);
  if (!entries.length || !indexed.size) return unsafe();
  let inferredIndex = -1;
  const shares = new Map<string, PaymentAttribution>();
  for (const [lineIndex, { line, cents }] of entries.entries()) {
    if (line.kind === "package") {
      if (!explicit && line.quantity !== 1) return unsafe();
      inferredIndex = line.participantIndex ?? inferredIndex + 1;
    }
    const index = line.participantIndex ?? inferredIndex;
    const person = indexed.get(index);
    if (!person) return unsafe();
    const owner = attribution(person);
    const share = shares.get(owner.affiliateId) || { ...owner, amount: 0, refunded: 0, lineIndices: new Set<number>() };
    share.amount += cents; share.lineIndices.add(lineIndex); shares.set(owner.affiliateId, share);
  }
  const result = [...shares.values()];
  const refunds = split(payment.refunded, result.map(share => share.amount));
  result.forEach((share, index) => { share.refunded = refunds[index]; });
  return result;
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
      const eligible = ids.map((id, index) => (!payment.discountTargets || payment.discountTargets.includes(id)) && !payment.discountExcludedActivityIds.includes(id) ? weights[index] : 0);
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
  const [orders, reservations, passes, rights, tickets, refunds, commerceRefunds, ticketRefunds, waitlist, commissionRates, newLeads, openShopOrders, confirmedContacts] = await Promise.all([
    read<FinancialRow>("commerce_orders", "id,event_id,state,amount_cents,created_at,expires_at,demand,stripe_payment_intent,stripe_session_id,refund_status,affiliate_id,affiliate_name,upgrade_pass_id,quote_lines:quote->lines,quote_discount:quote->discount,quote_discount_exclusions:quote->discountExcludedActivityIds,reporting_quote,snapshot_activities:event_snapshot->commerce_config->activities", "gli acquisti"),
    read<FinancialRow>("ticket_reservations", "id,event_id,state,amount_cents,created_at,expires_at,stripe_payment_intent,stripe_session_id,refund_status,affiliate_id,affiliate_name", "gli acquisti precedenti"),
    read<Pass>("commerce_passes", "id,event_id,order_id,participant_index,package_id,package_name,package_activity_ids,status,created_at,affiliate_id,affiliate_name", "i partecipanti"),
    read<Right>("commerce_entitlements", "id,event_id,pass_id,order_id,activity_id,activity_name,kind,status,checked_in_at", "gli accessi"),
    read<Ticket>("tickets", "id,event_id,status,amount_cents,created_at,used_at,stripe_payment_intent,stripe_session_id,affiliate_id,affiliate_name", "i biglietti precedenti"),
    read<Refund>("meraki_refunds", "id,event_id,order_id,ticket_reservation_id,payment_intent,amount_cents,status,stripe_refund_id,revoke_entitlement_ids", "i rimborsi"),
    read<RefundMarker>("commerce_payment_refunds", "payment_intent,status", "i rimborsi precedenti", true),
    read<RefundMarker>("ticket_payment_refunds", "payment_intent", "i rimborsi dei biglietti precedenti", true),
    read<Waiting>("commerce_waitlist", "id,event_id,status,created_at", "la lista d’attesa"),
    rows<AffiliateCommission>((from, to) => {
      let query = db.from("event_affiliate_commissions").select("event_id,affiliate_id,commission_type,commission_cents,commission_credits");
      if (selected.eventId) query = query.eq("event_id", selected.eventId);
      return query.order("event_id").order("affiliate_id").range(from, to);
    }, "i compensi degli affiliati"),
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
    "Formule, scaglioni e aggiunte descrivono gli accessi attualmente validi degli iscritti selezionati per primo acquisto e affiliato attuale. Ogni persona conta una volta nella formula attuale; gli importi comprendono acquisto iniziale e upgrade successivi, al netto dei rimborsi e prima delle commissioni. Le formule interamente rimborsate sono escluse.",
    "Il compenso maturato di ogni affiliato è il compenso per iscritto impostato per l’evento moltiplicato per gli iscritti validi del report. Euro e crediti sono conteggiati separatamente, senza conversioni. Ogni persona conta una volta, anche con più attività o acquisti successivi. Il netto dopo le commissioni di pagamento non sottrae questi compensi.",
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
  const rates = new Map<string, AffiliateCommissionValue>();
  for (const rate of commissionRates) {
    const parsed = affiliateCommissionValueSchema.safeParse({ commissionType: rate.commission_type ?? "eur", commissionCents: rate.commission_cents, commissionCredits: rate.commission_credits ?? 0 });
    if (!parsed.success) throw new Error("Compenso affiliato non valido. Verifica le impostazioni dell’evento.");
    rates.set(`${rate.event_id}:${rate.affiliate_id}`, parsed.data);
  }
  const affiliateOptions = new Map<string, string>();
  const affiliate = (eventId: string, id: string | null, snapshotName?: string | null) => {
    const affiliation = id || "direct";
    const key = `${eventId}:${affiliation}`;
    let row = affiliateRows.get(key);
    if (!row) {
      const rate = id ? rates.get(key) : undefined;
      const commissionType = rate?.commissionType ?? "eur";
      row = { ...emptyFinancials(), id: affiliation, eventId, eventTitle: title(eventId), name: affiliation === "direct" ? "Acquisti diretti" : snapshotName || "Affiliato archiviato", validParticipants: 0, checkedInParticipants: 0, paidOrders: 0, commissionType, commissionPerParticipantCents: commissionType === "eur" ? rate?.commissionCents ?? 0 : 0, commissionPerParticipantCredits: commissionType === "credits" ? rate?.commissionCredits ?? 0 : 0, commissionCents: 0, commissionCredits: 0 };
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
  const passesById = new Map(passes.map(pass => [pass.id, pass]));
  const passesByOrder = new Map<string, Pass[]>();
  for (const pass of passes) {
    const people = passesByOrder.get(pass.order_id) || [];
    people.push(pass); passesByOrder.set(pass.order_id, people);
  }
  const makePayment = (row: FinancialRow, kind: "commerce" | "legacy", fallbackTicket?: Ticket) => {
    if (!eventMap.has(row.event_id)) return;
    const session = row.stripe_session_id || fallbackTicket?.stripe_session_id;
    const intent = row.stripe_payment_intent || fallbackTicket?.stripe_payment_intent || (session ? intentsBySession.get(session) : null);
    const identity = intent ? `pi:${intent}` : session ? `session:${session}` : `${kind}:${row.id}`;
    if (paymentRows.has(identity)) return;
    if (!amount(row.amount_cents)) {
      if (row.reporting_quote !== null && row.reporting_quote !== undefined) throw new Error("Ripartizione contabile non verificabile. Controlla l’importo dell’acquisto prima di consultare il report.");
      notes.add("Alcuni biglietti storici non hanno un importo registrato: sono esclusi dagli incassi, ma restano nei conteggi dei partecipanti."); return;
    }
    const settled = Math.max(refundTotals.get(`${kind}:${row.id}`) || 0, intent ? refundTotals.get(`pi:${intent}`) || 0 : 0);
    const full = row.state === "refunded" || fallbackTicket?.status === "refunded" || Boolean(intent && fullRefunds.has(intent));
    const captured = row.state === "fulfilled" || full || settled > 0 || (kind === "commerce" ? passOrders.has(row.id) : Boolean(fallbackTicket && paid(fallbackTicket.status))) || (["refund_required", "refund_pending"].includes(row.state) && Boolean(intent));
    const frozenKinds = activityKinds(row.snapshot_activities);
    // Current configuration is only a fallback when no frozen activity list exists.
    const kinds = Array.isArray(row.snapshot_activities) ? frozenKinds : activityKinds(eventMap.get(row.event_id)?.activities);
    const adjustment = kind === "commerce" ? reportingQuote(row, kinds) : null;
    if (adjustment) notes.add("Per gli acquisti con ripartizione contabile rettificata, la cena resta a prezzo pieno e lo sconto è attribuito ai pacchetti. Il totale pagato, i rimborsi e le commissioni effettive restano quelli dell’acquisto originale.");
    const quoteLines = kind === "commerce" ? adjustment?.lines ?? lines(row.quote_lines) : [{ kind: "package", label: "Ingresso evento", quantity: 1, totalCents: row.amount_cents, packageId: "legacy", tierId: "legacy" }];
    if (captured && !quoteLines.length && row.amount_cents > 0) notes.add("Alcuni acquisti storici non hanno righe prodotto leggibili: gli incassi sono inclusi nel totale ma non nel dettaglio delle formule.");
    const state = row.state === "reserved" && row.expires_at && Date.parse(row.expires_at) <= Date.now() ? "expired" : row.state;
    const discount = adjustment?.discount ?? (row.quote_discount && typeof row.quote_discount === "object" ? row.quote_discount as { targetType?: unknown; targetIds?: unknown } : null);
    const currentAttribution = kind === "legacy" && fallbackTicket ? fallbackTicket : row;
    paymentRows.set(identity, { id: row.id, identity, paymentIntent: intent || null, sessionId: session || null, kind, eventId: row.event_id, createdAt: row.created_at, affiliateId: currentAttribution.affiliate_id || "direct", affiliateName: currentAttribution.affiliate_name || "Acquisti diretti", amount: row.amount_cents, refunded: Math.min(row.amount_cents, full ? row.amount_cents : settled), captured, state, lines: quoteLines, activityKinds: kinds, discountTargets: discount?.targetType === "activity" && Array.isArray(discount.targetIds) ? discount.targetIds.filter((id): id is string => typeof id === "string") : null, discountExcludedActivityIds: adjustment?.discountExcludedActivityIds ?? discountExclusions(row.quote_discount_exclusions), upgradePassId: row.upgrade_pass_id });
  };
  // Prefer the issued order when an imported duplicate shares its payment identity.
  const linkedOrder = (order: FinancialRow) => passOrders.has(order.id) || Boolean(order.upgrade_pass_id);
  for (const order of [...orders].sort((a, b) => Number(linkedOrder(b)) - Number(linkedOrder(a)))) makePayment(order, "commerce");
  for (const reservation of reservations) makePayment(reservation, "legacy", ticketBySession.get(reservation.stripe_session_id || "") || ticketByIntent.get(reservation.stripe_payment_intent || ""));
  for (const ticket of tickets) {
    if (!paid(ticket.status) && ticket.status !== "refunded") continue;
    makePayment({ ...ticket, state: ticket.status === "refunded" ? "refunded" : "fulfilled", refund_status: null }, "legacy", ticket);
  }
  const attributionByPayment = new Map<string, PaymentAttribution[]>();
  const scopedPayments = [...paymentRows.values()].filter(payment => {
    if (!inPeriod(payment.createdAt)) return false;
    const shares = paymentAttributions(payment, passesByOrder.get(payment.id) || [], passesById);
    attributionByPayment.set(payment.identity, shares);
    return shares.some(share => inAffiliate(share.affiliateId === "direct" ? null : share.affiliateId));
  });
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
  const increment = (collection: keyof typeof breakdowns, id: string, name: string, netCents: number) => {
    const current = breakdowns[collection].get(id) || { id, name, count: 0, netCents: 0 };
    current.count += 1; current.netCents += netCents; breakdowns[collection].set(id, current);
  };
  for (const payment of scopedPayments) {
    const event = eventStats.get(payment.eventId)!;
    const attributions = attributionByPayment.get(payment.identity)!;
    if (attributions.length > 1) notes.add("Un acquisto di gruppo può comparire tra gli ordini di più affiliati; il totale generale conta ogni ordine una sola volta.");
    if (!payment.captured) {
      const key = ["reserved", "awaiting_payment"].includes(payment.state) ? "pendingOrders" : payment.state === "expired" ? "expiredOrders" : payment.state === "payment_failed" ? "failedOrders" : null;
      if (key) { metrics[key] += 1; event[key] += 1; }
      continue;
    }
    const fee = payment.amount === 0 ? { feeCents: 0, complete: true } : paymentFees.get(payment.identity) || { feeCents: 0, complete: false };
    if (!fee.complete) notes.add("Alcune commissioni non sono ancora disponibili o verificabili: sono mostrate solo le commissioni note e il netto dopo le commissioni resta non disponibile per gli importi interessati.");
    const feeShares = split(fee.feeCents, attributions.map(share => share.amount));
    const included = attributions.map((share, index) => ({ ...share, feeCents: feeShares[index] })).filter(share => inAffiliate(share.affiliateId === "direct" ? null : share.affiliateId));
    const gross = included.reduce((sum, share) => sum + share.amount, 0);
    const refunded = included.reduce((sum, share) => sum + share.refunded, 0);
    const scopedFees = included.reduce((sum, share) => sum + share.feeCents, 0);
    const missing = !fee.complete && gross > 0 ? 1 : 0;
    for (const item of [metrics, event]) {
      addFinancials(item, gross, refunded, scopedFees, missing);
      if (payment.amount > 0) item.paidOrders += 1;
    }
    for (const share of included) {
      const affiliateRow = affiliate(payment.eventId, share.affiliateId === "direct" ? null : share.affiliateId, share.affiliateName);
      addFinancials(affiliateRow, share.amount, share.refunded, share.feeCents, !fee.complete && share.amount > 0 ? 1 : 0);
      if (payment.amount > 0) affiliateRow.paidOrders += 1;
    }
    const date = day(payment.createdAt);
    if (date) {
      const current = trend.get(date) || { date, ...emptyFinancials(), paidOrders: 0 };
      addFinancials(current, gross, refunded, scopedFees, missing);
      current.paidOrders += payment.amount > 0 ? 1 : 0; trend.set(date, current);
    }
    const includedLines = new Set(included.flatMap(share => [...share.lineIndices]));
    const allocatedLines = allocated(payment).filter((_, index) => includedLines.has(index));
    const scopedPayment = { ...payment, amount: gross, refunded, lines: allocatedLines.map(entry => entry.line), allocatedLines };
    const categories = [...revenueAmounts(scopedPayment, notes)];
    const categoryWeights = categories.map(([, cents]) => cents);
    const categoryRefunds = split(refunded, categoryWeights);
    const categoryFees = split(scopedFees, categoryWeights);
    categories.forEach(([id, gross], index) => addFinancials(revenueRow(id), gross, categoryRefunds[index], categoryFees[index], !fee.complete && gross > 0 ? 1 : 0));
  }
  const rightsByPass = new Map<string, Right[]>();
  const originalOrders = new Map(orders.map(order => [order.id, order]));
  const reservationsBySession = new Map(reservations.filter(reservation => reservation.stripe_session_id).map(reservation => [reservation.stripe_session_id!, reservation]));
  const reservationsByIntent = new Map(reservations.filter(reservation => reservation.stripe_payment_intent).map(reservation => [reservation.stripe_payment_intent!, reservation]));
  for (const right of rights) {
    const current = rightsByPass.get(right.pass_id) || [];
    current.push(right); rightsByPass.set(right.pass_id, current);
  }
  // Product counts follow issued people, rather than payment/upgrade history.
  // Keep cumulative, refunded payment allocations separate from financial KPIs.
  type OwnedLine = { payment: Payment; line: Line; netCents: number };
  const linesByPass = new Map<string, OwnedLine[]>();
  const rightsById = new Map(rights.map(right => [right.id, right]));
  const completelyRefunded = (payment: Payment) => payment.state === "refunded" || payment.amount > 0 && payment.refunded === payment.amount;
  const selectedPassIds = new Set(passes.filter(pass => eventMap.has(pass.event_id) && !eventMap.get(pass.event_id)!.canceled_at && pass.status === "paid" && (rightsByPass.get(pass.id) || []).some(right => alive(right.status)) && inAffiliate(pass.affiliate_id) && inPeriod(originalOrders.get(pass.order_id)?.created_at || pass.created_at)).map(pass => pass.id));
  for (const payment of paymentRows.values()) {
    if (payment.kind !== "commerce" || !payment.captured || completelyRefunded(payment)) continue;
    const people = (passesByOrder.get(payment.id) || []).filter(pass => pass.event_id === payment.eventId);
    if (payment.upgradePassId ? !selectedPassIds.has(payment.upgradePassId) : !people.some(pass => selectedPassIds.has(pass.id))) continue;
    const indexed = new Map(people.filter(pass => Number.isSafeInteger(pass.participant_index)).map(pass => [pass.participant_index!, pass]));
    const entries = allocated(payment);
    const units: { line: Line; lineIndex: number; cents: number; pass: Pass | undefined; refunded: number }[] = [];
    const packageUnits = entries.filter(({ line }) => line.kind === "package").reduce((sum, { line }) => sum + line.quantity, 0);
    let inferredIndex = -1;
    for (const [index, { line, cents }] of entries.entries()) {
      if (line.kind === "package") inferredIndex = line.participantIndex ?? inferredIndex + 1;
      const personIndex = line.participantIndex ?? inferredIndex;
      const owners = Array.from({ length: line.quantity }, (_, unit) => payment.upgradePassId ? passesById.get(payment.upgradePassId) : indexed.get(personIndex + unit) || (people.length === 1 && packageUnits === 1 ? people[0] : undefined));
      if (owners.some(pass => !pass || pass.event_id !== payment.eventId) || new Set(owners).size !== owners.length) {
        if (people.length || payment.upgradePassId) notes.add("Alcune righe storiche non sono associabili con certezza ai singoli pass: restano negli incassi ma sono escluse dal dettaglio delle formule attive.");
        owners.fill(undefined);
      }
      const amounts = split(cents, owners.map(() => 1));
      owners.forEach((pass, unit) => {
        units.push({ line, lineIndex: index, cents: amounts[unit], pass, refunded: 0 });
      });
      if (line.kind === "package") inferredIndex += line.quantity - 1;
    }
    // An organizer can refund one member of a group. Charge that person's
    // selected admissions first, without reducing another member's receipts.
    let assignedRefunds = 0;
    const seen = new Set<string>();
    for (const refund of refunds) {
      const identity = refund.stripe_refund_id || refund.id;
      if (refund.status !== "succeeded" || seen.has(identity) || refund.event_id !== payment.eventId || !(refund.order_id === payment.id || payment.paymentIntent && refund.payment_intent === payment.paymentIntent)) continue;
      seen.add(identity);
      const targets = (refund.revoke_entitlement_ids || []).flatMap(id => {
        const right = rightsById.get(id);
        return right?.order_id === payment.id ? [right] : [];
      });
      const indices = units.flatMap((unit, index) => targets.some(right => right.pass_id === unit.pass?.id && unit.line.activityIds?.includes(right.activity_id)) ? [index] : []);
      const weights = indices.map(index => units[index].cents - units[index].refunded);
      const targeted = Math.min(refund.amount_cents, payment.refunded - assignedRefunds, weights.reduce((sum, value) => sum + value, 0));
      const amounts = split(targeted, weights);
      indices.forEach((index, position) => { units[index].refunded += amounts[position]; });
      assignedRefunds += targeted;
    }
    // Untargeted monetary refunds retain the financial report's affiliate-first
    // cent rounding, then divide only the remaining refundable line amounts.
    const shares = paymentAttributions(payment, people, passesById);
    const shareIndices = shares.map(share => units.flatMap((unit, index) => share.lineIndices.has(unit.lineIndex) ? [index] : []));
    const shareAmounts = split(payment.refunded - assignedRefunds, shareIndices.map(indices => indices.reduce((sum, index) => sum + units[index].cents - units[index].refunded, 0)));
    shareIndices.forEach((indices, shareIndex) => {
      const amounts = split(shareAmounts[shareIndex], indices.map(index => units[index].cents - units[index].refunded));
      indices.forEach((index, position) => { units[index].refunded += amounts[position]; });
    });
    for (const unit of units) if (unit.pass) {
      const owned = linesByPass.get(unit.pass.id) || [];
      owned.push({ payment, line: unit.line, netCents: unit.cents - unit.refunded }); linesByPass.set(unit.pass.id, owned);
    }
  }
  for (const pass of passes) {
    const event = eventMap.get(pass.event_id);
    const currentRights = (rightsByPass.get(pass.id) || []).filter(right => alive(right.status));
    if (!event || !selectedPassIds.has(pass.id)) continue;
    const owned = linesByPass.get(pass.id) || [];
    const surviving = ({ payment, line }: OwnedLine) => currentRights.some(right => right.order_id === payment.id && line.activityIds?.includes(right.activity_id)) || line.kind === "upgrade" && payment.state === "fulfilled" && Boolean(payment.upgradePassId && line.activityIds?.length && line.activityIds.every(id => currentRights.some(right => right.activity_id === id)));
    const formulas = owned.filter(entry => entry.line.kind !== "addon" && surviving(entry)).sort((a, b) => (Date.parse(a.payment.createdAt || "") || 0) - (Date.parse(b.payment.createdAt || "") || 0) || a.payment.id.localeCompare(b.payment.id));
    const prefix = selected.eventId ? "" : `${title(pass.event_id)} · `;
    if (formulas.length) {
      const latest = formulas.findLast(entry => !pass.package_id || entry.line.packageId === pass.package_id) || formulas[formulas.length - 1];
      const expectedIds = pass.package_activity_ids?.length ? pass.package_activity_ids : latest.line.activityIds || [];
      const activeIds = new Set(currentRights.map(right => right.activity_id));
      const complete = expectedIds.length > 0 && expectedIds.every(id => activeIds.has(id));
      const remainingIds = [...new Set(formulas.flatMap(entry => entry.line.activityIds || []).filter(id => activeIds.has(id)))].sort();
      const packageId = complete ? pass.package_id || latest.line.packageId || latest.line.label : `partial:${remainingIds.join("+")}`;
      const name = complete ? pass.package_name || latest.line.label.split(" · ")[0] : `Accessi parziali: ${remainingIds.map(id => currentRights.find(right => right.activity_id === id)!.activity_name).join(" + ")}`;
      const netCents = formulas.reduce((sum, entry) => sum + entry.netCents, 0);
      increment("packages", `${event.id}:${packageId}`, `${prefix}${name}`, netCents);
      if (complete && latest.line.tierId) increment("tiers", `${event.id}:${packageId}:${latest.line.tierId}`, `${prefix}${latest.line.label}`, netCents);
    }
    const extras = new Map<string, { line: Line; netCents: number }>();
    for (const entry of owned.filter(entry => entry.line.kind === "addon" && surviving(entry))) {
      const id = entry.line.addonId || entry.line.activityIds?.join("+") || entry.line.label;
      const extra = extras.get(id) || { line: entry.line, netCents: 0 };
      extra.netCents += entry.netCents; extras.set(id, extra);
    }
    for (const [id, extra] of extras) increment("addons", `${event.id}:${id}`, `${prefix}${extra.line.label}`, extra.netCents);
  }
  for (const ticket of tickets) {
    const event = eventMap.get(ticket.event_id);
    if (!event || event.canceled_at || !paid(ticket.status) || !inAffiliate(ticket.affiliate_id)) continue;
    const reservation = reservationsBySession.get(ticket.stripe_session_id || "") || reservationsByIntent.get(ticket.stripe_payment_intent || "");
    if (!inPeriod(reservation?.created_at || ticket.created_at)) continue;
    const payment = [...paymentRows.values()].find(payment => payment.kind === "legacy" && payment.eventId === event.id && (payment.id === ticket.id || payment.id === reservation?.id));
    if (!payment?.captured || completelyRefunded(payment)) continue;
    const prefix = selected.eventId ? "" : `${title(event.id)} · `;
    increment("packages", `${event.id}:legacy`, `${prefix}Ingresso evento`, payment.amount - payment.refunded);
    increment("tiers", `${event.id}:legacy:legacy`, `${prefix}Ingresso evento`, payment.amount - payment.refunded);
  }
  const occupancy = new Map<string, number>();
  const activityOccupancy = new Map<string, Set<string>>();
  const attendanceGroups = new Map<string, AdminAnalytics["attendanceGroups"][number]>(scopedEvents.map(event => [event.id, {
    eventId: event.id, eventTitle: title(event.id), currentParticipants: 0, workshopOnly: 0, masterclassOnly: 0, both: 0, otherParticipants: 0,
    capacity: eventStats.get(event.id)!.capacity, remaining: eventStats.get(event.id)!.capacity, reservedParticipants: 0,
  }]));
  const activityHolds = new Map<string, number>();
  const activeHold = (row: FinancialRow) => row.state === "awaiting_payment" || (row.state === "reserved" && Boolean(row.expires_at && Date.parse(row.expires_at) > Date.now()));
  for (const order of orders) {
    const group = attendanceGroups.get(order.event_id);
    if (!group || !activeHold(order) || !order.demand || typeof order.demand !== "object" || Array.isArray(order.demand)) continue;
    for (const [activityId, count] of Object.entries(order.demand)) {
      if (!amount(count)) throw new Error("Prenotazioni temporanee non valide. Verifica gli acquisti in attesa.");
      if (activityId === "_passes") group.reservedParticipants += count;
      else activityHolds.set(`${order.event_id}:${activityId}`, (activityHolds.get(`${order.event_id}:${activityId}`) || 0) + count);
    }
  }
  for (const reservation of reservations) if (activeHold(reservation)) {
    const group = attendanceGroups.get(reservation.event_id);
    if (group) group.reservedParticipants += 1;
  }
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
    const group = attendanceGroups.get(event.id)!;
    group.currentParticipants += 1;
    const configuredKinds = activityKinds(event.activities);
    const kinds = new Set(currentRights.map(right => right.kind || configuredKinds.get(right.activity_id)));
    if (kinds.has("workshop") && kinds.has("masterclass")) group.both += 1;
    else if (kinds.has("workshop")) group.workshopOnly += 1;
    else if (kinds.has("masterclass")) group.masterclassOnly += 1;
    else group.otherParticipants += 1;
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
    const group = attendanceGroups.get(event.id)!;
    group.currentParticipants += 1; group.otherParticipants += 1;
    const reservation = reservationsBySession.get(ticket.stripe_session_id || "") || reservationsByIntent.get(ticket.stripe_payment_intent || "");
    if (inPeriod(reservation?.created_at || ticket.created_at) && inAffiliate(ticket.affiliate_id)) addPerson(event.id, ticket.affiliate_id, ticket.affiliate_name, ticket.status === "used");
  }
  for (const entry of waitlist) if (selected.affiliateId === "all" && eventMap.has(entry.event_id) && entry.status === "waiting" && inPeriod(entry.created_at)) {
    metrics.waiting! += 1; eventStats.get(entry.event_id)!.waiting! += 1;
  }
  for (const event of eventStats.values()) {
    event.remaining = event.capacity === null ? null : Math.max(0, event.capacity - (occupancy.get(event.id) || 0));
    attendanceGroups.get(event.id)!.remaining = event.remaining;
  }
  for (const affiliate of affiliateRows.values()) {
    affiliate.commissionCents = affiliate.validParticipants * affiliate.commissionPerParticipantCents;
    affiliate.commissionCredits = affiliate.validParticipants * affiliate.commissionPerParticipantCredits;
  }
  const activities = [...activityCounts].map(([key, counter]) => {
    const event = eventMap.get(counter.eventId)!;
    const raw = Array.isArray(event.activities) ? event.activities.find(activity => activity && typeof activity === "object" && activity.id === key.slice(event.id.length + 1)) : null;
    const capacity = raw && amount(raw.capacity) ? raw.capacity : null;
    const occupied = activityOccupancy.get(key)?.size || 0;
    const reservedAdmissions = activityHolds.get(key) || 0;
    const remaining = capacity === null ? null : Math.max(0, capacity - occupied);
    const global = attendanceGroups.get(event.id)!;
    const limits = [remaining === null ? null : Math.max(0, remaining - reservedAdmissions), global.remaining === null ? null : Math.max(0, global.remaining - global.reservedParticipants)].filter((limit): limit is number => limit !== null);
    const availableForSale = limits.length ? Math.min(...limits) : null;
    return { id: key.slice(event.id.length + 1), eventId: event.id, eventTitle: title(event.id), name: counter.name, capacity, validAdmissions: counter.participants.size, checkedIn: counter.checked.size, occupied, reservedAdmissions, availableForSale, remaining };
  });
  if (selected.from && selected.to) {
    for (let date = selected.from, count = 0; date <= selected.to && count < 3660; date = advance(date, 1), count += 1) if (!trend.has(date)) trend.set(date, { date, ...emptyFinancials(), paidOrders: 0 });
    if (advance(selected.from, 3660) <= selected.to) notes.add("Per intervalli oltre dieci anni l’andamento mantiene tutti i giorni con vendite e omette parte dei giorni senza acquisti.");
  }
  const breakdown = (collection: keyof typeof breakdowns) => [...breakdowns[collection].values()].sort((a, b) => b.netCents - a.netCents || a.name.localeCompare(b.name, "it"));
  return {
    filters: selected, events: eventRows.map(event => ({ id: event.id, title: getLocalizedText(event.titolo, input.locale) || "Evento", startsAt: event.data_inizio })),
    affiliateOptions: [...affiliateOptions].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "it")), metrics,
    operations: { newLeads, openShopOrders, confirmedContacts },
    trend: [...trend.values()].sort((a, b) => a.date.localeCompare(b.date)), revenue: [...revenue.values()], packages: breakdown("packages"), tiers: breakdown("tiers"), addons: breakdown("addons"), activities, attendanceGroups: [...attendanceGroups.values()],
    affiliates: [...affiliateRows.values()].filter(row => inAffiliate(row.id === "direct" ? null : row.id)).sort((a, b) => b.validParticipants - a.validParticipants || a.name.localeCompare(b.name, "it", { sensitivity: "base" }) || a.eventId.localeCompare(b.eventId) || a.id.localeCompare(b.id)), eventStats: [...eventStats.values()], notes: [...notes],
  };
}
