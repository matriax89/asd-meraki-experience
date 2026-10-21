import { Link } from "@/i18n/routing";
import { eventCancellationCopy } from "@/lib/events/cancellation-copy";
import { EventPoster } from "./event-poster";

export function CanceledEvent({ title, reason, cover, locale }: { title: string; reason: string | null; cover: string | null; locale: string }) {
  const t = eventCancellationCopy(locale);
  return <article className="mx-auto max-w-2xl px-5 py-8 text-[#18251f] sm:px-8" data-event-canceled>
    <p className="mb-3 inline-block rounded-full bg-[#eee7d9] px-4 py-2 text-xs font-semibold text-[#765d35]">{t.title}</p>
    <h1 className="text-3xl font-semibold leading-tight tracking-tight">{title}</h1>
    <p className="mt-5 text-sm leading-7 text-[#626d63]">{t.body}</p>
    {reason ? <section className="mt-5 rounded-2xl border border-[#e3e5dd] bg-white p-5"><h2 className="text-sm font-semibold">{t.reason}</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#626d63]">{reason}</p></section> : null}
    {cover ? <div className="mx-auto mt-7 max-w-72 opacity-75"><EventPoster src={cover} title={title} locale={locale} /></div> : null}
    <div className="mt-7 flex flex-wrap gap-3"><Link href="/contatti" className="inline-flex min-h-12 items-center rounded-xl bg-[#18251f] px-5 text-sm font-semibold text-white">{t.contact}</Link><Link href="/eventi" className="inline-flex min-h-12 items-center rounded-xl border border-[#dedfd5] px-5 text-sm font-semibold">{t.back}</Link></div>
  </article>;
}
