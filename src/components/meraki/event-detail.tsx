import { ArrowUpRight, CalendarDays, Check, Clock3, Info, MapPin, ShieldCheck, Ticket } from "lucide-react";
import { Link } from "@/i18n/routing";
import { EventDescription } from "@/components/public/event-description";
import { getEventAvailability } from "@/lib/tickets/event-availability";
import { CheckoutButton } from "@/app/[locale]/(public)/eventi/[slug]/checkout-button";
import { CommercePurchase } from "./commerce-purchase";
import { EventPoster } from "./event-poster";
import { EventVideo } from "./event-video";
import { EventLogisticsSection, eventLogisticsLabels } from "./event-logistics-section";
import { hasEventLogistics, type EventLogistics } from "@/lib/events/logistics";
import { availablePlaces, eventDate, eventPrice, eventLabels, type MerakiEvent } from "./event-model";
import { EventActivitySchedule, hasActivitySchedule } from "./event-activity-schedule";
import type { CommerceActivity } from "@/lib/commerce/types";

export type MerakiEventDetail = MerakiEvent & { description: string; ctaType: string | null; ctaUrl: string | null; youtubeUrl?: string | null; videoUrl?: string | null; videoTitle?: string; logistics?: EventLogistics | null; affiliates?: { id: string; name: string }[]; activities?: CommerceActivity[] };

const directionsLabels = { it: "Apri il navigatore", en: "Open directions", de: "Route öffnen", es: "Abrir indicaciones" };

