const copies = {
  it: { title: "Evento annullato", body: "L’evento è stato annullato. Le vendite sono chiuse e i biglietti non consentono più l’ingresso.", ticketBody: "L’evento è stato annullato: questo biglietto non può essere utilizzato per il check-in. Le comunicazioni sul rimborso vengono inviate via email all’acquirente.", reason: "Motivo dell’annullamento", contact: "Contatta Meraki", back: "Torna agli eventi" },
  en: { title: "Event canceled", body: "The event has been canceled. Sales are closed and tickets can no longer be used for entry.", ticketBody: "The event has been canceled: this ticket cannot be used for check-in. Refund updates are emailed to the purchaser.", reason: "Reason for cancellation", contact: "Contact Meraki", back: "Back to events" },
  de: { title: "Veranstaltung abgesagt", body: "Die Veranstaltung wurde abgesagt. Der Verkauf ist geschlossen und die Tickets können nicht mehr für den Einlass verwendet werden.", ticketBody: "Die Veranstaltung wurde abgesagt: Dieses Ticket kann nicht für den Check-in verwendet werden. Informationen zur Erstattung erhält der Käufer per E-Mail.", reason: "Grund der Absage", contact: "Meraki kontaktieren", back: "Zurück zu den Veranstaltungen" },
  es: { title: "Evento cancelado", body: "El evento ha sido cancelado. La venta está cerrada y las entradas ya no permiten el acceso.", ticketBody: "El evento ha sido cancelado: esta entrada no puede utilizarse para el check-in. La información sobre el reembolso se envía por email a quien realizó la compra.", reason: "Motivo de la cancelación", contact: "Contactar con Meraki", back: "Volver a los eventos" },
};

export function eventCancellationCopy(locale: string) {
  return copies[locale as keyof typeof copies] || copies.it;
}
