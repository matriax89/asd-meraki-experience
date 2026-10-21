import type Stripe from "stripe";
import { commerceClient, missingCommerceMigration } from "@/lib/commerce/server";
import type { CommerceConfig, CommerceOrder, CommercePass } from "@/lib/commerce/types";
import { commerceActivityName, commerceMenuName, commercePackageName, commerceQuoteLabel } from "@/lib/commerce/localization";
import { getVerifiedStripe } from "./client";
import { sendTicketConfirmation } from "@/lib/resend/client";
import { ticketUrl } from "./ticket-status";
import { resolveActivityTiming } from "@/lib/events/activity-timing";

export const isCommerceSession = (session: Pick<Stripe.Checkout.Session, "metadata">) => session.metadata?.flow_type === "event_commerce";

export async function createCommerceSession(order: CommerceOrder, siteUrl: string) {
  const grouped = new Map<string, { label: string; unitAmountCents: number; quantity: number }>();
  for (const line of order.quote.lines) {
    const label = commerceQuoteLabel(order.event_snapshot.commerce_config, line, order.locale);
    const key = JSON.stringify([label, line.unitAmountCents]);
    const previous = grouped.get(key);
    grouped.set(key, { label, unitAmountCents: line.unitAmountCents, quantity: (previous?.quantity || 0) + line.quantity });
  }
  const lines = [...grouped.values()];
  if (!lines.length || lines.length > 100 || lines.some(line => !Number.isSafeInteger(line.unitAmountCents) || line.unitAmountCents < 0)
    || lines.reduce((sum, line) => sum + line.quantity * line.unitAmountCents, 0) !== order.amount_cents) throw new Error("Unexpected order totals.");
  return (await getVerifiedStripe()).checkout.sessions.create({
    mode: "payment", currency: "eur", customer_email: order.buyer_email, locale: order.locale,
    line_items: lines.map((line) => ({ price_data: { currency: "eur", product_data: { name: line.label }, unit_amount: line.unitAmountCents }, quantity: line.quantity })),
    expires_at: Math.floor(Date.parse(order.expires_at) / 1000),
    integration_identifier: `meraki-packages-${order.id.replace(/[^a-z]/g, char => String.fromCharCode(97 + (parseInt(char, 16) || 0))).slice(0, 8)}`,
    success_url: `${siteUrl}/api/checkout/success?type=ticket&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/${order.locale}/eventi?checkout=cancelled`,
    metadata: { flow_type: "event_commerce", commerce_order_id: order.id, event_id: order.event_id, locale: order.locale },
  }, { idempotencyKey: `meraki-commerce-${order.id}` });
}

