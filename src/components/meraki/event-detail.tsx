import { CalendarDays, Check, Clock3, Info, MapPin, ShieldCheck, Ticket } from "lucide-react";
import { Link } from "@/i18n/routing";
import { EventDescription } from "@/components/public/event-description";
import { getEventAvailability } from "@/lib/tickets/event-availability";
import { CheckoutButton } from "@/app/[locale]/(public)/eventi/[slug]/checkout-button";
import { CommercePurchase } from "./commerce-purchase";
import { EventPoster } from "./event-poster";
import { EventLogisticsSection, eventLogisticsLabels } from "./event-logistics-section";
import { hasEventLogistics, type EventLogistics } from "@/lib/events/logistics";
import { availablePlaces, eventDate, eventPrice, eventLabels, type MerakiEvent } from "./event-model";

export type MerakiEventDetail = MerakiEvent & { description: string; ctaType: string | null; ctaUrl: string | null; logistics?: EventLogistics | null };

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
  const state = salesClosed ? (isEnded ? text.ended : text.salesClosed) : soldOut ? text.soldOut : null;

  return (
    <article className="mx-auto w-full max-w-[1120px] px-5 pb-36 pt-3 text-[#18251f] sm:px-8 md:pb-8 md:pt-6">
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-10">
        <div className="mx-auto w-full max-w-[420px]"><EventPoster src={event.cover} title={event.title} locale={locale} eager /></div>
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8a7450]"><span>{category}</span>{isEnded && <span className="rounded-full border border-[#d8ddcd] px-3 py-1.5 text-[#788170]">{text.remember}</span>}</div>
          <header>
            <h1 className="text-[30px] font-semibold leading-[1.13] tracking-[-0.045em] sm:text-[38px]">{event.title}</h1>
            {event.subtitle ? <p className="mt-3 text-[15px] leading-7 text-[#7a8272]">{event.subtitle}</p> : null}
          </header>

          <div className="my-7 divide-y divide-[#e9e9e0] overflow-hidden rounded-[22px] border border-[#18251f]/5 bg-white px-5">
            <div className="flex items-center gap-4 py-5"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[#f0ede4]"><CalendarDays className="h-5 w-5 text-[#9e885d]" aria-hidden="true" /></span><div><p className="mb-1 text-xs text-[#7f8777]">{text.eventStart}</p><p className="text-sm font-semibold capitalize">{date}</p><p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#7f8777]"><Clock3 className="h-3 w-3" aria-hidden="true" />{time} <span className="px-0.5 text-[#b7bdaf]">·</span> {eventDate(event.startsAt, locale, { year: "numeric" })} <span className="px-0.5 text-[#b7bdaf]">·</span> {text.italianTime}</p></div></div>
            {checkInOpening ? <div data-check-in-opening className="flex items-center gap-4 py-5"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[#f0ede4]"><Clock3 className="h-5 w-5 text-[#9e885d]" aria-hidden="true" /></span><div className="min-w-0"><p className="text-xs text-[#7f8777]">{text.checkInOpening}</p><time dateTime={checkInOpening} className="mt-1 block text-sm font-semibold">{eventDate(checkInOpening, locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time><p className="mt-1 text-xs text-[#7f8777]">{text.italianTime}</p></div></div> : null}
            {event.location || event.address ? <div className="flex items-center gap-4 py-5"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[#eaf0e5]"><MapPin className="h-5 w-5 text-[#738463]" aria-hidden="true" /></span><div className="min-w-0"><p className="text-sm font-semibold leading-6">{event.location || event.address}</p>{event.location && event.address ? <p className="mt-0.5 text-xs leading-5 text-[#7f8777]">{event.address}</p> : null}</div></div> : null}
          </div>

          {showLogistics && <a href="#viaggio-soggiorno" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#758367] underline underline-offset-4"><MapPin className="h-4 w-4" aria-hidden="true" />{travel.jump}</a>}
        <aside className="fixed inset-x-0 bottom-[var(--meraki-nav-height,86px)] z-30 rounded-t-[24px] border-t border-[#e7e7dd] bg-[#fdfdfb]/95 px-5 py-4 shadow-[0_-8px_30px_#18251f08] backdrop-blur-xl md:static md:inset-auto md:mt-6 md:z-auto md:rounded-[24px] md:border md:bg-white md:p-6 md:shadow-none">
          <CommercePurchase eventId={event.id} locale={locale} ended={isEnded} fallback={<>
          <p className="mb-5 hidden text-[10px] font-semibold uppercase tracking-[0.15em] text-[#9b855c] md:block">{text.makeMoment}</p>
          <div className="flex items-center gap-5 md:block">
            <div className="shrink-0 md:mb-6"><p className="mb-1 text-[10px] text-[#8a917f]">{text.perPerson}</p><p className="text-[23px] font-semibold leading-7 tracking-[-0.04em] md:text-[30px]">{eventPrice(event.price, locale)}</p></div>
            <div className="min-w-0 flex-1">
              {state ? <div className={`flex min-h-12 items-center justify-center gap-2 rounded-[16px] px-4 py-3 text-center text-xs font-semibold ${soldOut && !salesClosed ? "bg-[#f4e8df] text-[#9a6143]" : "bg-[#edf0e7] text-[#738065]"}`}>{isEnded ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Info className="h-4 w-4 shrink-0" aria-hidden="true" />}{state}</div>
                : external ? <a href={event.ctaUrl!} rel="noopener noreferrer" target="_blank" className="flex min-h-[52px] items-center justify-center rounded-[16px] bg-[#263a2c] px-4 py-3 text-center text-xs font-semibold text-white">{text.book}<span className="ml-2" aria-hidden="true">↗</span></a>
                : infoOnly ? <Link href="/profilo/assistenza" className="flex min-h-[52px] items-center justify-center rounded-[16px] bg-[#263a2c] px-4 py-3 text-center text-xs font-semibold text-white">{text.contact}</Link>
                : <CheckoutButton eventId={event.id} />}
            </div>
          </div>
          {!salesClosed && remaining !== null && !soldOut ? <p className="mt-3 text-center text-[10px] leading-5 text-[#7f8972]">{`${remaining} ${remaining === 1 ? text.place : text.places}`}</p> : null}
          {!salesClosed && !infoOnly && !external && !soldOut ? <p className="mt-5 hidden items-center gap-2 text-[10px] leading-5 text-[#89917e] md:flex"><ShieldCheck className="h-4 w-4 shrink-0 text-[#a08b61]" aria-hidden="true" />{text.secure}</p> : null}
          {salesClosed ? <p className="mt-4 hidden text-xs leading-6 text-[#858d7b] md:block">{isEnded ? text.endedBody : text.closedBody}</p> : null}
          </>} />
        </aside>
        </div>
      </div>
      <div className="mt-9 min-w-0 lg:mt-12">
          {event.description ? <section aria-labelledby="about-experience"><h2 id="about-experience" className="mb-4 text-xl font-semibold tracking-[-0.035em]">{text.experience}</h2><div className="text-[14px] [&>div]:text-[#727b6a] [&_h2]:text-[#18251f] [&_h3]:text-[#18251f] [&_h4]:text-[#18251f]"><EventDescription description={event.description} /></div></section> : null}

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
