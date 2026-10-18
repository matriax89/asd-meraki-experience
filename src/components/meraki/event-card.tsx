import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import Image from "next/image";
import { Link } from "@/i18n/routing";
import { availablePlaces, eventDate, eventHref, eventPrice, eventLabels, type MerakiEvent } from "./event-model";

export function MerakiEventCard({ event, locale, featured = false, past = false }: { event: MerakiEvent; locale: string; featured?: boolean; past?: boolean }) {
  const text = eventLabels(locale);
  const type = event.type === "evento" ? text.event : event.type === "masterclass" ? "Masterclass" : "Workshop";
  const places = availablePlaces(event);
  const price = event.priceFrom ? event.price === null ? text.packages : `${text.from} ${eventPrice(event.price, locale)}` : eventPrice(event.price, locale);

  if (featured) return (
    <Link href={eventHref(event)} className="group relative isolate flex min-h-[365px] overflow-hidden rounded-[28px] bg-[#26372c] text-white shadow-[0_14px_40px_-20px_#18251f80] outline-offset-4 sm:min-h-[420px]" aria-label={`${event.title} · ${eventDate(event.startsAt, locale, { day: "numeric", month: "long" })}`}>
      {event.cover ? <Image unoptimized src={event.cover} alt="" fill sizes="(min-width: 1024px) 600px, (min-width: 640px) 90vw, 100vw" loading="eager" fetchPriority="high" className="object-cover transition-transform duration-700 motion-safe:group-hover:scale-[1.025]" /> : <CalendarDays aria-hidden="true" className="absolute right-8 top-10 h-44 w-44 -rotate-12 text-white/10" />}
      <div className="absolute inset-0 bg-gradient-to-t from-[#102018]/95 via-[#102018]/20 to-black/10" />
      <div className="relative flex w-full flex-col justify-between p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <span className="rounded-full border border-white/35 bg-black/10 px-3 py-2 text-[10px] font-semibold tracking-[0.15em] uppercase backdrop-blur-md">{past ? text.remember : text.next}</span>
          <div className="flex min-w-14 flex-col items-center rounded-[18px] bg-white/95 px-3 py-2 text-[#18251f] shadow-sm">
            <span className="text-[23px] leading-7 font-semibold tracking-tight">{eventDate(event.startsAt, locale, { day: "2-digit" })}</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.1em]">{eventDate(event.startsAt, locale, { month: "short" }).replace(".", "")}</span>
          </div>
        </div>
        <div className="mt-20 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold tracking-[0.2em] text-[#e5cfaa] uppercase"><span className="h-1 w-1 rounded-full bg-[#e5cfaa]" />{type}</p>
            <h2 className="max-w-lg text-[28px] leading-[1.12] font-semibold tracking-[-0.045em] sm:text-[38px]">{event.title}</h2>
            <p className="mt-3 flex items-center gap-1.5 text-xs leading-5 text-white/85"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{event.location || eventDate(event.startsAt, locale, { day: "numeric", month: "long", year: "numeric" })}</p>
            {event.priceFrom ? <p className="mt-3 text-sm font-semibold text-[#e5cfaa]">{price}</p> : null}
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#18251f] transition-colors group-hover:bg-[#e5cfaa]"><ArrowUpRight className="h-5 w-5" aria-hidden="true" /></span>
        </div>
      </div>
    </Link>
  );

  return (
    <Link href={eventHref(event)} className="group flex gap-4 rounded-[22px] border border-[#18251f]/5 bg-white p-3 text-[#18251f] shadow-[0_3px_12px_#18251f03] transition-colors hover:border-[#c2a36b]/60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c2a36b]">
      <div className="relative h-28 w-24 shrink-0 overflow-hidden rounded-[16px] bg-[#e9eae3] sm:h-32 sm:w-36">
        {event.cover ? <Image unoptimized src={event.cover} alt="" fill sizes="(min-width: 640px) 144px, 96px" loading="lazy" className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-105" /> : <CalendarDays className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-[#788174]" aria-hidden="true" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center py-1 pr-1">
        <p className="text-[10px] font-semibold tracking-wider text-[#8a7450] uppercase">{eventDate(event.startsAt, locale, { day: "numeric", month: "short" })} <span className="px-1 text-[#c8c8bd]">·</span> {type}</p>
        <h3 className="mt-1.5 line-clamp-2 text-base font-semibold leading-5 tracking-[-0.025em] sm:text-lg">{event.title}</h3>
        {event.location ? <p className="mt-1.5 truncate text-xs text-[#727b72]">{event.location}</p> : null}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1 text-xs">
          <span className="font-semibold">{price}</span>
          {past ? <span className="text-[#858b81]">{text.past}</span> : places === 0 ? <span className="text-[#a04d3a]">{text.soldOut}</span> : <ArrowUpRight aria-hidden="true" className="h-4 w-4 text-[#737d70]" />}
        </div>
      </div>
    </Link>
  );
}
