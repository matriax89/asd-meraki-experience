import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { sendTicketConfirmation, sendTicketNotification } from "@/lib/resend/client";

export async function deliverTicketEmails(ticket: any, eventData?: any) {
  const supabase = createAdminClient();
  const event = eventData || (await supabase.from("events").select("*").eq("id", ticket.event_id).single()).data;
  if (!event) return ticket;

  const updates: { customer_email_sent_at?: string; admin_email_sent_at?: string } = {};
  if (!ticket.customer_email_sent_at) {
    const result = await sendTicketConfirmation(ticket, event, ticket.locale || "it");
    if (result?.success) updates.customer_email_sent_at = new Date().toISOString();
  }
  if (!ticket.admin_email_sent_at) {
    const result = await sendTicketNotification(ticket, event);
    if (result?.success) updates.admin_email_sent_at = new Date().toISOString();
  }
  if (Object.keys(updates).length) {
    await supabase.from("tickets").update(updates).eq("id", ticket.id);
  }
  return { ...ticket, ...updates };
}

export async function fulfillTicket(session: Stripe.Checkout.Session) {
  if (
    session.payment_status !== "paid" ||
    !["ticket_event", "ticket_workshop"].includes(session.metadata?.flow_type || "")
  ) return null;

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("tickets")
    .select("*")
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (existing) {
    const enriched = await attachRegistrationAnswers(supabase, existing, session.id);
    return deliverTicketEmails(enriched);
  }

  const paymentIntent = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id || null;
  const { data, error } = await (supabase.rpc as any)("reserve_event_ticket", {
    p_event_id: session.metadata!.event_id,
    p_buyer_email: session.metadata!.buyer_email || session.customer_details?.email || "",
    p_amount_cents: session.amount_total || 0,
    p_locale: session.metadata!.locale || "it",
    p_stripe_session_id: session.id,
    p_stripe_payment_intent: paymentIntent,
    p_buyer_nome: session.metadata!.buyer_nome || null,
    p_buyer_cognome: session.metadata!.buyer_cognome || null,
  });
  if (error || !data) throw new Error(error?.message || "Ticket reservation failed");
  const enriched = await attachRegistrationAnswers(supabase, data, session.id);
  return deliverTicketEmails(enriched);
}

async function attachRegistrationAnswers(supabase: ReturnType<typeof createAdminClient>, ticket: any, stripeSessionId: string) {
  const { data: draft } = await (supabase as any)
    .from("ticket_checkout_answers")
    .select("answers")
    .eq("stripe_session_id", stripeSessionId)
    .maybeSingle();
  if (!draft?.answers) return ticket;
  await Promise.all([
    supabase.from("tickets").update({ registration_answers: draft.answers } as any).eq("id", ticket.id),
    (supabase as any).from("ticket_checkout_answers").delete().eq("stripe_session_id", stripeSessionId),
  ]);
  return { ...ticket, registration_answers: draft.answers };
}
