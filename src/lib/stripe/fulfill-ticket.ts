import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { sendTicketConfirmation } from "@/lib/resend/client";
import type { Database } from "@/types/supabase";
import { getVerifiedStripe } from "./client";

type Ticket = Database["public"]["Tables"]["tickets"]["Row"];
type Fulfillment = {
  outcome: "fulfilled" | "refund_required" | "refund_pending" | "refunded";
  ticket?: Ticket;
  reservation_id?: string;
};

export async function fulfillTicketSession(session: Stripe.Checkout.Session) {
  const metadata = session.metadata;
  if (!metadata?.event_id || !metadata.buyer_email) throw new Error("Missing ticket metadata.");
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return;
  if (session.mode !== "payment" || session.currency !== "eur" || session.amount_total === null) {
    throw new Error("Unexpected ticket payment.");
  }
  const supabase = createAdminClient();
  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
  const { data, error } = await supabase.rpc("fulfill_event_ticket", {
    p_reservation_id: metadata.reservation_id || null,
    p_event_id: metadata.event_id,
    p_session_id: session.id,
    p_payment_intent: paymentIntent,
    p_buyer_email: metadata.buyer_email,
    p_amount_cents: session.amount_total,
  });
  if (error) throw new Error("Ticket fulfillment transaction failed.");
  const result = data as Fulfillment;
  if (result.outcome === "refunded" || result.outcome === "refund_pending") return;
  if (result.outcome === "refund_required") {
    if (!paymentIntent || !result.reservation_id) throw new Error("Paid reservation requires manual refund review.");
    const refund = await (await getVerifiedStripe()).refunds.create({
      payment_intent: paymentIntent,
      metadata: { meraki_reservation_id: result.reservation_id, reason: "ticket_capacity_unavailable" },
    }, { idempotencyKey: `meraki-refund-${session.id}` });
    if (refund.status === "failed" || refund.status === "canceled") throw new Error("Ticket refund needs attention.");
    const { error: refundError } = await supabase.from("ticket_reservations").update({
      refund_id: refund.id,
      refund_status: refund.status,
      state: refund.status === "succeeded" ? "refunded" : "refund_pending",
    }).eq("id", result.reservation_id).neq("state", "refunded");
    if (refundError) throw new Error("Refund status could not be recorded.");
    return;
  }
  const ticket = result.ticket;
  if (!ticket) throw new Error("Ticket was not issued.");
  if (ticket.email_sent_at || ticket.status === "refunded") return;
  const { data: claimed, error: claimError } = await supabase.rpc("claim_ticket_email", { p_ticket_id: ticket.id });
  if (claimError || !claimed) throw new Error("Ticket email delivery is pending.");
  try {
    const { data: eventData, error: eventError } = await supabase.from("events")
      .select("titolo, data_inizio, location, indirizzo, copertina_url, check_in_starts_at, slug, tipo, logistics, attivo").eq("id", ticket.event_id!).single();
    if (eventError || !eventData) throw new Error("Ticket event could not be loaded.");
    const marketing = metadata.reservation_id
      ? await (await import("@/lib/email/marketing")).prepareLegacyMarketingEmailLinks(metadata.reservation_id, metadata.locale || "it") : undefined;
    const delivery = await sendTicketConfirmation(ticket, eventData, metadata.locale || "it", marketing ? { deliveryId: ticket.id, accessNames: [], marketing } : undefined);
    if (!delivery?.success) throw new Error("Ticket email could not be delivered.");
    const { error: markError } = await supabase.from("tickets")
      .update({ email_sent_at: new Date().toISOString(), email_claimed_at: null }).eq("id", ticket.id);
    if (markError) throw new Error("Ticket email status could not be recorded.");
  } catch (error: unknown) {
    await supabase.from("tickets").update({ email_claimed_at: null }).eq("id", ticket.id);
    throw error;
  }
}

export async function transitionTicketSession(session: Stripe.Checkout.Session, state: "awaiting_payment" | "expired" | "payment_failed") {
  if (!session.metadata?.reservation_id) return;
  const { error } = await createAdminClient().rpc("transition_ticket_reservation", {
    p_reservation_id: session.metadata.reservation_id, p_session_id: session.id, p_state: state,
  });
  if (error) throw new Error("Reservation transition failed.");
}

export async function updateTicketRefund(refund: Stripe.Refund) {
  const reservationId = refund.metadata?.meraki_reservation_id;
  if (!reservationId) return;
  const state = refund.status === "succeeded" ? "refunded" : "refund_pending";
  let update = createAdminClient().from("ticket_reservations")
    .update({ state, refund_id: refund.id, refund_status: refund.status,
      failure_reason: refund.failure_reason || null }).eq("id", reservationId);
  // A stale pending/failed event cannot undo an already confirmed refund.
  if (state !== "refunded") update = update.neq("state", "refunded");
  const { error } = await update;
  if (error) throw new Error("Refund update failed.");
  if (refund.status === "failed" || refund.status === "canceled") {
    console.error("Meraki ticket refund requires operator action.");
  }
}

export async function revokeRefundedTicket(charge: Stripe.Charge) {
  if (!charge.refunded) return;
  const paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntent) return;
  const { error } = await createAdminClient().rpc("revoke_event_ticket", { p_payment_intent: paymentIntent });
  if (error) throw new Error("Refunded ticket could not be revoked.");
}
