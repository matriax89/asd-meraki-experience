import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/public/event-card";
import { CalendarDays } from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "EventsPage" });
  return { title: `${t("title")} · Meraki Experience` };
}

export default async function EventiPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "EventsPage" });
  const supabase = await createClient();
  const { data: eventi } = await supabase
    .from("events")
    .select("*")
    .eq("attivo", true)
    .eq("tipo", "evento")
    .order("data_inizio", { ascending: true });
  const now = Date.now();
  const upcomingEvents = (eventi || []).filter((evento) => new Date(evento.data_fine || evento.data_inizio).getTime() >= now);
  const pastEvents = (eventi || [])
    .filter((evento) => new Date(evento.data_fine || evento.data_inizio).getTime() < now)
    .reverse();

  return (
    <div className="pt-32 pb-20">
      <div className="container">
        {/* Header */}
        <div className="max-w-2xl mb-16 text-center mx-auto">
          <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-4">{t("badge")}</p>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tighter mb-6 text-foreground leading-[1.1]">
            {t("headline")}
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {t("subheadline")}
          </p>
        </div>

        {upcomingEvents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {upcomingEvents.map((evento) => (
              <EventCard key={evento.id} {...evento} />
            ))}
          </div>
        ) : (
          <div className="text-center py-32 rounded-[2rem] bg-secondary/30 border border-border/40 shadow-sm">
            <CalendarDays className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-foreground font-bold text-lg mb-2">{t("empty_title")}</p>
            <p className="text-[15px] text-muted-foreground">{t("empty_desc")}</p>
          </div>
        )}

        {pastEvents.length > 0 && (
          <section className="mt-20 border-t border-border/60 pt-12">
            <div className="mb-8">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Archivio</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight">Eventi passati</h2>
              <p className="mt-2 text-sm text-muted-foreground">Gli eventi conclusi rimangono consultabili, ma le iscrizioni sono chiuse.</p>
            </div>
            <div className="grid grid-cols-1 gap-6 opacity-80 md:grid-cols-2 lg:grid-cols-3">
              {pastEvents.map((evento) => <EventCard key={evento.id} {...evento} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
