import "server-only";
import type Stripe from "stripe";
import { getVerifiedStripe } from "@/lib/stripe/client";
import { commerceClient } from "@/lib/commerce/server";
import { getLocalizedText } from "@/lib/i18n-utils";
import { sendMerakiRefundConfirmation, sendMerakiCancellationNotice } from "@/lib/email/refund-emails";
import { loadRefundPanel, type RefundDb } from "./data";
import type { RefundRow } from "./types";

function check(error: unknown, message: string) { if (error) throw new Error(message); }
const intentId = (refund: Stripe.Refund) => typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;

export async function deliverRefundEmail(row: RefundRow, db = commerceClient()) {
  if (row.status !== "succeeded" || row.email_sent_at) return;
  const { data: claimed, error: claimError } = await db.rpc("claim_meraki_refund_email", { p_refund_id: row.id });
  check(claimError, "Impossibile prenotare l’email di conferma.");
  if (!claimed) return;
  let success = false;
  try {
    const [payment, event] = await Promise.all([
      db.from(row.order_id ? "commerce_orders" : "ticket_reservations").select("buyer_email,locale,amount_cents").eq("id", row.order_id || row.ticket_reservation_id!).single(),
      db.from("events").select("titolo,canceled_at").eq("id", row.event_id).single(),
    ]);
    check(payment.error || event.error, "Dati dell’email di rimborso non disponibili.");
    const revokedNames: string[] = [], remainingNames: string[] = [];
    if (row.order_id) {
      const own = await db.from("commerce_entitlements").select("pass_id,activity_name,id,status").eq("order_id", row.order_id);
      check(own.error, "Impossibile leggere gli accessi rimborsati.");
      const passIds = [...new Set((own.data || []).map(right => right.pass_id))];
      if (passIds.length) {
        const [rights, people] = await Promise.all([
          db.from("commerce_entitlements").select("pass_id,activity_name").in("pass_id", passIds).in("status", ["valid", "used"]),
          db.from("commerce_passes").select("id,first_name,last_name").in("id", passIds),
        ]);
        check(rights.error || people.error, "Impossibile leggere gli accessi ancora validi.");
        const names = new Map((people.data || []).map(person => [person.id, `${person.first_name} ${person.last_name}`.trim()]));
        const label = (right: { activity_name: string; pass_id: string }) => names.get(right.pass_id) ? `${right.activity_name} · ${names.get(right.pass_id)}` : right.activity_name;
        revokedNames.push(...(own.data || []).filter(right => row.revoke_entitlement_ids.includes(right.id)).map(label));
        remainingNames.push(...(rights.data || []).map(label));
      }
    }
    const delivery = await sendMerakiRefundConfirmation({ to: payment.data!.buyer_email, locale: payment.data!.locale,
      deliveryId: row.id, eventTitle: getLocalizedText(event.data!.titolo, payment.data!.locale), status: "succeeded",
      amountCents: row.amount_cents, refundReference: row.stripe_refund_id!, fullRefund: row.full_remaining,
      reason: row.reason, revokedAccessNames: [...new Set(revokedNames)], remainingAccessNames: [...new Set(remainingNames)],
      allAccessRevoked: row.revoke_ticket || (row.revoke_entitlement_ids.length > 0 && !remainingNames.length), eventCanceled: Boolean(event.data!.canceled_at) });
    if (!delivery.success) throw new Error("Invio dell’email di rimborso da riprovare.");
    success = true;
  } finally {
    const completed = await db.rpc("complete_meraki_refund_email", { p_refund_id: row.id, p_success: success });
    check(completed.error, "Esito dell’email di rimborso non registrato.");
  }
}

/** Called only with a signature-verified webhook or a fresh response from our Stripe account. */
export async function syncMerakiRefund(refund: Stripe.Refund, db = commerceClient()): Promise<boolean> {
  const localId = refund.metadata?.meraki_refund_id;
  let row: RefundRow | null = null;
  if (localId) {
    const existing = await db.from("meraki_refunds").select("*").eq("id", localId).maybeSingle();
    check(existing.error, "Rimborso Meraki non verificabile.");
    row = existing.data as RefundRow | null;
    if (!row || row.payment_intent !== intentId(refund) || row.amount_cents !== refund.amount || refund.currency !== "eur") throw new Error("Il rimborso Stripe non corrisponde alla richiesta Meraki.");
    const completed = await db.rpc("complete_meraki_refund", { p_refund_id: row.id, p_stripe_refund_id: refund.id, p_status: refund.status || "pending", p_failure_reason: refund.failure_reason || null });
    check(completed.error, "Esito del rimborso non registrato.");
    row = completed.data as RefundRow;
  } else {
    if (!intentId(refund) || refund.currency !== "eur") return false;
    const recorded = await db.rpc("record_meraki_external_refund", { p_payment_intent: intentId(refund), p_stripe_refund_id: refund.id, p_amount_cents: refund.amount, p_status: refund.status || "pending", p_failure_reason: refund.failure_reason || null });
    check(recorded.error, "Rimborso esterno non riconciliato.");
    row = recorded.data as RefundRow | null;
  }
  if (!row?.id) return false;
  // SMTP is a separate, retryable delivery. Its outage must not turn a
  // successful money transfer into an apparent failed financial request.
  try { await deliverRefundEmail(row, db); } catch { /* Durable unsent row remains visible in the panel. */ }
  return true;
}

