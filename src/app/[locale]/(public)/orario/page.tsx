import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ScheduleClient } from "./schedule-client";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "PublicUi" });
  return { title: `${t("scheduleTitle")} · Meraki Experience` };
}

const giorniSettimana = [
  { id: "lun", label: "Lunedì", short: "LUN" },
  { id: "mar", label: "Martedì", short: "MAR" },
  { id: "mer", label: "Mercoledì", short: "MER" },
  { id: "gio", label: "Giovedì", short: "GIO" },
  { id: "ven", label: "Venerdì", short: "VEN" },
];

export default async function OrarioPage() {
  const locale = await getLocale();
  const t = await getTranslations("PublicUi");
  const tDays = await getTranslations("Index.schedule.days");
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
          <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-4">{t("scheduleBadge")}</p>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tighter mb-6 text-foreground leading-[1.1]">
            {t("scheduleTitle")}
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            {t("scheduleDescription")}
          </p>
        </div>

        <ScheduleClient 
          slotsByDay={slotsByDay} 
          fasce={fasce} 
          giorniSettimana={giorniSettimana.map(day => ({ ...day, label: tDays(day.id), short: tDays(day.id) }))}
          locale={locale}
          locations={locations} 
        />

        <p className="text-center text-sm text-muted-foreground/60 mt-6">
          {t("scheduleNote")}
        </p>
      </div>
    </div>
  );
}
