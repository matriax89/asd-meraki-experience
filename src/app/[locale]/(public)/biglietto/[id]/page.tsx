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
    it: { ticket: "Biglietto", holder: "Intestatario", date: "Data", time: "Ora", place: "Luogo", status: "Stato", footer: "Mostra questo QR code all’ingresso dell’evento.", email: "Una copia del biglietto è stata inviata anche al tuo indirizzo email.", statuses: { pending: "In attesa", paid: "Valido", used: "Utilizzato", refunded: "Rimborsato" } },
    en: { ticket: "Ticket", holder: "Holder", date: "Date", time: "Time", place: "Venue", status: "Status", footer: "Show this QR code at the event entrance.", email: "A copy of this ticket has also been sent to your email address.", statuses: { pending: "Pending", paid: "Valid", used: "Used", refunded: "Refunded" } },
    de: { ticket: "Eintrittskarte", holder: "Inhaber", date: "Datum", time: "Uhrzeit", place: "Ort", status: "Status", footer: "Zeigen Sie diesen QR-Code am Eingang.", email: "Eine Kopie dieser Eintrittskarte wurde auch an Ihre E-Mail-Adresse gesendet.", statuses: { pending: "Ausstehend", paid: "Gültig", used: "Verwendet", refunded: "Erstattet" } },
  }[locale as "it" | "en" | "de"] || { ticket: "Biglietto", holder: "Intestatario", date: "Data", time: "Ora", place: "Luogo", status: "Stato", footer: "Mostra questo QR code all’ingresso dell’evento.", email: "Una copia del biglietto è stata inviata anche al tuo indirizzo email.", statuses: { pending: "In attesa", paid: "Valido", used: "Utilizzato", refunded: "Rimborsato" } };
  const localizedStatus = copy.statuses[ticket.status as keyof typeof copy.statuses] || "Non disponibile";

  return (
    <main className="container flex justify-center pb-20 pt-24 sm:pt-28 md:pb-28 md:pt-36">
      <div className="max-w-md w-full bg-card rounded-2xl shadow-xl overflow-hidden border border-border">
        {/* Ticket Header */}
        <div className="bg-primary p-6 text-primary-foreground text-center">
          {event.logo_url && <img src={event.logo_url} alt="" className="mx-auto mb-4 max-h-16 max-w-44 object-contain" />}
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
                {localizedStatus}
              </span>
            </div>
          </div>

          <div className="mt-7 w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm leading-5 text-emerald-800">
            {copy.email}
          </div>
        </div>

        {/* Ticket Footer */}
        <div className="bg-muted p-4 text-center text-sm text-muted-foreground border-t border-border">
          {copy.footer}
          <br />ID: {ticket.id}
        </div>
      </div>
    </main>
  );
}
