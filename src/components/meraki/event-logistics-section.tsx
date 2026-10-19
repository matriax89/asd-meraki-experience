import { Accessibility, BedDouble, Bus, Car, ExternalLink, Mail, MapPin, Phone, Plane, TrainFront } from "lucide-react";
import { hasEventLogistics, logisticsText, parseEventLogistics, type EventLogistics } from "@/lib/events/logistics";

const copy = {
  it: { title: "Viaggio e soggiorno", jump: "Organizza il viaggio", intro: "Le informazioni utili per arrivare e fermarti qualche giorno.", hotels: "Dove dormire", partner: "Struttura convenzionata", suggested: "Struttura consigliata", map: "Apri la mappa", book: "Sito e prenotazioni", distance: "Distanza dall’evento", rate: "Tariffe", benefits: "Vantaggi della convenzione", services: "Servizi e vantaggi", infoValid: "Informazioni valide fino al", instructions: "Come prenotare", valid: "Convenzione valida fino al", expired: "Convenzione scaduta il", checkInfo: "Da verificare", arrivals: "Come arrivare", plane: "In aereo", train: "In treno", bus: "In autobus", car: "In auto", route: "Apri il collegamento", accessibility: "Accessibilità", contact: "Informazioni e assistenza" },
  en: { title: "Travel and accommodation", jump: "Plan your trip", intro: "Useful information for getting here and staying a little longer.", hotels: "Where to stay", partner: "Partner accommodation", suggested: "Suggested accommodation", map: "Open the map", book: "Website and booking", distance: "Distance from the event", rate: "Rates", benefits: "Partner benefits", services: "Services and benefits", infoValid: "Information valid until", instructions: "How to book", valid: "Partner offer valid until", expired: "Partner offer expired on", checkInfo: "Please verify", arrivals: "Getting here", plane: "By plane", train: "By train", bus: "By bus", car: "By car", route: "Open the link", accessibility: "Accessibility", contact: "Information and assistance" },
  de: { title: "Anreise und Unterkunft", jump: "Plane deine Reise", intro: "Nützliche Informationen für die Anreise und deinen Aufenthalt.", hotels: "Übernachten", partner: "Partnerunterkunft", suggested: "Empfohlene Unterkunft", map: "Karte öffnen", book: "Website und Buchung", distance: "Entfernung zum Event", rate: "Preise", benefits: "Partnervorteile", services: "Leistungen und Vorteile", infoValid: "Informationen gültig bis", instructions: "So buchst du", valid: "Partnerangebot gültig bis", expired: "Partnerangebot abgelaufen am", checkInfo: "Bitte überprüfen", arrivals: "Anreise", plane: "Mit dem Flugzeug", train: "Mit dem Zug", bus: "Mit dem Bus", car: "Mit dem Auto", route: "Link öffnen", accessibility: "Barrierefreiheit", contact: "Informationen und Hilfe" },
  es: { title: "Viaje y alojamiento", jump: "Organiza tu viaje", intro: "Información útil para llegar y disfrutar de tu estancia.", hotels: "Dónde alojarse", partner: "Alojamiento colaborador", suggested: "Alojamiento recomendado", map: "Abrir el mapa", book: "Web y reservas", distance: "Distancia al evento", rate: "Tarifas", benefits: "Ventajas del acuerdo", services: "Servicios y ventajas", infoValid: "Información válida hasta el", instructions: "Cómo reservar", valid: "Acuerdo válido hasta el", expired: "Acuerdo vencido el", checkInfo: "Por confirmar", arrivals: "Cómo llegar", plane: "En avión", train: "En tren", bus: "En autobús", car: "En coche", route: "Abrir el enlace", accessibility: "Accesibilidad", contact: "Información y asistencia" },
};
export const eventLogisticsLabels = (locale: string) => copy[locale as keyof typeof copy] || copy.it;
const external = "inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#dce0d2] bg-white px-3 py-2 text-xs font-semibold text-[#4f6344] underline-offset-4 hover:underline";
const webLink = (value: string) => /^https?:\/\//i.test(value);