/** Lists every refund: old dashboard refunds count against the balance too. */
export async function reconcilePayment(paymentIntent: string, db = commerceClient(), stripePromise = getVerifiedStripe()) {
  const stripe = await stripePromise;
  for await (const refund of stripe.refunds.list({ payment_intent: paymentIntent, limit: 100 })) await syncMerakiRefund(refund, db);
  return stripe;
}

export async function executeMerakiRefund(row: RefundRow, db = commerceClient()) {
  if (["succeeded", "failed", "canceled"].includes(row.status)) {
    try { await deliverRefundEmail(row, db); } catch { /* Retry delivery independently of the financial result. */ }
    return row;
  }
  const stripe = await reconcilePayment(row.payment_intent, db);
  const latest = await db.from("meraki_refunds").select("*").eq("id", row.id).single();
  check(latest.error, "Richiesta di rimborso non disponibile.");
  row = latest.data as RefundRow;
  if (["succeeded", "failed", "canceled"].includes(row.status)) return row;
  if (row.stripe_refund_id) {
    await syncMerakiRefund(await stripe.refunds.retrieve(row.stripe_refund_id), db);
  } else {
    // Stripe may forget an idempotency key after 24h. An uncertain old request
    // must be reconciled by an operator rather than risk a second transfer.
    if (Date.now() - Date.parse(row.created_at) > 23 * 60 * 60 * 1000) throw new Error("Richiesta precedente da verificare in Stripe prima di un nuovo tentativo.");
    let refund: Stripe.Refund;
    try {
      refund = await stripe.refunds.create({ payment_intent: row.payment_intent, amount: row.amount_cents,
        reason: "requested_by_customer", metadata: { meraki_refund_id: row.id, meraki_event_id: row.event_id } },
      { idempotencyKey: `meraki-panel-refund-${row.id}` });
    } catch (error) {
      const type = error && typeof error === "object" && "type" in error ? String(error.type) : "";
      const definitelyRejected = type === "StripeInvalidRequestError" || type === "StripeAuthenticationError" || type === "StripePermissionError";
      const result = await db.rpc("complete_meraki_refund", { p_refund_id: row.id, p_stripe_refund_id: null, p_status: definitelyRejected ? "failed" : "unknown",
        p_failure_reason: definitelyRejected ? "Stripe ha rifiutato la richiesta. Verifica saldo, permessi e pagamento prima di riprovare." : "Risposta Stripe non confermata. Usa Verifica/riprova: non creare un’altra richiesta." });
      check(result.error, "Esito incerto: verifica la richiesta prima di riprovare.");
      return result.data as RefundRow;
    }
    // A storage or email failure after Stripe accepted is never classified as
    // a failed financial request. Retrying uses the same ledger/idempotency key.
    await syncMerakiRefund(refund, db);
  }
  const result = await db.from("meraki_refunds").select("*").eq("id", row.id).single();
  check(result.error, "Aggiornamento del rimborso non disponibile.");
  return result.data as RefundRow;
}

export type NewRefund = { requestId: string; orderId?: string; ticketReservationId?: string; amountCents: number; reason: string; entitlementIds: string[]; confirmUsed?: boolean; expectedAvailableCents?: number };
export async function createMerakiRefund(input: NewRefund, actor: string, db: RefundDb, cancellationId: string | null = null) {
  // Verify merchant, captured amount and any refunds already made in Dashboard
  // before reserving another amount. All balances are still checked atomically.
  const payment = await db.from(input.orderId ? "commerce_orders" : "ticket_reservations").select("stripe_payment_intent,stripe_session_id,amount_cents").eq("id", input.orderId || input.ticketReservationId!).single();
  check(payment.error, "Pagamento non disponibile.");
  let paymentIntent = payment.data?.stripe_payment_intent as string | null;
  if (!paymentIntent && input.ticketReservationId && payment.data?.stripe_session_id) {
    const ticket = await db.from("tickets").select("stripe_payment_intent").eq("stripe_session_id", payment.data.stripe_session_id).maybeSingle();
    check(ticket.error, "Pagamento del biglietto non disponibile.");
    paymentIntent = ticket.data?.stripe_payment_intent || null;
  }
  if (!paymentIntent) throw new Error("Questo acquisto non ha un pagamento Stripe rimborsabile.");
  const stripe = await reconcilePayment(paymentIntent, db);
  const intent = await stripe.paymentIntents.retrieve(paymentIntent);
  if (intent.currency !== "eur" || intent.status !== "succeeded" || intent.amount_received !== payment.data!.amount_cents || intent.amount_received < input.amountCents) throw new Error("L’importo non corrisponde a un pagamento acquisito in euro.");
  const reserved = await db.rpc("reserve_meraki_refund", { p_request_id: input.requestId, p_order_id: input.orderId || null,
    p_ticket_reservation_id: input.ticketReservationId || null, p_amount_cents: input.amountCents, p_reason: input.reason,
    p_entitlement_ids: input.entitlementIds, p_created_by: actor, p_cancellation_id: cancellationId,
    p_confirm_used: Boolean(input.confirmUsed), p_expected_available_cents: input.expectedAvailableCents ?? null });
  check(reserved.error, "Rimborso non prenotato: verifica importo residuo, accessi e richieste già in corso.");
  return executeMerakiRefund(reserved.data as RefundRow, db);
}

