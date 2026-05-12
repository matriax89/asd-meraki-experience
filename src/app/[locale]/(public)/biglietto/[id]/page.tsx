import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import QRCode from "qrcode";
import { format } from "date-fns";
import { it } from "date-fns/locale";

export default async function BigliettoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch the ticket and join with the event
  const { data: ticket, error } = await supabase
    .from("tickets")
    .select(`
      *,
      event:events(*)
    `)
    .eq("id", id)
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
  const formattedDate = format(date, "d MMMM yyyy", { locale: it });
  const formattedTime = format(date, "HH:mm");

  return (
    <div className="container py-12 flex justify-center">
      <div className="max-w-md w-full bg-card rounded-2xl shadow-xl overflow-hidden border border-border">
        {/* Ticket Header */}
        <div className="bg-primary p-6 text-primary-foreground text-center">
          <div className="text-sm font-bold uppercase tracking-wider mb-2 opacity-80">
            Biglietto {event.tipo}
          </div>
          <h1 className="text-2xl font-heading font-bold">{event.titolo}</h1>
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
              <span className="text-muted-foreground">Intestatario</span>
              <span className="font-semibold text-foreground">{ticket.buyer_email}</span>
            </div>
            
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Data</span>
              <span className="font-semibold text-foreground">{formattedDate}</span>
            </div>
            
            <div className="flex justify-between border-b border-border pb-2">
              <span className="text-muted-foreground">Ora</span>
              <span className="font-semibold text-foreground">{formattedTime}</span>
            </div>
            
            {(event.location || event.indirizzo) && (
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Luogo</span>
                <span className="font-semibold text-foreground text-right">
                  {event.location}<br/>
                  <span className="text-sm font-normal">{event.indirizzo}</span>
                </span>
              </div>
            )}
            
            <div className="flex justify-between pt-2">
              <span className="text-muted-foreground">Status</span>
              <span className={`font-bold ${ticket.status === 'paid' ? 'text-green-600' : 'text-primary'}`}>
                {ticket.status?.toUpperCase() || 'UNKNOWN'}
              </span>
            </div>
          </div>
        </div>

        {/* Ticket Footer */}
        <div className="bg-muted p-4 text-center text-sm text-muted-foreground border-t border-border">
          Mostra questo QR code all'ingresso dell'evento.
          <br />ID: {ticket.id}
        </div>
      </div>
    </div>
  );
}
