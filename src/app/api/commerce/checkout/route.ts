import { z } from "zod";
import { commerceClient } from "@/lib/commerce/server";
import type { CommerceOrder } from "@/lib/commerce/types";
import { commerceBody, commerceResponse, commerceFailure, requestFailure, selectionSchema } from "@/lib/commerce/http";
import { getVerifiedStripe, PaymentConfigurationError } from "@/lib/stripe/client";
import { createCommerceSession } from "@/lib/stripe/commerce";
import { ATTENDEE_PRIVACY_VERSION, parseCheckoutAttendees } from "@/lib/commerce/attendee";

const checkoutSchema = selectionSchema.and(z.object({ buyerEmail: z.string().trim().toLowerCase().email().max(254), locale: z.enum(["it", "en", "de", "es"]).default("it"), checkoutAttemptId: z.string().uuid(), expectedTotalCents: z.number().int().min(0).max(10_000_000), attendees: z.unknown().optional() }));
export async function POST(request: Request) {
  try {
    const body = checkoutSchema.parse(await commerceBody(request));
    const attendees = body.upgradePassId ? null : parseCheckoutAttendees(body.attendees, body.participants);
    if (!body.upgradePassId && (!attendees || attendees[0].email !== body.buyerEmail)) {
      return commerceResponse({ code: "invalid_attendees", error: "Controlla i dati di ogni partecipante e l’email dell’acquirente." }, 400);
    }
    const stripe = await getVerifiedStripe();
    const db = commerceClient();
    const { data, error } = await db.rpc(body.upgradePassId ? "reserve_event_commerce" : "reserve_event_commerce_attendees", {
      p_event_id: body.eventId, p_request_id: body.checkoutAttemptId, p_buyer_email: body.buyerEmail,
      p_locale: body.locale, p_participants: body.participants,
      p_upgrade_pass_id: body.upgradePassId || null, p_upgrade_token: body.upgradeToken || null,
      ...(!body.upgradePassId ? { p_attendees: attendees, p_privacy_version: ATTENDEE_PRIVACY_VERSION } : {}),
    });
    if (error) throw error;
    if (data.error || !data.order) return commerceFailure(data.error || "invalid_selection");
    const order = data.order as CommerceOrder;
    if (order.amount_cents !== body.expectedTotalCents) {
      if (!order.stripe_session_id) await db.rpc("transition_commerce_order", { p_order_id: order.id, p_session_id: null, p_state: "expired" });
      return commerceResponse({ code: "price_changed", error: "Il prezzo è cambiato. Controlla il nuovo totale e conferma nuovamente.", quote: order.quote }, 409);
    }
    if (order.stripe_session_id) {
      const existing = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
      if (existing.status === "open" && existing.url) return commerceResponse({ url: existing.url });
      if (existing.status === "complete") return commerceResponse({ url: `/api/checkout/success?type=ticket&session_id=${encodeURIComponent(existing.id)}` });
      await db.rpc("transition_commerce_order", { p_order_id: order.id, p_session_id: existing.id, p_state: "expired" });
      return commerceFailure("request_expired");
    }
    if (Date.parse(order.expires_at) < Date.now() + 31 * 60_000) {
      // A timed-out Stripe request may have created a Session before attaching
      // it locally. Keep its hold until its real expiry; don't start a second
      // payment for the same selection while that result is uncertain.
      return commerceResponse({ code: "checkout_pending", error: "Il precedente tentativo di pagamento è ancora in verifica. Attendi la scadenza della prenotazione prima di riprovare: i posti restano riservati temporaneamente." }, 409);
    }
    const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).origin;
    const session = await createCommerceSession(order, siteUrl);
    const { error: attachError } = await db.from("commerce_orders").update({ stripe_session_id: session.id }).eq("id", order.id);
    if (attachError || !session.url) throw new Error("Checkout could not be attached.");
    return commerceResponse({ url: session.url });
  } catch (error) {
    if (error instanceof PaymentConfigurationError) return commerceResponse({ error: error.message }, 503);
    return requestFailure(error);
  }
}
