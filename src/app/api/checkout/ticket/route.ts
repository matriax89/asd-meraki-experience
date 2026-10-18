import { NextResponse } from "next/server";
import { getLocalizedText } from "@/lib/i18n-utils";
import { createAdminClient } from "@/lib/supabase/server";
import { createTicketCheckoutSession } from "@/lib/stripe/checkout-ticket";
import { getVerifiedStripe, PaymentConfigurationError } from "@/lib/stripe/client";
import { z } from "zod";
import { ATTENDEE_PRIVACY_VERSION, attendeeSchema } from "@/lib/commerce/attendee";
import { commerceClient } from "@/lib/commerce/server";

const requestSchema = z.object({
  eventId: z.string().uuid(),
  buyerEmail: z.string().trim().email().max(254),
  buyerNome: z.string().trim().min(1).max(100),
  buyerCognome: z.string().trim().min(1).max(100),
  checkoutAttemptId: z.string().uuid(),
  locale: z.enum(["it", "en", "de", "es"]).default("it"),
  attendee: attendeeSchema,
});

type Reservation = {
  id: string; event_id: string; slug: string; titolo: unknown;
  tipo: "evento" | "workshop" | "masterclass";
  amount_cents: number; expires_at: string; stripe_session_id: string | null; locale: string;
};

export async function POST(request: Request) {
  try {
    const { eventId, buyerEmail, buyerNome, buyerCognome, checkoutAttemptId, locale, attendee } = requestSchema.parse(await request.json());
    if (attendee.email !== buyerEmail.trim().toLowerCase() || attendee.firstName !== buyerNome || attendee.lastName !== buyerCognome) {
      return NextResponse.json({ code: "invalid_attendees", error: "Controlla i dati del partecipante." }, { status: 400 });
    }
    const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).origin;
    const origin = request.headers.get("origin");
    if (origin && origin !== siteUrl && origin !== new URL(request.url).origin) {
      return NextResponse.json({ error: "Origine della richiesta non valida." }, { status: 403 });
    }
    await getVerifiedStripe();
    const supabase = createAdminClient();
    const { data, error } = await commerceClient().rpc("reserve_event_ticket_attendee", {
      p_event_id: eventId, p_buyer_email: buyerEmail, p_locale: locale,
      p_request_id: checkoutAttemptId, p_buyer_nome: buyerNome, p_buyer_cognome: buyerCognome,
      p_attendee: attendee, p_privacy_version: ATTENDEE_PRIVACY_VERSION,
    });
    if (error) throw new Error("Impossibile prenotare il posto.");
    const result = data as { error?: string; reservation?: Reservation };
    if (!result.reservation) {
      const message = result.error === "sold_out" ? "Posti esauriti o temporaneamente prenotati. Riprova più tardi."
        : result.error === "request_expired" ? "La sessione è scaduta. Avvia un nuovo acquisto."
        : result.error === "invalid_price" ? "Questo evento non è disponibile per l'acquisto online."
        : result.error === "advanced_checkout_required" ? "Questo evento prevede formule e pacchetti. Riapri la pagina e scegli la tua esperienza."
        : "Evento non disponibile per l'acquisto.";
      return NextResponse.json({ error: message, code: result.error }, { status: result.error === "sold_out" || result.error === "request_expired" ? 409 : 400 });
    }
    const reservation = result.reservation;
    if (reservation.stripe_session_id) {
      const existing = await (await getVerifiedStripe()).checkout.sessions.retrieve(reservation.stripe_session_id);
      if (existing.status === "open" && existing.url) {
        return NextResponse.json({ url: existing.url }, { headers: { "Cache-Control": "no-store" } });
      }
      if (existing.status === "complete") {
        return NextResponse.json({ url: `/api/checkout/success?session_id=${encodeURIComponent(existing.id)}&type=ticket` }, { headers: { "Cache-Control": "no-store" } });
      }
      await supabase.rpc("transition_ticket_reservation", { p_reservation_id: reservation.id, p_session_id: existing.id, p_state: "expired" });
      return NextResponse.json({ error: "La sessione è scaduta. Avvia un nuovo acquisto.", code: "request_expired" }, { status: 409 });
    }
    if (Date.parse(reservation.expires_at) < Date.now() + 31 * 60 * 1000) {
      await supabase.rpc("transition_ticket_reservation", { p_reservation_id: reservation.id, p_session_id: null, p_state: "expired" });
      return NextResponse.json({ error: "La prenotazione è scaduta. Avvia un nuovo acquisto.", code: "request_expired" }, { status: 409 });
    }
    const session = await createTicketCheckoutSession({
      reservationId: reservation.id, eventId: reservation.event_id,
      eventSlug: reservation.slug, title: getLocalizedText(reservation.titolo, reservation.locale),
      priceCents: reservation.amount_cents, buyerEmail, tipo: reservation.tipo,
      siteUrl, locale: reservation.locale, expiresAt: reservation.expires_at,
    });
    const { error: attachError } = await supabase.from("ticket_reservations")
      .update({ stripe_session_id: session.id }).eq("id", reservation.id);
    if (attachError || !session.url) throw new Error("Impossibile preparare il pagamento.");
    return NextResponse.json({ url: session.url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    // Keep the hold on ambiguous failures. A concurrent retry may already have
    // received this Checkout URL; Stripe expiration and the hold TTL release it.
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Inserisci un indirizzo email valido e seleziona un evento." }, { status: 400 });
    }
    if (error instanceof PaymentConfigurationError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Ticket checkout could not be created.");
    return NextResponse.json({ error: "Impossibile avviare il pagamento. Riprova tra poco." }, { status: 500 });
  }
}