export function EventDetail({ event, locale }: { event: MerakiEventDetail; locale: string }) {
  const text = eventLabels(locale);
  const travel = eventLogisticsLabels(locale);
  const showLogistics = hasEventLogistics(event.logistics, locale);
  const { isEnded, salesClosed } = getEventAvailability(event.startsAt, event.endsAt);
  const remaining = availablePlaces(event);
  const soldOut = remaining === 0;
  const external = event.ctaType === "external_url" && event.ctaUrl && /^https?:\/\//i.test(event.ctaUrl);
  const infoOnly = event.ctaType === "info_only" || !event.price;
  const category = event.type === "evento" ? text.event : event.type === "masterclass" ? "Masterclass" : "Workshop";
  const date = eventDate(event.startsAt, locale, { weekday: "long", day: "numeric", month: "long" });
  const time = eventDate(event.startsAt, locale, { hour: "2-digit", minute: "2-digit" });
  const checkInOpening = event.checkInStartsAt && Number.isFinite(Date.parse(event.checkInStartsAt)) ? event.checkInStartsAt : null;
  const scheduledActivities = hasActivitySchedule(event.activities || []);
  const individualCheckIn = event.activities?.some(activity => activity.checkInStartsAt && Number.isFinite(Date.parse(activity.checkInStartsAt)));
  const destination = [event.location, event.address].map(value => value?.trim()).filter(Boolean).join(", ");
  const directionsLabel = directionsLabels[locale as keyof typeof directionsLabels] || directionsLabels.it;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&dir_action=navigate`;
  const state = salesClosed ? (isEnded ? text.ended : text.salesClosed) : soldOut ? text.soldOut : null;

  return (
    <article className="mx-auto w-full max-w-[1120px] px-5 pb-8 pt-3 text-[#18251f] sm:px-8 md:pt-6">
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-10">
        <div className="mx-auto w-full min-w-0 max-w-[420px]"><EventPoster src={event.cover} title={event.title} locale={locale} eager /><EventVideo videoUrl={event.videoUrl} url={event.youtubeUrl} title={event.videoTitle} locale={locale} /></div>
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a7450]"><span>{category}</span>{isEnded && <span className="rounded-full border border-[#d8ddcd] px-3 py-1.5 text-[#788170]">{text.remember}</span>}</div>
          <header>
            <h1 className="text-[30px] font-semibold leading-[1.13] tracking-[-0.045em] sm:text-[38px]">{event.title}</h1>
            {event.subtitle ? <p className="mt-3 text-[15px] leading-7 text-[#7a8272]">{event.subtitle}</p> : null}
          </header>

          <div className="my-6 divide-y divide-[#e9e9e0] overflow-hidden rounded-[18px] border border-[#18251f]/5 bg-white px-4 sm:px-5">
            <div className="flex items-start gap-3 py-4"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#9e885d]" aria-hidden="true" /><div><p className="mb-1 text-xs text-[#7f8777]">{scheduledActivities ? text.eventDay : text.eventStart}</p><p className="text-sm font-semibold">{scheduledActivities ? eventDate(event.startsAt, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : date}</p>{!scheduledActivities ? <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#7f8777]"><Clock3 className="h-3 w-3" aria-hidden="true" />{time} <span className="px-0.5 text-[#b7bdaf]">·</span> {eventDate(event.startsAt, locale, { year: "numeric" })} <span className="px-0.5 text-[#b7bdaf]">·</span> {text.italianTime}</p> : null}</div></div>
            {scheduledActivities ? <EventActivitySchedule activities={event.activities || []} locale={locale} eventStartsAt={event.startsAt} /> : null}
            {checkInOpening && !individualCheckIn ? <div data-check-in-opening className="flex items-center gap-4 py-5"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[#f0ede4]"><Clock3 className="h-5 w-5 text-[#9e885d]" aria-hidden="true" /></span><div className="min-w-0"><p className="text-xs text-[#7f8777]">{text.checkInOpening}</p><time dateTime={checkInOpening} className="mt-1 block text-sm font-semibold">{eventDate(checkInOpening, locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time><p className="mt-1 text-xs text-[#7f8777]">{text.italianTime}</p></div></div> : null}
            {destination ? <a data-event-directions href={directionsUrl} target="_blank" rel="noopener noreferrer" aria-label={`${directionsLabel}: ${destination}`} className="group flex min-h-14 items-center gap-3 py-4 outline-offset-4 focus-visible:outline-2 focus-visible:outline-[#738463]">
              <MapPin className="h-4 w-4 shrink-0 text-[#738463]" aria-hidden="true" />
              <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold leading-5">{event.location || event.address}</p><p className="mt-0.5 break-words text-xs leading-5 text-[#67765d] underline decoration-[#b7beac] underline-offset-3 group-hover:decoration-current">{event.location && event.address ? event.address : directionsLabel}</p></div>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-[#738463]" aria-hidden="true" />
            </a> : null}
          </div>

          {showLogistics && <a href="#viaggio-soggiorno" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#758367] underline underline-offset-4"><MapPin className="h-4 w-4" aria-hidden="true" />{travel.jump}</a>}
        </div>
      </div>
      <div className="mt-9 min-w-0 lg:mt-12">
          {event.description ? <section aria-labelledby="about-experience"><h2 id="about-experience" className="mb-4 text-xl font-semibold tracking-[-0.035em]">{text.experience}</h2><div className="text-[14px] [&>div]:text-[#727b6a] [&_h2]:text-[#18251f] [&_h3]:text-[#18251f] [&_h4]:text-[#18251f]"><EventDescription description={event.description} /></div></section> : null}

          <section id="quote-partecipazione" data-event-ticketing aria-label={text.packages} className="mt-8 min-w-0 scroll-mt-28 rounded-[24px] border border-[#e7e7dd] bg-white p-5 sm:p-6">
            <CommercePurchase eventId={event.id} locale={locale} ended={isEnded} presentation="packages" fallback={<>
              <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9b855c]">{text.makeMoment}</p>
              <div className="grid items-center gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="min-w-0"><p className="mb-1 text-[10px] text-[#8a917f]">{text.perPerson}</p><p className="text-[30px] font-semibold leading-tight tracking-[-0.04em]">{eventPrice(event.price, locale)}</p></div>
                <div className="min-w-0">
                  {state ? <div className={`flex min-h-12 items-center justify-center gap-2 rounded-[16px] px-4 py-3 text-center text-xs font-semibold ${soldOut && !salesClosed ? "bg-[#f4e8df] text-[#9a6143]" : "bg-[#edf0e7] text-[#738065]"}`}>{isEnded ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Info className="h-4 w-4 shrink-0" aria-hidden="true" />}{state}</div>
                    : external ? <a href={event.ctaUrl!} rel="noopener noreferrer" target="_blank" className="flex min-h-[52px] items-center justify-center rounded-[16px] bg-[#263a2c] px-4 py-3 text-center text-xs font-semibold text-white">{text.book}<span className="ml-2" aria-hidden="true">↗</span></a>
                    : infoOnly ? <Link href="/profilo/assistenza" className="flex min-h-[52px] items-center justify-center rounded-[16px] bg-[#263a2c] px-4 py-3 text-center text-xs font-semibold text-white">{text.contact}</Link>
                    : <CheckoutButton eventId={event.id} affiliates={event.affiliates} />}
                </div>
              </div>
              {!salesClosed && remaining !== null && !soldOut ? <p className="mt-3 text-center text-[10px] leading-5 text-[#7f8972]">{`${remaining} ${remaining === 1 ? text.place : text.places}`}</p> : null}
              {!salesClosed && !infoOnly && !external && !soldOut ? <p className="mt-5 flex items-center gap-2 text-[10px] leading-5 text-[#89917e]"><ShieldCheck className="h-4 w-4 shrink-0 text-[#a08b61]" aria-hidden="true" />{text.secure}</p> : null}
              {salesClosed ? <p className="mt-4 text-xs leading-6 text-[#858d7b]">{isEnded ? text.endedBody : text.closedBody}</p> : null}
            </>} />
          </section>

          {!external && !infoOnly ? <section className="mt-8 flex items-start gap-3 rounded-[22px] border border-[#dedfd3] p-5" aria-label={text.digitalTicket}>
            <Ticket className="mt-0.5 h-5 w-5 shrink-0 text-[#a38a59]" aria-hidden="true" />
            <div><h2 className="text-sm font-semibold">{text.qrTitle}</h2><p className="mt-1.5 text-xs leading-6 text-[#7d8672]">{text.qrBody}</p></div>
          </section> : null}
        <EventLogisticsSection logistics={event.logistics} locale={locale} />
          <Link href="/eventi" className="mt-7 inline-flex min-h-11 items-center gap-2 text-[13px] font-semibold text-[#758367]">{text.discover}<span aria-hidden="true">↗</span></Link>
      </div>
    </article>
  );
}
