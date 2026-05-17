"use client";

import { useState } from "react";
import { getLocalizedText } from "@/lib/i18n-utils";

export function ScheduleClient({ slotsByDay, fasce, giorniSettimana, locations, locale }: any) {
  const [selectedLocation, setSelectedLocation] = useState<string>("all");

  return (
    <div className="w-full">
      {/* Filtri */}
      <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
        <button 
          onClick={() => setSelectedLocation("all")}
          className={`px-5 py-2 rounded-full text-sm font-bold transition-colors ${selectedLocation === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"}`}
        >
          Tutte le sedi
        </button>
        {locations.map((loc: string) => (
          <button 
            key={loc}
            onClick={() => setSelectedLocation(loc.toLowerCase())}
            className={`px-5 py-2 rounded-full text-sm font-bold transition-colors ${selectedLocation === loc.toLowerCase() ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"}`}
          >
            {loc}
          </button>
        ))}
      </div>

      {/* Schedule Table */}
      <div className="bg-background rounded-[2rem] border border-border/40 shadow-apple overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead className="bg-secondary/50">
              <tr className="border-b border-border/40">
                <th className="p-5 w-24 text-[11px] font-bold text-muted-foreground uppercase tracking-widest text-center">Orario</th>
                {giorniSettimana.map((g: any) => (
                  <th key={g.id} className="p-5 text-center text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-l border-border/20">
                    <span className="hidden sm:inline">{g.label}</span>
                    <span className="sm:hidden">{g.short}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fasce.map((ora: string) => (
                <tr key={ora} className="border-b border-border/20 last:border-0 hover:bg-secondary/10 transition-colors">
                  <td className="p-5 font-mono text-[13px] text-slate-500 font-bold align-top text-center">
                    {ora}
                  </td>
                  {giorniSettimana.map((giorno: any) => {
                    const slots = slotsByDay[giorno.id]?.filter((s: any) => s.ora_inizio?.startsWith(ora) && (selectedLocation === "all" || s.sede?.toLowerCase() === selectedLocation)) || [];
                    
                    return (
                      <td key={giorno.id} className="p-2 border-l border-border/20 align-top min-h-[120px]">
                        <div className="flex flex-col gap-2 h-full">
                          {slots.map((slot: any, idx: number) => (
                            <div key={idx} className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 rounded-xl p-3 flex flex-col transition-all hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:border-indigo-200 dark:hover:border-indigo-800 shadow-sm cursor-pointer group">
                              <div className="flex justify-between items-start mb-1">
                                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest group-hover:text-indigo-700 transition-colors">
                                  {getLocalizedText(slot.course?.disciplina, locale) || "Corso"}
                                </span>
                                {slot.sede && (
                                  <span className="text-[9px] font-bold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full uppercase">
                                    {slot.sede}
                                  </span>
                                )}
                              </div>
                              <span className="font-bold text-[14px] text-foreground leading-tight mb-1 group-hover:text-indigo-600 transition-colors">
                                {getLocalizedText(slot.course?.nome, locale) || "Allenamento"}
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
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
