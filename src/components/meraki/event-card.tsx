import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import { Link } from "@/i18n/routing";
import { EventPoster } from "./event-poster";
import { availablePlaces, eventDate, eventHref, eventLabels, type MerakiEvent } from "./event-model";

export function MerakiEventCard({ event, locale, featured = false, past = false }: { event: MerakiEvent; locale: string; now: number; featured?: boolean; past?: boolean }) {
  const text = eventLabels(locale);
  const places = availablePlaces(event);
  const purchase = !past && (Boolean(event.packagePrices?.length) || (event.price ?? 0) > 0);
  const destination = `${eventHref(event)}#top`;

  if (featured) return <article className="grid min-w-0 gap-5 rounded-[28px] border border-[#18251f]/5 bg-white p-4 text-[#18251f] shadow-[0_14px_40px_-20px_#18251f30] sm:grid-cols-[minmax(0,42%)_minmax(0,1fr)] sm:items-center sm:p-5">
    <div className="mx-auto w-full max-w-[420px]"><EventPoster src={event.cover} title={event.title} locale={locale} eager /></div>
    <div className="min-w-0 px-1 pb-2 sm:px-0 sm:pb-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8a7450]">{past ? text.remember : text.next}</p>
      <div className="mt-4 flex justify-center">
        <time dateTime={event.startsAt} data-event-date className="inline-flex min-h-11 max-w-full items-center justify-center gap-2.5 rounded-2xl border border-[#d8c89f] bg-[#f3eddf] px-4 py-3 text-center text-sm font-bold capitalize leading-6 text-[#263a2c]">
          <CalendarDays className="h-5 w-5 shrink-0 text-[#8a7042]" aria-hidden="true" />
          {eventDate(event.startsAt, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </time>
      </div>
      <h2 className="mt-2 text-[26px] font-semibold leading-[1.13] tracking-[-0.04em] sm:text-[28px]"><Link href={eventHref(event)} className="outline-offset-4 hover:underline">{event.title}</Link></h2>
      {event.location && <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-[#727b6a]"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{event.location}</p>}
    </div>
    <div className="min-w-0 px-1 pb-2 sm:col-span-2 sm:px-0 sm:pb-0">
      {past ? <p className="mt-1 text-xs text-[#858b81]">{text.past}</p> : places === 0 ? <p className="mt-1 text-xs text-[#a04d3a]">{text.soldOut}</p> : null}
      <Link href={destination} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 py-3 text-center text-sm font-semibold ${purchase ? "w-full bg-[#263a2c] text-white hover:bg-[#17281f]" : "border border-[#dce0d2] text-[#4f6344] hover:bg-[#f5f4f0]"}`} data-event-purchase-cta={purchase || undefined}>{past ? text.experience : purchase ? text.purchase : text.book}<ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" /></Link>
    </div>
  </article>;

  return <article className="flex min-w-0 gap-4 rounded-[22px] border border-[#18251f]/5 bg-white p-3 text-[#18251f] shadow-[0_3px_12px_#18251f03]">
    <div className="w-24 shrink-0 sm:w-28"><EventPoster src={event.cover} title={event.title} locale={locale} compact /></div>
    <div className="flex min-w-0 flex-1 flex-col justify-center py-1 pr-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8a7450]"><time dateTime={event.startsAt} data-event-date className="inline-flex rounded-lg bg-[#f3eddf] px-2 py-1 font-bold text-[#263a2c]">{eventDate(event.startsAt, locale, { day: "numeric", month: "short", year: "numeric" })}</time></p>
      <h3 className="mt-1.5 text-base font-semibold leading-5 tracking-[-0.025em] sm:text-lg"><Link href={eventHref(event)} className="line-clamp-2 outline-offset-4 hover:underline">{event.title}</Link></h3>
      {event.location ? <p className="mt-1.5 truncate text-xs text-[#727b72]">{event.location}</p> : null}
      <div className="mt-2.5 flex flex-wrap items-center justify-end gap-1 text-xs">{past ? <span className="text-[#858b81]">{text.past}</span> : places === 0 ? <span className="text-[#a04d3a]">{text.soldOut}</span> : <Link href={destination} aria-label={`${purchase ? text.purchase : text.book} · ${event.title}`} className="flex min-h-9 min-w-9 items-center justify-center rounded-full border border-[#dce0d2]"><ArrowUpRight aria-hidden="true" className="h-4 w-4 text-[#737d70]" /></Link>}</div>
    </div>
  </article>;
}
