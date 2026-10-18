import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { getVerifiedStripe } from "./client";

export function isTicketSession(session: Pick<Stripe.Checkout.Session, "metadata">) {
  return session.metadata?.flow_type === "ticket_event" || session.metadata?.flow_type === "ticket_workshop";
}

export function ticketUrl(ticket: { id: string; qr_code: string | null }, locale = "it") {
  return `/${["it", "en", "de", "es"].includes(locale) ? locale : "it"}/biglietto/${ticket.id}?token=${encodeURIComponent(ticket.qr_code || "")}`;
}

export async function getTicketCheckoutStatus(sessionId: string) {
  if (!/^cs_(test_|live_)?[a-zA-Z0-9_]{10,}$/.test(sessionId)) {
    return { status: "invalid" as const, locale: "it" };
  }
  const session = await (await getVerifiedStripe()).checkout.sessions.retrieve(sessionId);
  const locale = ["it", "en", "de", "es"].includes(session.metadata?.locale || "") ? session.metadata!.locale : "it";
  if (session.metadata?.flow_type === "event_commerce") {
    return (await import("./commerce")).getCommerceCheckoutStatus(session, locale);
  }
  if (!isTicketSession(session)) return { status: "invalid" as const, locale };
  const supabase = createAdminClient();
  const { data: reservation, error: reservationError } = await supabase.from("ticket_reservations")
    .select("state, refund_status").eq("stripe_session_id", sessionId).maybeSingle();
  if (reservationError) throw new Error("Cannot read checkout status.");
  if (reservation?.state === "refund_required" || reservation?.state === "refund_pending") {
    return { status: "refund_pending" as const, locale };
  }
  if (reservation?.state === "refunded") return { status: "refunded" as const, locale };
  if (session.status === "expired") return { status: "expired" as const, locale };
  if (reservation?.state === "payment_failed") return { status: "failed" as const, locale };
  if (session.payment_status === "paid" || session.payment_status === "no_payment_required") {
    const { data: ticket, error } = await supabase.from("tickets")
      .select("id, qr_code, status").eq("stripe_session_id", sessionId).maybeSingle();
    if (error) throw new Error("Cannot read issued ticket.");
    if (ticket?.status === "refunded") return { status: "refunded" as const, locale };
    if (ticket?.qr_code) return { status: "ready" as const, locale, url: ticketUrl(ticket, locale) };
    return { status: "processing" as const, locale };
  }
  return { status: "awaiting_payment" as const, locale };
}
