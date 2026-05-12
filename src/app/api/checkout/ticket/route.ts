import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTicketCheckoutSession } from "@/lib/stripe/checkout-ticket";
import { z } from "zod";

const requestSchema = z.object({
  eventId: z.string().uuid(),
  buyerEmail: z.string().email(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { eventId, buyerEmail } = requestSchema.parse(body);

    const supabase = await createClient();

    // Fetch event details
    const { data: event, error } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .single();

    if (error || !event || !event.attivo) {
      return NextResponse.json(
        { error: "Evento non trovato o non attivo" },
        { status: 404 }
      );
    }

    // Check capacity
    if (event.capacity && (event.posti_venduti || 0) >= event.capacity) {
      return NextResponse.json(
        { error: "Posti esauriti" },
        { status: 400 }
      );
    }

    // Create Stripe Session
    const session = await createTicketCheckoutSession({
      eventId: event.id,
      eventSlug: event.slug,
      title: event.titolo,
      priceCents: event.prezzo_cents || 0,
      capacity: event.capacity || 0,
      buyerEmail,
      tipo: event.tipo,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Ticket checkout error:", error);
    return NextResponse.json(
      { error: "Errore durante la creazione del pagamento" },
      { status: 500 }
    );
  }
}
