import "server-only";
import type Stripe from "stripe";
import { getVerifiedStripe } from "./client";

export type PaymentFeeReference = {
  id: string;
  paymentIntent: string | null;
  sessionId: string | null;
  amountCents: number;
  refundedCents: number;
};
export type PaymentFees = { feeCents: number; complete: boolean };

const concurrency = 4;
const requestTimeout = 4_000;
const reportTimeout = 12_000;
const unavailable = (): PaymentFees => ({ feeCents: 0, complete: false });
const cents = (value: number) => Number.isSafeInteger(value) && value >= 0;

function options(deadline: number): Stripe.RequestOptions {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("Fee reporting deadline reached");
  return { timeout: Math.min(requestTimeout, remaining), maxNetworkRetries: 0 };
}

async function verifiedStripe(): Promise<Stripe> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      getVerifiedStripe(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Fee verification timed out")), requestTimeout); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function balance(stripe: Stripe, value: string | Stripe.BalanceTransaction | null, deadline: number) {
  return typeof value === "string" ? stripe.balanceTransactions.retrieve(value, {}, options(deadline)) : value;
}

function validBalance(value: Stripe.BalanceTransaction | null): value is Stripe.BalanceTransaction {
  return Boolean(value && value.currency === "eur" && Number.isSafeInteger(value.amount) && Number.isSafeInteger(value.fee));
}

async function paymentFees(stripe: Stripe, reference: PaymentFeeReference, deadline: number): Promise<PaymentFees> {
  let intent: Stripe.PaymentIntent | null;
  if (reference.paymentIntent) {
    intent = await stripe.paymentIntents.retrieve(reference.paymentIntent, { expand: ["latest_charge.balance_transaction"] }, options(deadline));
  } else if (reference.sessionId) {
    const session = await stripe.checkout.sessions.retrieve(reference.sessionId, { expand: ["payment_intent.latest_charge.balance_transaction"] }, options(deadline));
    if (session.currency !== "eur" || session.amount_total !== reference.amountCents || session.payment_status !== "paid") return unavailable();
    intent = typeof session.payment_intent === "string"
      ? await stripe.paymentIntents.retrieve(session.payment_intent, { expand: ["latest_charge.balance_transaction"] }, options(deadline))
      : session.payment_intent;
  } else return unavailable();

  if (!intent || intent.currency !== "eur" || intent.status !== "succeeded" || intent.amount_received !== reference.amountCents) return unavailable();
  const charge = typeof intent.latest_charge === "string"
    ? await stripe.charges.retrieve(intent.latest_charge, { expand: ["balance_transaction"] }, options(deadline))
    : intent.latest_charge;
  if (!charge || !charge.paid || !charge.captured || charge.currency !== "eur" || charge.amount_captured !== reference.amountCents) return unavailable();
  const transaction = await balance(stripe, charge.balance_transaction, deadline);
  if (!validBalance(transaction)) return unavailable();
  // PayPal settlement outside Stripe exposes only Stripe's fee, not PayPal's.
  const externalPayPal = charge.payment_method_details?.type === "paypal" && transaction.amount === 0;
  if (!externalPayPal && transaction.amount !== reference.amountCents) return unavailable();
  const result = { feeCents: transaction.fee, complete: !externalPayPal };
  if (!cents(charge.amount_refunded) || charge.amount_refunded !== reference.refundedCents) result.complete = false;
  if (!(charge.amount_refunded > 0 || reference.refundedCents > 0)) return result;

  // A charge's embedded refunds list contains only ten entries. Page the full
  // list and add each balance fee once; fee_details is already included in fee.
  let cursor: string | undefined;
  let refunded = 0;
  const seenRefunds = new Set<string>();
  const seenTransactions = new Set([transaction.id]);
  try {
    while (true) {
      const page = await stripe.refunds.list({ charge: charge.id, limit: 100, expand: ["data.balance_transaction"], ...(cursor ? { starting_after: cursor } : {}) }, options(deadline));
      for (const refund of page.data) {
        if (seenRefunds.has(refund.id)) continue;
        seenRefunds.add(refund.id);
        if (refund.status !== "succeeded") continue;
        if (refund.currency !== "eur" || !cents(refund.amount)) { result.complete = false; continue; }
        refunded += refund.amount;
        const refundTransaction = await balance(stripe, refund.balance_transaction, deadline);
        if (!validBalance(refundTransaction) || (!externalPayPal && refundTransaction.amount !== -refund.amount)) { result.complete = false; continue; }
        if (!seenTransactions.has(refundTransaction.id)) {
          seenTransactions.add(refundTransaction.id);
          result.feeCents += refundTransaction.fee;
        }
      }
      if (!page.has_more) break;
      const next = page.data.at(-1)?.id;
      if (!next || next === cursor) { result.complete = false; break; }
      cursor = next;
    }
    if (refunded !== reference.refundedCents || refunded !== charge.amount_refunded) result.complete = false;
  } catch {
    result.complete = false;
  }
  return result;
}

/** Actual merchant fees only. Missing, delayed or external fees stay explicit. */
export async function loadPaymentFees(references: PaymentFeeReference[]): Promise<Map<string, PaymentFees>> {
  const results = new Map<string, PaymentFees>();
  const intentsBySession = new Map(references.filter(reference => reference.sessionId && reference.paymentIntent).map(reference => [reference.sessionId!, reference.paymentIntent!]));
  const groups = new Map<string, PaymentFeeReference[]>();
  for (const reference of references) {
    results.set(reference.id, unavailable());
    if (!cents(reference.amountCents) || !cents(reference.refundedCents) || reference.refundedCents > reference.amountCents) continue;
    if (reference.amountCents === 0) { results.set(reference.id, { feeCents: 0, complete: true }); continue; }
    const intent = reference.paymentIntent || (reference.sessionId ? intentsBySession.get(reference.sessionId) : null);
    const key = intent ? `intent:${intent}` : reference.sessionId ? `session:${reference.sessionId}` : "";
    if (!key) continue;
    const group = groups.get(key) || [];
    group.push({ ...reference, paymentIntent: intent || null });
    groups.set(key, group);
  }
  if (!groups.size) return results;
  const deadline = Date.now() + reportTimeout;
  let stripe: Stripe;
  try { stripe = await verifiedStripe(); } catch { return results; }
  const pending = [...groups.values()];
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, async () => {
    while (index < pending.length && Date.now() < deadline) {
      const group = pending[index++];
      const reference = group[0];
      if (group.some(item => item.amountCents !== reference.amountCents || item.refundedCents !== reference.refundedCents)) continue;
      let fees: PaymentFees;
      try { fees = await paymentFees(stripe, reference, deadline); } catch { fees = unavailable(); }
      for (const item of group) results.set(item.id, { ...fees });
    }
  }));
  return results;
}
