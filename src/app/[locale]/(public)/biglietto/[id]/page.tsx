import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import QRCode from "qrcode";
import { getLocalizedText } from "@/lib/i18n-utils";

export default async function BigliettoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; locale: string }>;
  searchParams: Promise<{ session_id?: string; token?: string }>;
}) {
  const { id, locale } = await params;
  const { session_id: sessionId, token } = await searchParams;
  if (!sessionId && !token) notFound();
  const supabase = createAdminClient();

  // Fetch the ticket and join with the event
  const { data: ticket, error } = await supabase
    .from("tickets")
    .select(`
      *,
      event:events(*)
    `)
    .eq("id", id)
    .match(token ? { access_token: token } : { stripe_session_id: sessionId! })
    .single();

  if (error || !ticket || !ticket.event) {
    notFound();
  }

  // Generate QR code data URI
  const qrCodeDataUri = await QRCode.toDataURL(ticket.qr_code || id, {
    width: 256,
    margin: 2,
    color: {
      dark: "#0A0A0A",
      light: "#FFFFFF",
    },
  });

  const event = ticket.event as any;
  const date = new Date(event.data_inizio);
  const formattedDate = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "Europe/Rome" }).format(date);
  const formattedTime = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(date);
  const copy = {
    it: { ticket: "Biglietto", holder: "Intestatario", date: "Data", time: "Ora", place: "Luogo", status: "Stato", footer: "Mostra questo QR code all’ingresso dell’evento." },
    en: { ticket: "Ticket", holder: "Holder", date: "Date", time: "Time", place: "Venue", status: "Status", footer: "Show this QR code at the event entrance." },
    de: { ticket: "Eintrittskarte", holder: "Inhaber", date: "Datum", time: "Uhrzeit", place: "Ort", status: "Status", footer: "Zeigen Sie diesen QR-Code am Eingang." },
  }[locale as "it" | "en" | "de"] || { ticket: "Biglietto", holder: "Intestatario", date: "Data", time: "Ora", place: "Luogo", status: "Stato", footer: "Mostra questo QR code all’ingresso dell’evento." };

  return (
    <div className="container py-12 flex justify-center">
      <div className="max-w-md w-full bg-card rounded-2xl shadow-xl overflow-hidden border border-border">
        {/* Ticket Header */}
        <div className="bg-primary p-6 text-primary-foreground text-center">
          <div className="text-sm font-bold uppercase tracking-wider mb-2 opacity-80">
            {copy.ticket} {event.tipo}
          </div>
          <h1 className="text-2xl font-heading font-bold">{getLocalizedText(event.titolo, locale)}</h1>
        </div>

        {/* Ticket Body */}
        <div className="p-8 flex flex-col items-center">
          <img 
            src={qrCodeDataUri} 
            alt="QR Code Biglietto" 
            className="w-48 h-48 mb-8 border border-border rounded-lg p-2" 
          />
          
          <div className="w-full space-y-4">
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">{copy.holder}</span>
              <span className="font-semibold text-foreground">{ticket.buyer_email}</span>
            </div>
            
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">{copy.date}</span>
              <span className="font-semibold text-foreground">{formattedDate}</span>
            </div>
            
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">{copy.time}</span>
              <span className="font-semibold text-foreground">{formattedTime}</span>
            </div>
            
            {(event.location || event.indirizzo) && (
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">{copy.place}</span>
                <span className="font-semibold text-foreground text-right">
                  {event.location}<br/>
                  <span className="text-sm font-normal">{event.indirizzo}</span>
                </span>
              </div>
            )}
            
            <div className="flex justify-between pt-2">
              <span className="text-muted-foreground">{copy.status}</span>
              <span className={`font-bold ${ticket.status === 'paid' ? 'text-green-600' : 'text-primary'}`}>
                {ticket.status?.toUpperCase() || 'UNKNOWN'}
              </span>
            </div>
          </div>
        </div>

        {/* Ticket Footer */}
        <div className="bg-muted p-4 text-center text-sm text-muted-foreground border-t border-border">
          {copy.footer}
          <br />ID: {ticket.id}
        </div>
      </div>
    </div>
  );
}
