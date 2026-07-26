import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/public/event-card";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Index" });
  return {
    title: `Workshop · ${t("title")}`,
  };
}

export default async function WorkshopPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const supabase = await createClient();
  const { data: workshop } = await supabase
    .from("events")
    .select("*")
    .eq("attivo", true)
    .in("tipo", ["workshop", "masterclass"])
    .gte("data_inizio", new Date().toISOString())
    .order("data_inizio", { ascending: true });
  const copy = {
    it: { title: "Workshop e masterclass", desc: "Approfondisci la tua pratica con incontri tematici guidati dai nostri esperti.", empty: "Nessun workshop in programma al momento." },
    en: { title: "Workshops and masterclasses", desc: "Deepen your practice with themed sessions led by our experts.", empty: "There are no workshops scheduled at the moment." },
    de: { title: "Workshops und Masterclasses", desc: "Vertiefen Sie Ihre Praxis mit thematischen Einheiten unter der Leitung unserer Experten.", empty: "Derzeit sind keine Workshops geplant." },
  }[locale as "it" | "en" | "de"] || { title: "Workshop e masterclass", desc: "Approfondisci la tua pratica con incontri tematici guidati dai nostri esperti.", empty: "Nessun workshop in programma al momento." };

  return (
    <div className="container py-12 md:py-24">
      <div className="max-w-2xl mb-12">
        <h1 className="text-4xl md:text-5xl font-heading font-bold text-primary mb-6">
          {copy.title}
        </h1>
        <p className="text-lg text-muted-foreground">
          {copy.desc}
        </p>
      </div>

      {workshop && workshop.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {workshop.map((ws) => (
            <EventCard key={ws.id} {...ws} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-card rounded-xl border border-border">
          <p className="text-muted-foreground">{copy.empty}</p>
        </div>
      )}
    </div>
  );
}
