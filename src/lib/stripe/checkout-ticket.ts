import { stripe } from "./client";

export async function createTicketCheckoutSession({
  eventId,
  eventSlug,
  title,
  priceCents,
  capacity,
  buyerEmail,
  tipo,
  siteUrl,
}: {
  eventId: string;
  eventSlug: string;
  title: string;
  priceCents: number;
  capacity: number;
  buyerEmail: string;
  tipo: "evento" | "workshop" | "masterclass";
  siteUrl: string;
  locale?: string;
}) {

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    customer_email: buyerEmail,
    line_items: [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name: title,
            description: `Biglietto per ${tipo}: ${title}`,
          },
          unit_amount: priceCents,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${siteUrl}/api/checkout/success?session_id={CHECKOUT_SESSION_ID}&type=ticket`,
    cancel_url: `${siteUrl}/${tipo === 'evento' ? 'eventi' : 'workshop'}/${eventSlug}`,
    metadata: {
      flow_type: tipo === "evento" ? "ticket_event" : "ticket_workshop",
      event_id: eventId,
      buyer_email: buyerEmail,
      locale: locale || "it",
    },
  });

  return session;
}