export function EventLogisticsSection({ logistics, locale }: { logistics: EventLogistics | null | undefined; locale: string }) {
  const data = parseEventLogistics(logistics);
  if (!data || !hasEventLogistics(data, locale)) return null;
  const text = eventLogisticsLabels(locale);
  const accessibility = logisticsText(data.accessibility, locale);
  const contact = logisticsText(data.contact, locale);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const icons = { plane: Plane, train: TrainFront, bus: Bus, car: Car };
  return <section id="viaggio-soggiorno" aria-labelledby="event-logistics-title" className="mt-12 scroll-mt-28 space-y-7 border-t border-[#dfe2d5] pt-9">
    <header><h2 id="event-logistics-title" className="text-2xl font-semibold tracking-[-0.035em]">{text.title}</h2><p className="mt-2 text-sm leading-6 text-[#727b6a]">{text.intro}</p></header>
    {data.accommodations.length > 0 && <section aria-labelledby="event-accommodations-title" className="space-y-4">
      <h3 id="event-accommodations-title" className="flex items-center gap-2 text-lg font-semibold"><BedDouble className="h-5 w-5 text-[#9e885d]" aria-hidden="true" />{text.hotels}</h3>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">{data.accommodations.map((hotel) => {
        const distance = logisticsText(hotel.distance, locale);
        const rate = logisticsText(hotel.rate, locale);
        const benefits = logisticsText(hotel.benefits, locale);
        const instructions = logisticsText(hotel.bookingInstructions, locale);
        const expired = Boolean(hotel.validUntil && hotel.validUntil < today);
        const telephone = hotel.phone.replace(/[^\d+]/g, "");
        return <article key={hotel.id} data-accommodation-kind={hotel.kind} className="min-w-0 space-y-4 rounded-[22px] border border-[#e1e4d9] bg-white p-5">
          <header><p className={`mb-2 inline-flex rounded-full px-3 py-1.5 text-[10px] font-semibold ${hotel.kind === "partner" ? "bg-[#eaf0e5] text-[#526b43]" : "bg-[#f2eee5] text-[#8a7450]"}`}>{hotel.kind === "partner" ? text.partner : text.suggested}</p><h4 className="break-words text-lg font-semibold">{hotel.name}</h4>{hotel.address && <p className="mt-2 flex items-start gap-2 whitespace-pre-line text-sm leading-6 text-[#727b6a]"><MapPin className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />{hotel.address}</p>}</header>
          {(distance || rate) && <dl className="space-y-3 text-sm">{distance && <div><dt className="text-xs text-[#818a76]">{text.distance}</dt><dd className="mt-1 whitespace-pre-line leading-6">{distance}</dd></div>}{rate && <div><dt className="text-xs text-[#818a76]">{text.rate}</dt><dd className="mt-1 whitespace-pre-line leading-6">{rate}</dd></div>}</dl>}
          {benefits && <div><h5 className="text-xs font-semibold text-[#8a7450]">{hotel.kind === "partner" ? text.benefits : text.services}</h5><p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#65715d]">{benefits}</p></div>}
          {instructions && <div><h5 className="text-xs font-semibold text-[#8a7450]">{text.instructions}</h5><p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#65715d]">{instructions}</p></div>}
          {hotel.validUntil && <p data-expired-offer={expired || undefined} className={`text-xs leading-5 ${expired ? "text-[#9a6143]" : "text-[#7f8874]"}`}>{hotel.kind === "partner" ? expired ? text.expired : text.valid : text.infoValid} <time dateTime={hotel.validUntil}>{new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", dateStyle: "long" }).format(new Date(`${hotel.validUntil}T12:00:00Z`))}</time>{expired && hotel.kind === "suggested" ? ` · ${text.checkInfo}` : ""}</p>}
          <div className="flex flex-wrap gap-2">{webLink(hotel.mapUrl) && <a href={hotel.mapUrl} target="_blank" rel="noopener noreferrer" className={external}>{text.map}<ExternalLink className="h-3 w-3" aria-hidden="true" /></a>}{webLink(hotel.bookingUrl) && <a href={hotel.bookingUrl} target="_blank" rel="noopener noreferrer" className={external}>{text.book}<ExternalLink className="h-3 w-3" aria-hidden="true" /></a>}{hotel.phone && /\d/.test(telephone) && <a href={`tel:${telephone}`} className={`${external} break-all`}><Phone className="h-3 w-3 shrink-0" aria-hidden="true" />{hotel.phone}</a>}{hotel.email && <a href={`mailto:${hotel.email}`} className={`${external} min-w-0 break-all`}><Mail className="h-3 w-3 shrink-0" aria-hidden="true" />{hotel.email}</a>}</div>
        </article>;
      })}</div>
    </section>}
    {data.arrivals.length > 0 && <section aria-labelledby="event-arrivals-title" className="space-y-4"><h3 id="event-arrivals-title" className="text-lg font-semibold">{text.arrivals}</h3><div className="grid gap-4 sm:grid-cols-2">{data.arrivals.map((arrival) => {
      const Icon = icons[arrival.mode];
      const description = logisticsText(arrival.description, locale);
      return <article key={arrival.id} className="min-w-0 space-y-3 rounded-[22px] border border-[#e1e4d9] bg-white p-5"><p className="flex items-center gap-2 text-xs font-semibold text-[#8a7450]"><Icon className="h-4 w-4" aria-hidden="true" />{text[arrival.mode]}</p><h4 className="text-base font-semibold">{logisticsText(arrival.title, locale)}</h4>{description && <p className="whitespace-pre-line text-sm leading-6 text-[#65715d]">{description}</p>}{webLink(arrival.linkUrl) && <a href={arrival.linkUrl} target="_blank" rel="noopener noreferrer" className={external}>{text.route}<ExternalLink className="h-3 w-3" aria-hidden="true" /></a>}</article>;
    })}</div></section>}
    {accessibility && <section className="rounded-[22px] border border-[#e1e4d9] p-5"><h3 className="flex items-center gap-2 text-base font-semibold"><Accessibility className="h-5 w-5 text-[#9e885d]" aria-hidden="true" />{text.accessibility}</h3><p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#65715d]">{accessibility}</p></section>}
    {contact && <section className="rounded-[22px] bg-[#eaf0e5] p-5"><h3 className="text-base font-semibold">{text.contact}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#65715d]">{contact}</p></section>}
  </section>;
}
