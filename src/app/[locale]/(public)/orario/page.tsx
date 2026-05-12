import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

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

        {/* Schedule Table */}
        <div className="bg-background rounded-[2rem] border border-border/40 shadow-apple overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead className="bg-secondary/50">
                <tr className="border-b border-border/40">
                  <th className="p-5 w-24 text-[11px] font-bold text-muted-foreground uppercase tracking-widest text-center">Orario</th>
                  {giorniSettimana.map((g) => (
                    <th key={g.id} className="p-5 text-center text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-l border-border/20">
                      <span className="hidden sm:inline">{g.label}</span>
                      <span className="sm:hidden">{g.short}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fasce.map((ora) => (
                  <tr key={ora} className="border-b border-border/20 last:border-0 hover:bg-secondary/10 transition-colors">
                    <td className="p-5 font-mono text-[13px] text-slate-500 font-bold align-top text-center">
                      {ora}
                    </td>
                    {giorniSettimana.map((giorno) => {
                      const slot = slotsByDay[giorno.id]?.find((s) => s.ora_inizio?.startsWith(ora));
                      return (
                        <td key={giorno.id} className="p-2 border-l border-border/20 align-top h-[120px]">
                          {slot && (
                            <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 rounded-xl p-3 h-full flex flex-col transition-all hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:border-indigo-200 dark:hover:border-indigo-800 shadow-sm cursor-pointer group">
                              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-1 group-hover:text-indigo-700 transition-colors">
                                {slot.course?.disciplina || "Corso"}
                              </span>
                              <span className="font-bold text-[14px] text-foreground leading-tight mb-1 group-hover:text-indigo-600 transition-colors">
                                {slot.course?.nome || "Allenamento"}
                              </span>
                              <span className="text-[12px] text-muted-foreground mt-auto">
                                {slot.ora_inizio?.substring(0, 5)} – {slot.ora_fine?.substring(0, 5)}
                              </span>
                              {slot.istruttore && (
                                <span className="text-[11px] text-muted-foreground/60 mt-0.5">
                                  con {slot.istruttore.nome}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground/60 mt-6">
          L'orario potrebbe subire variazioni. Iscriviti per prenotare il tuo posto e ricevere notifiche.
        </p>
      </div>
    </div>
  );
}