export async function deliverCommerceOrder(order: CommerceOrder, passes?: CommercePass[]) {
  if (order.email_sent_at) return;
  const db = commerceClient();
  const { data: claimed, error: claimError } = await db.rpc("claim_commerce_email", { p_order_id: order.id });
  if (claimError) throw claimError;
  if (!claimed) throw new Error("Commerce email delivery is already being processed; retry later.");
  try {
    const [eventResult, passResult] = await Promise.all([
      db.from("events").select("titolo,data_inizio,location,indirizzo,copertina_url,check_in_starts_at,slug,tipo,logistics,attivo,commerce_config").eq("id", order.event_id).single(),
      passes ? Promise.resolve({ data: passes, error: null }) : db.from("commerce_passes").select("*").eq("order_id", order.id),
    ]);
    const issued = passResult.data as CommercePass[] | null;
    if (eventResult.error || !eventResult.data || passResult.error || !issued?.length) throw new Error("Order delivery data missing.");
    for (const pass of issued) {
      const { data: rights, error } = await db.from("commerce_entitlements").select("activity_id,activity_name,menu_choice,order_id").eq("pass_id", pass.id).in("status", ["valid", "used"]);
      if (error) throw error;
      const snapshots = new Map<string, CommerceConfig | undefined>([[order.id, order.event_snapshot.commerce_config]]);
      const originalOrderIds = [...new Set((rights || []).map(right => right.order_id as string).filter(id => id && id !== order.id))];
      if (originalOrderIds.length) {
        const originals = await db.from("commerce_orders").select("id,event_snapshot").in("id", originalOrderIds);
        if (originals.error) throw originals.error;
        for (const original of originals.data || []) snapshots.set(original.id, original.event_snapshot?.commerce_config);
      }
      const accessDetails = (rights || []).map(right => {
        const config = snapshots.get(right.order_id) || order.event_snapshot.commerce_config;
        return { ...resolveActivityTiming(eventResult.data.commerce_config, config, right.activity_id), name: commerceActivityName(config, right.activity_id, right.activity_name, order.locale),
          menuChoice: right.menu_choice ? commerceMenuName(config, right.activity_id, right.menu_choice, order.locale) : null };
      });
      const { data: contact, error: contactError } = await db.from("commerce_attendee_contacts")
        .select("email,order_id,participant_index").eq("pass_id", pass.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (contactError && !missingCommerceMigration(contactError)) throw contactError;
      if (order.attendees?.length && !contact?.email) throw new Error("Participant email is unavailable; retry delivery after restoring the contact.");
      const marketing = contact ? await (await import("@/lib/email/marketing")).prepareMarketingEmailLinks(contact.order_id, contact.participant_index, order.locale) : undefined;
      const sent = await sendTicketConfirmation({ id: pass.id, qr_code: pass.qr_code, buyer_email: contact?.email || order.buyer_email, buyer_nome: pass.first_name, buyer_cognome: pass.last_name }, eventResult.data, order.locale, {
        deliveryId: `${order.id}-${pass.id}`, accessNames: accessDetails.map(right => right.name),
        packageName: commercePackageName(order.event_snapshot.commerce_config, pass.package_id, pass.package_name, order.locale),
        accessDetails,
        marketing,
      });
      if (!sent.success) throw new Error("Commerce email delivery pending.");
    }
    const { error } = await db.rpc("complete_commerce_email", { p_order_id: order.id, p_success: true });
    if (error) throw error;
  } catch (error) {
    await db.rpc("complete_commerce_email", { p_order_id: order.id, p_success: false });
    throw error;
  }
}

export async function fulfillCommerceSession(session: Stripe.Checkout.Session) {
  if (!isCommerceSession(session) || !session.metadata?.commerce_order_id) throw new Error("Unexpected commerce flow.");
  if (!["paid", "no_payment_required"].includes(session.payment_status)) return;
  if (session.currency !== "eur" || session.mode !== "payment" || session.amount_total === null) throw new Error("Unexpected commerce payment.");
  const db = commerceClient();
  const { data: orderData, error: orderError } = await db.from("commerce_orders").select("*").eq("id", session.metadata.commerce_order_id).single();
  if (orderError || !orderData) throw new Error("Commerce order not found.");
  const order = orderData as CommerceOrder;
  if (session.metadata.event_id !== order.event_id) throw new Error("Commerce event mismatch.");
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
  const { data, error } = await db.rpc("fulfill_event_commerce", {
    p_order_id: order.id, p_session_id: session.id, p_payment_intent: paymentIntent,
    p_amount_cents: session.amount_total, p_buyer_email: order.buyer_email,
  });
  if (error) throw new Error("Commerce fulfillment transaction failed.");
  if (data.outcome === "refund_pending" || data.outcome === "refunded") return;
  if (data.outcome === "refund_required") {
    if (order.amount_cents === 0 && session.amount_total === 0) {
      const { error: expireError } = await db.rpc("transition_commerce_order", { p_order_id: order.id, p_session_id: session.id, p_state: "expired" });
      if (expireError) throw expireError;
      return;
    }
    if (!paymentIntent) throw new Error("Commerce refund requires review.");
    const refund = await (await getVerifiedStripe()).refunds.create({ payment_intent: paymentIntent, metadata: { meraki_commerce_order_id: order.id } }, { idempotencyKey: `meraki-commerce-refund-${order.id}` });
    await updateCommerceRefund(refund);
    if (refund.status === "failed" || refund.status === "canceled") throw new Error("Commerce refund requires review.");
    return;
  }
  if (data.outcome !== "fulfilled") throw new Error("Commerce fulfillment was not confirmed.");
  await deliverCommerceOrder(order, data.passes as CommercePass[]);
}

export async function transitionCommerceSession(session: Stripe.Checkout.Session, state: "awaiting_payment" | "expired" | "payment_failed") {
  const { error } = await commerceClient().rpc("transition_commerce_order", {
    p_order_id: session.metadata?.commerce_order_id, p_session_id: session.id, p_state: state,
  });
  if (error) throw error;
}

export async function updateCommerceRefund(refund: Stripe.Refund) {
  if (!refund.metadata?.meraki_commerce_order_id) return;
  const db = commerceClient();
  if (refund.status === "succeeded") {
    const paymentIntent = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id;
    if (!paymentIntent) throw new Error("Refund payment identity missing.");
    await revokeCommercePayment(paymentIntent, refund.id);
    return;
  }
  const { error } = await db.from("commerce_orders").update({
    refund_id: refund.id, refund_status: refund.status,
    state: "refund_pending", failure_reason: refund.failure_reason || null,
  }).eq("id", refund.metadata.meraki_commerce_order_id).neq("state", "refunded");
  if (error) throw error;
}

export async function revokeCommercePayment(paymentIntent: string, refundId: string | null = null) {
  const { error } = await commerceClient().rpc("revoke_commerce_payment", { p_payment_intent: paymentIntent, p_refund_id: refundId, p_refund_status: "succeeded" });
  if (error && !missingCommerceMigration(error)) throw error;
}

export async function getCommerceCheckoutStatus(session: Stripe.Checkout.Session, locale: string) {
  const db = commerceClient();
  const { data, error } = await db.from("commerce_orders").select("*").eq("id", session.metadata?.commerce_order_id).eq("stripe_session_id", session.id).maybeSingle();
  if (error) throw error;
  if (!data) return { status: "processing" as const, locale };
  const order = data as CommerceOrder;
  if (["refund_required", "refund_pending"].includes(order.state)) return { status: "refund_pending" as const, locale };
  if (order.state === "refunded") return { status: "refunded" as const, locale };
  if (order.state === "expired" || session.status === "expired") return { status: "expired" as const, locale };
  if (order.state === "payment_failed") return { status: "failed" as const, locale };
  if (order.state === "fulfilled") {
    const query = db.from("commerce_passes").select("*");
    const result = order.upgrade_pass_id ? await query.eq("id", order.upgrade_pass_id) : await query.eq("order_id", order.id);
    if (result.error) throw result.error;
    const tickets = (result.data as CommercePass[]).filter(pass => pass.status === "paid").map(pass => ({
      id: pass.id, qr_code: pass.qr_code, url: ticketUrl(pass, locale), title: commercePackageName(order.event_snapshot.commerce_config, pass.package_id, pass.package_name, locale), name: `${pass.first_name} ${pass.last_name}`,
    }));
    if (tickets.length) return { status: "ready" as const, locale, url: tickets[0].url, tickets };
  }
  return { status: session.payment_status === "unpaid" ? "awaiting_payment" as const : "processing" as const, locale };
}
