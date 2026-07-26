import { NextResponse } from "next/server";
import { getLocalizedText } from "@/lib/i18n-utils";
import { createClient } from "@/lib/supabase/server";
import { createTicketCheckoutSession } from "@/lib/stripe/checkout-ticket";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/server";
import { deliverTicketEmails } from "@/lib/stripe/fulfill-ticket";
import { validateRegistrationAnswers } from "@/lib/events/registration-fields";

const requestSchema = z.object({
  eventId: z.string().uuid(),
  buyerEmail: z.string().email(),
  buyerName: z.string().trim().min(2).max(120),
  locale: z.enum(["it", "en", "de"]).default("it"),
  registrationAnswers: z.record(z.string(), z.union([z.string(), z.boolean()])).optional().default({}),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { eventId, buyerEmail, buyerName, locale, registrationAnswers } = requestSchema.parse(body);
    const nameParts = buyerName.trim().split(/\s+/);
    const buyerNome = nameParts.shift() || "";
    const buyerCognome = nameParts.join(" ");

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
    const answerValidation = validateRegistrationAnswers((event as any).registration_fields, registrationAnswers);
    if (answerValidation.error) {
      return NextResponse.json({ error: answerValidation.error }, { status: 400 });
    }

    const origin = request.headers.get("origin");
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin || "http://localhost:3000";

    if ((event.prezzo_cents || 0) === 0) {
      const adminSupabase = createAdminClient();
      const isTrialCampaign = Boolean((event as any).trial_campaign_key);
      const { data: ticket, error: ticketError } = isTrialCampaign
        ? await (adminSupabase.rpc as any)("reserve_trial_event_ticket", {
            p_event_id: event.id,
            p_buyer_email: buyerEmail,
            p_locale: locale,
            p_buyer_nome: buyerNome,
            p_buyer_cognome: buyerCognome,
            p_registration_answers: answerValidation.answers,
          })
        : await (adminSupabase.rpc as any)("reserve_event_ticket", {
            p_event_id: event.id,
            p_buyer_email: buyerEmail,
            p_amount_cents: 0,
            p_locale: locale,
            p_stripe_session_id: null,
            p_stripe_payment_intent: null,
            p_buyer_nome: buyerNome,
            p_buyer_cognome: buyerCognome,
          });
      if (ticketError || !ticket) {
        const soldOut = ticketError?.message?.includes("EVENT_SOLD_OUT");
        const trialAlreadyUsed = ticketError?.message?.includes("TRIAL_ALREADY_USED");
        if (trialAlreadyUsed) {
          const { data: settings } = await adminSupabase
            .from("site_settings")
            .select("value")
            .eq("key", "homepage_content")
            .maybeSingle();
          const appSettings = (settings?.value as any)?.sportclubby_banner || {};
          return NextResponse.json({
            code: "TRIAL_ALREADY_USED",
            error: "Hai già utilizzato la tua lezione di prova gratuita. Le prossime lezioni si prenotano tramite l’app Sportclubby.",
            appLinks: {
              apple: appSettings.apple_link || "https://apps.apple.com/it/app/sportclubby/id1250917631",
              google: appSettings.google_link || "https://play.google.com/store/apps/details?id=com.sportclubby.app",
            },
          }, { status: 409 });
        }
        return NextResponse.json(
          { error: soldOut ? "Posti esauriti" : "Non è stato possibile completare l’iscrizione" },
          { status: soldOut ? 409 : 400 },
        );
      }
      if (!isTrialCampaign) {
        await adminSupabase
          .from("tickets")
          .update({ registration_answers: answerValidation.answers } as any)
          .eq("id", ticket.id);
      }
      await deliverTicketEmails({ ...ticket, registration_answers: answerValidation.answers }, event);
      return NextResponse.json({
        url: `/${locale}/biglietto/${ticket.id}?token=${ticket.access_token}`,
        free: true,
      });
    }

    // Create Stripe Session
    const session = await createTicketCheckoutSession({
      eventId: event.id,
      eventSlug: event.slug,
      title: getLocalizedText(event.titolo, locale),
      priceCents: event.prezzo_cents || 0,
      capacity: event.capacity || 0,
      buyerEmail,
      tipo: event.tipo,
      siteUrl,
      locale,
      buyerNome,
      buyerCognome,
    });
    const adminSupabase = createAdminClient();
    const { error: answersError } = await (adminSupabase as any)
      .from("ticket_checkout_answers")
      .upsert({
        stripe_session_id: session.id,
        event_id: event.id,
        answers: answerValidation.answers,
      });
    if (answersError) {
      console.error("Ticket answers persistence failed:", answersError);
      return NextResponse.json({ error: "Non è stato possibile salvare i dati dell’iscrizione." }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Ticket checkout error:", error);
    return NextResponse.json(
      { error: "Errore durante la creazione del pagamento" },
      { status: 500 }
    );
  }
}
