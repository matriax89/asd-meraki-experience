import type { CommercePackage, CommercePriceTier } from "@/lib/commerce/types";
import { formatEventDate } from "@/lib/events/date-format";

export type EventPackagePrice = Pick<CommercePackage, "id" | "name" | "nameTranslations"> & {
  activityIds?: readonly string[];
  prices: Pick<CommercePriceTier, "id" | "label" | "labelTranslations" | "amountCents" | "startsAt" | "endsAt">[];
  salesCloseAt: string | null;
};

export type MerakiEvent = {
  id: string;
  slug: string;
  type: "evento" | "workshop" | "masterclass";
  title: string;
  subtitle: string;
  /** Server-sanitized introductory HTML. */
  shortDescription?: string;
  startsAt: string;
  endsAt: string | null;
  checkInStartsAt?: string | null;
  cover: string | null;
  location: string | null;
  address: string | null;
  price: number | null;
  priceFrom?: boolean;
  packagePrices?: EventPackagePrice[];
  capacity: number | null;
  sold: number;
};

export function eventHref(event: Pick<MerakiEvent, "type" | "slug">) {
  return `/${event.type === "evento" ? "eventi" : "workshop"}/${event.slug}`;
}

export function eventDate(value: string, locale: string, options: Intl.DateTimeFormatOptions = {}) {
  return formatEventDate(value, locale, options);
}

export function eventPrice(value: number | null, locale: string) {
  if (!value) return locale === "de" ? "Kostenlos" : locale === "en" ? "Free" : "Gratis";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: value % 100 === 0 ? 0 : 2 }).format(value / 100);
}

export function availablePlaces(event: Pick<MerakiEvent, "capacity" | "sold">) {
  return event.capacity === null ? null : Math.max(0, event.capacity - event.sold);
}

export function isPastEvent(event: Pick<MerakiEvent, "startsAt" | "endsAt">, now: number) {
  return new Date(event.endsAt || event.startsAt).getTime() <= now;
}

export function filterEvents(events: MerakiEvent[], type: "all" | "evento" | "workshop", period: "upcoming" | "past", query: string, now: number) {
  const normalized = query.trim().toLocaleLowerCase();
  return events.filter((event) => {
    const sameType = type === "all" || (type === "workshop" ? event.type !== "evento" : event.type === "evento");
    const samePeriod = isPastEvent(event, now) === (period === "past");
    const matches = !normalized || `${event.title} ${event.subtitle} ${event.location || ""} ${event.address || ""}`.toLocaleLowerCase().includes(normalized);
    return sameType && samePeriod && matches;
  }).sort((a, b) => period === "past" ? Date.parse(b.startsAt) - Date.parse(a.startsAt) : Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

const labels = {
  it: { event: "Evento", eventDay: "Giorno dell’evento", eventStart: "Inizio evento", checkInOpening: "Apertura check-in", italianTime: "ora italiana", packages: "Formule", from: "da", remember: "Da ricordare", next: "Il prossimo evento", past: "Concluso", soldOut: "Posti esauriti", ended: "Evento concluso", salesClosed: "Vendite online chiuse", experience: "L’esperienza", digitalTicket: "Il tuo biglietto digitale", qrTitle: "Il tuo momento, in un QR.", qrBody: "Acquisti senza creare un account. Ogni partecipante riceve il biglietto personale via email. Tieni pronto il QR: ogni attività acquistata ha il proprio accesso.", discover: "Scopri tutte le esperienze", makeMoment: "Fallo diventare il tuo momento", perPerson: "A persona", book: "Scopri e prenota", purchase: "Acquista quota partecipazione", contact: "Contatta Meraki", place: "posto disponibile", places: "posti disponibili", secure: "Pagamento sicuro con Stripe", endedBody: "Questa esperienza fa parte della nostra storia. Scopri i prossimi momenti Meraki.", closedBody: "Le prenotazioni online si chiudono all’inizio dell’evento." },
  en: { event: "Event", eventDay: "Event date", eventStart: "Event starts", checkInOpening: "Check-in opens", italianTime: "Italian time", packages: "Packages", from: "from", remember: "A moment to remember", next: "The next event", past: "Past event", soldOut: "Sold out", ended: "Event ended", salesClosed: "Online sales closed", experience: "The experience", digitalTicket: "Your digital ticket", qrTitle: "Your moment, just a QR away.", qrBody: "Buy without an account. Each participant receives their personal ticket by email. Have your QR ready: each purchased activity has its own admission.", discover: "Discover all experiences", makeMoment: "Make it your moment", perPerson: "Per person", book: "Discover and book", purchase: "Buy ticket", contact: "Contact Meraki", place: "place available", places: "places available", secure: "Secure payment with Stripe", endedBody: "This experience is part of our story. Discover the next Meraki moments.", closedBody: "Online booking ends when the event starts." },
  de: { event: "Event", eventDay: "Veranstaltungsdatum", eventStart: "Veranstaltungsbeginn", checkInOpening: "Check-in öffnet", italianTime: "italienische Zeit", packages: "Pakete", from: "ab", remember: "In Erinnerung", next: "Das nächste Event", past: "Beendet", soldOut: "Ausgebucht", ended: "Event beendet", salesClosed: "Online-Verkauf geschlossen", experience: "Das Erlebnis", digitalTicket: "Dein digitales Ticket", qrTitle: "Dein Moment, nur einen QR-Code entfernt.", qrBody: "Kauf ohne Konto. Alle Teilnehmenden erhalten ihr persönliches Ticket per E-Mail. Halte deinen QR-Code bereit: Jede gekaufte Aktivität hat ihren eigenen Eintritt.", discover: "Alle Erlebnisse entdecken", makeMoment: "Dein nächster Moment", perPerson: "Pro Person", book: "Entdecken und buchen", purchase: "Ticket kaufen", contact: "Meraki kontaktieren", place: "Platz verfügbar", places: "Plätze verfügbar", secure: "Sicher bezahlen mit Stripe", endedBody: "Dieses Erlebnis ist Teil unserer Geschichte. Entdecke die nächsten Meraki-Momente.", closedBody: "Die Online-Buchung endet mit Veranstaltungsbeginn." },
  es: { event: "Evento", eventDay: "Fecha del evento", eventStart: "Inicio del evento", checkInOpening: "Apertura del check-in", italianTime: "hora de Italia", packages: "Modalidades", from: "desde", remember: "Para recordar", next: "El próximo evento", past: "Finalizado", soldOut: "Agotado", ended: "Evento finalizado", salesClosed: "Venta online cerrada", experience: "La experiencia", digitalTicket: "Tu entrada digital", qrTitle: "Tu momento, en un QR.", qrBody: "Compra sin crear una cuenta. Cada participante recibe su entrada personal por email. Ten listo el QR: cada actividad comprada tiene su propio acceso.", discover: "Descubre todas las experiencias", makeMoment: "Hazlo tu momento", perPerson: "Por persona", book: "Descubre y reserva", purchase: "Comprar entrada", contact: "Contacta con Meraki", place: "plaza disponible", places: "plazas disponibles", secure: "Pago seguro con Stripe", endedBody: "Esta experiencia forma parte de nuestra historia. Descubre los próximos momentos Meraki.", closedBody: "Las reservas online se cierran al comenzar el evento." },
};
export function eventLabels(locale: string) { return labels[locale as keyof typeof labels] || labels.it; }
