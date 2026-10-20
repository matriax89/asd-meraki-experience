"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, Ticket } from "lucide-react";
import { Link } from "@/i18n/routing";
import { MerakiEventCard } from "./event-card";
import { filterEvents, isPastEvent, type MerakiEvent } from "./event-model";

const copy = {
  it: { tickets: "I miei biglietti", events: "Eventi", workshop: "Workshop", upcoming: "Prossimi", past: "Passati", agenda: "La tua prossima esperienza", memories: "I momenti Meraki", emptyTitle: "Il prossimo momento sta arrivando.", empty: "Stiamo preparando nuove esperienze. Torna qui per scoprire i prossimi eventi Meraki.", error: "Non riusciamo a caricare gli eventi. Riprova tra poco.", archiveEmpty: "La nostra storia inizia qui.", archiveText: "Gli eventi conclusi compariranno in questa sezione.", count: "esperienze" },
  en: { tickets: "My tickets", events: "Events", workshop: "Workshops", upcoming: "Upcoming", past: "Past", agenda: "Your next experience", memories: "Meraki moments", emptyTitle: "Your next moment is on its way.", empty: "We're creating new experiences. Come back to discover upcoming Meraki events.", error: "We couldn't load the events. Please try again shortly.", archiveEmpty: "Our story starts here.", archiveText: "Past events will appear in this section.", count: "experiences" },
  de: { tickets: "Meine Tickets", events: "Events", workshop: "Workshops", upcoming: "Demnächst", past: "Vergangen", agenda: "Dein nächstes Erlebnis", memories: "Meraki Momente", emptyTitle: "Dein nächster Moment kommt bald.", empty: "Wir planen neue Erlebnisse. Entdecke hier bald die nächsten Meraki Events.", error: "Die Events konnten nicht geladen werden. Bitte versuche es gleich noch einmal.", archiveEmpty: "Hier beginnt unsere Geschichte.", archiveText: "Vergangene Events erscheinen in diesem Bereich.", count: "Erlebnisse" },
  es: { tickets: "Mis entradas", events: "Eventos", workshop: "Workshops", upcoming: "Próximos", past: "Pasados", agenda: "Tu próxima experiencia", memories: "Momentos Meraki", emptyTitle: "Tu próximo momento está en camino.", empty: "Estamos preparando nuevas experiencias. Vuelve para descubrir los próximos eventos Meraki.", error: "No se han podido cargar los eventos. Vuelve a intentarlo en unos momentos.", archiveEmpty: "Nuestra historia empieza aquí.", archiveText: "Los eventos finalizados aparecerán en esta sección.", count: "experiencias" },
};

export function EventFeed({ events, locale, now, initialType = "all", loadError = false }: { events: MerakiEvent[]; locale: string; now: number; initialType?: "all" | "workshop"; loadError?: boolean }) {
  const t = copy[locale as keyof typeof copy] || copy.it;
  const [period, setPeriod] = useState<"upcoming" | "past">("upcoming");
  const [currentTime, setCurrentTime] = useState(now);
  useEffect(() => {
    // Installed apps can stay open for days. Reclassify events as time passes
    // and as soon as the user returns, keeping the server time for hydration.
    const updateTime = () => setCurrentTime(Date.now());
    const interval = window.setInterval(updateTime, 30_000);
    window.addEventListener("focus", updateTime);
    window.addEventListener("pageshow", updateTime);
    document.addEventListener("visibilitychange", updateTime);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", updateTime);
      window.removeEventListener("pageshow", updateTime);
      document.removeEventListener("visibilitychange", updateTime);
    };
  }, []);
  const effectiveNow = Math.max(now, currentTime);
  const filtered = filterEvents(events, initialType, period, "", effectiveNow);
  // An empty upcoming catalogue must never promote an archived experience.
  const featured = filtered[0];
  const featuredIsPast = featured ? isPastEvent(featured, effectiveNow) : false;
  const list = filtered.filter((event) => event.id !== featured?.id);

  return (
    <div className="mx-auto w-full max-w-[1120px] px-5 pb-8 pt-5 text-[#18251f] sm:px-8 sm:pt-8">
      <h1 className="sr-only">{initialType === "workshop" ? t.workshop : t.events}</h1>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <section aria-label={t.memories} className="min-w-0">
          {featured ? <MerakiEventCard event={featured} locale={locale} now={effectiveNow} featured past={featuredIsPast} /> : null}
          <div className={featured ? "mt-7" : ""}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-[-0.035em]">{period === "past" ? t.memories : t.agenda}</h2>
              <div className="flex rounded-full bg-[#e9eae3] p-1" role="group" aria-label={locale === "it" ? "Periodo" : locale === "de" ? "Zeitraum" : locale === "es" ? "Período" : "Period"}>
                {([{ value: "upcoming", label: t.upcoming }, { value: "past", label: t.past }] as const).map((option) => <button type="button" key={option.value} aria-pressed={period === option.value} onClick={() => setPeriod(option.value)} className={`min-h-9 rounded-full px-3.5 text-[11px] font-semibold transition-colors ${period === option.value ? "bg-white text-[#18251f] shadow-sm" : "text-[#7d8575]"}`}>{option.label}</button>)}
              </div>
            </div>
            <div aria-live="polite" aria-atomic="true" className="sr-only">{filtered.length} {filtered.length === 1 ? (locale === "en" ? "experience" : locale === "de" ? "Erlebnis" : locale === "es" ? "experiencia" : "esperienza") : t.count}</div>
            {loadError ? <p role="alert" className="rounded-[22px] border border-[#e8d7c9] bg-[#f7ede5] p-6 text-sm leading-6 text-[#7c4c33]">{t.error}</p> : filtered.length === 0 ? (
              <div className="rounded-[24px] border border-[#dedfd4] bg-[#eeeee7] p-6">
                <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#e3e4d8]"><CalendarDays className="h-[18px] w-[18px] text-[#7d866f]" aria-hidden="true" /></span>
                <h3 className="text-base font-semibold tracking-[-0.025em]">{period === "past" ? t.archiveEmpty : t.emptyTitle}</h3>
                <p className="mt-2 max-w-md text-[13px] leading-6 text-[#788170]">{period === "past" ? t.archiveText : t.empty}</p>
              </div>
            ) : list.length ? <div className="grid gap-3">{list.map((event) => <MerakiEventCard key={event.id} event={event} locale={locale} now={effectiveNow} past={period === "past"} />)}</div> : <p className="text-xs leading-6 text-[#7f8777]">{featured?.title} <span className="px-1 text-[#b2b8aa]">·</span> {locale === "en" ? "Discover the experience above" : locale === "de" ? "Entdecke das Erlebnis oben" : locale === "es" ? "Descubre la experiencia de arriba" : "Scopri l’esperienza qui sopra"}</p>}
          </div>
        </section>

        <aside className="min-w-0" aria-label={t.tickets}>
          <Link href="/biglietti" className="flex min-h-[88px] items-center gap-4 rounded-[22px] bg-[#1f3026] p-5 text-white"><Ticket className="h-6 w-6 shrink-0 text-[#d3bc91]" aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t.tickets}</span><span className="mt-1 block text-[11px] leading-5 text-[#bcc7b9]">{locale === "en" ? "Your QR code, always at hand." : locale === "de" ? "Dein QR-Code, immer griffbereit." : locale === "es" ? "Tu QR, siempre a mano." : "Il tuo QR, sempre a portata di mano."}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-[#d3bc91]" aria-hidden="true" /></Link>
        </aside>
      </div>
    </div>
  );
}
