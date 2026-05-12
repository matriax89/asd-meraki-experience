import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/public/event-card";
import { CalendarDays } from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Index" });
  return { title: `Eventi · ${t("title")}` };
}

export default async function EventiPage() {
  const supabase = await createClient();
  const { data: eventi } = await supabase
    .from("events")
    .select("*")
    .eq("attivo", true)
    .eq("tipo", "evento")
    .order("data_inizio", { ascending: true });

  return (
    <div className="pt-32 pb-20">
      <div className="container">
        {/* Header */}
        <div className="max-w-2xl mb-16 text-center mx-auto">
          <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-4">Calendario</p>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tighter mb-6 text-foreground leading-[1.1]">
            Eventi
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Scopri i nostri prossimi eventi speciali, ritiri e giornate dedicate al benessere.
          </p>
        </div>

        {eventi && eventi.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {eventi.map((evento) => (
              <EventCard key={evento.id} {...evento} />
            ))}
          </div>
        ) : (
          <div className="text-center py-32 rounded-[2rem] bg-secondary/30 border border-border/40 shadow-sm">
            <CalendarDays className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-foreground font-bold text-lg mb-2">Nessun evento in programma al momento.</p>
            <p className="text-[15px] text-muted-foreground">Stiamo preparando nuove esperienze per te.</p>
          </div>
        )}
      </div>
    </div>
  );
}