async function deliverCancellationEmails(eventId: string, db: RefundDb) {
  const recipients = await db.from("meraki_cancellation_emails").select("*").eq("event_id", eventId).is("email_sent_at", null).order("id").limit(5);
  check(recipients.error, "Comunicazioni di annullamento non disponibili.");
  const event = await db.from("events").select("titolo,cancellation_reason").eq("id", eventId).single();
  check(event.error, "Evento non disponibile per le comunicazioni.");
  for (const recipient of recipients.data || []) {
    const now = new Date().toISOString(), expiry = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const claim = await db.from("meraki_cancellation_emails").update({ email_claimed_at: now }).eq("id", recipient.id).is("email_sent_at", null).or(`email_claimed_at.is.null,email_claimed_at.lt.${expiry}`).select("id").maybeSingle();
    check(claim.error, "Comunicazione di annullamento non prenotata.");
    if (!claim.data) continue;
    let success = false;
    try {
      const delivery = await sendMerakiCancellationNotice({ to: recipient.email, locale: recipient.locale, deliveryId: recipient.id,
        eventTitle: getLocalizedText(event.data!.titolo, recipient.locale), reason: event.data!.cancellation_reason || undefined, refundExpected: recipient.refund_expected });
      success = delivery.success;
    } catch { /* Release this claim and retain the individual delivery for retry. */ }
    const saved = await db.from("meraki_cancellation_emails").update({ email_claimed_at: null, email_sent_at: success ? now : null,
      failure_reason: success ? null : "Invio non riuscito: riprova." }).eq("id", recipient.id).eq("email_claimed_at", now);
    check(saved.error, "Esito della comunicazione non registrato.");
  }
}

/** Explicit, bounded continuation: recoverable after closing the browser. */
export async function processRefundBatch(eventId: string, actor: string, db: RefundDb) {
  const panel = await loadRefundPanel(db, eventId, true);
  if (!panel.event) throw new Error("Evento non trovato.");
  const errors: string[] = [];
  if (panel.cancellation) {
    await deliverCancellationEmails(eventId, db);
    const candidates = panel.payments.filter(payment => payment.availableCents > 0 && payment.pendingCents === 0).slice(0, 3);
    for (const payment of candidates) {
      try {
        await createMerakiRefund({ requestId: crypto.randomUUID(), ...(payment.kind === "commerce" ? { orderId: payment.id } : { ticketReservationId: payment.id }),
          amountCents: payment.availableCents, expectedAvailableCents: payment.availableCents, confirmUsed: true,
          reason: panel.event.cancellationReason || "Annullamento evento", entitlementIds: [] }, actor, db, panel.cancellation.id);
      } catch { errors.push("Un rimborso richiede verifica. Controlla il relativo pagamento prima di continuare."); }
    }
  }
  const outstanding = await db.from("meraki_refunds").select("*").eq("event_id", eventId).in("status", ["preparing", "pending", "requires_action", "unknown"]).order("created_at").limit(3);
  check(outstanding.error, "Rimborsi in corso non disponibili.");
  for (const row of outstanding.data || []) { try { await executeMerakiRefund(row as RefundRow, db); } catch { errors.push("Una richiesta in corso necessita di verifica Stripe."); } }
  const unsent = await db.from("meraki_refunds").select("*").eq("event_id", eventId).eq("status", "succeeded").is("email_sent_at", null).order("created_at").limit(5);
  check(unsent.error, "Email di rimborso non disponibili.");
  for (const row of unsent.data || []) { try { await deliverRefundEmail(row as RefundRow, db); } catch { errors.push("Un’email di conferma è ancora da inviare."); } }
  return { ...(await loadRefundPanel(db, eventId, true)), errors: [...new Set(errors)] };
}
