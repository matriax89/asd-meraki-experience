import { getVerifiedStripe } from "./client";

export async function createTicketCheckoutSession({
  reservationId, eventId, eventSlug, title, priceCents, buyerEmail, tipo,
  siteUrl, locale, expiresAt,
}: {
  reservationId: string;
  eventId: string;
  eventSlug: string;
  title: string;
  priceCents: number;
  buyerEmail: string;
  tipo: "evento" | "workshop" | "masterclass";
  siteUrl: string;
  locale: string;
  expiresAt: string;
}) {
  const stripe = await getVerifiedStripe();
  const checkoutLocale = locale === "en" || locale === "de" || locale === "es" ? locale : "it";
  const ticketLabel = { it: "Biglietto Meraki", en: "Meraki ticket", de: "Meraki-Ticket", es: "Entrada Meraki" }[checkoutLocale];
  return stripe.checkout.sessions.create({
    locale: checkoutLocale,
    customer_email: buyerEmail,
    line_items: [{
      price_data: {
        currency: "eur",
        product_data: { name: title, description: `${ticketLabel}: ${title}` },
        unit_amount: priceCents,
      },
      quantity: 1,
    }],
    mode: "payment",
    integration_identifier: `meraki-events-${reservationId.replace(/[^a-z]/g, (char) => String.fromCharCode(97 + (parseInt(char, 16) || 0))).slice(0, 8)}`,
    expires_at: Math.floor(new Date(expiresAt).getTime() / 1000),
    success_url: `${siteUrl}/api/checkout/success?session_id={CHECKOUT_SESSION_ID}&type=ticket`,
    cancel_url: `${siteUrl}/${locale}/${tipo === "evento" ? "eventi" : "workshop"}/${encodeURIComponent(eventSlug)}?checkout=cancelled`,
    metadata: {
      flow_type: tipo === "evento" ? "ticket_event" : "ticket_workshop",
      reservation_id: reservationId,
      event_id: eventId,
      buyer_email: buyerEmail,
      locale,
    },
  }, { idempotencyKey: `meraki-ticket-${reservationId}` });
}
