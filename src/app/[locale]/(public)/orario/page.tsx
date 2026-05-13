import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ScheduleClient } from "./schedule-client";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Index" });
  return { title: `Orario · ${t("title")}` };
}

const giorniSettimana = [
  { id: "lun", label: "Lunedì", short: "LUN" },
  { id: "mar", label: "Martedì", short: "MAR" },
  { id: "mer", label: "Mercoledì", short: "MER" },
  { id: "gio", label: "Giovedì", short: "GIO" },
  { id: "ven", label: "Venerdì", short: "VEN" },
];

export default async function OrarioPage() {
  const supabase = await createClient();
  const { data: scheduleSlots } = await supabase
    .from("schedule_slots")
    .select("*, course:courses(*), istruttore:team_members(*)")
    .eq("attivo", true)
    .order("ora_inizio", { ascending: true });

  const slotsByDay = giorniSettimana.reduce((acc, giorno) => {
    acc[giorno.id] = (scheduleSlots || []).filter((s) => s.giorno === giorno.id);
    return acc;
  }, {} as Record<string, any[]>);

  const hasSlots = scheduleSlots && scheduleSlots.length > 0;
  const fasce = ["09:00", "12:30", "18:00", "19:00", "20:00"];

  const { data: settingsData } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "homepage_content")
    .single();

  const locations = (settingsData?.value as any)?.locations || ["Bolzano", "Appiano", "Altro"];

  return (
    <div className="pt-32 pb-20">
      <div className="container">
        {/* Header */}
        <div className="max-w-2xl mb-16 text-center mx-auto">
          <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-4">Pianifica</p>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tighter mb-6 text-foreground leading-[1.1]">
            Orario Lezioni
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Scegli il momento migliore per allenarti. Il nostro palinsesto offre classi adatte ad ogni esigenza.
          </p>
        </div>

        <ScheduleClient 
          slotsByDay={slotsByDay} 
          fasce={fasce} 
          giorniSettimana={giorniSettimana} 
          locations={locations} 
        />

        <p className="text-center text-sm text-muted-foreground/60 mt-6">
          L'orario potrebbe subire variazioni. Iscriviti per prenotare il tuo posto e ricevere notifiche.
        </p>
      </div>
    </div>
  );
}
