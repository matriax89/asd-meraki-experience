import { Link } from "@/i18n/routing";

import { getLocale } from "next-intl/server";
import { getLocalizedText } from "@/lib/i18n-utils";

type CourseCardProps = {
  slug: string;
  nome: any;
  descrizione_breve?: any | null;
  copertina_url?: string | null;
  disciplina: string;
  orari?: { giorno: string; ora_inizio: string; ora_fine: string; sede: string }[];
};

export async function CourseCard({
  slug,
  nome,
  descrizione_breve,
  copertina_url,
  disciplina,
  orari
}: CourseCardProps) {
  const locale = await getLocale();
  return (
    <div className="group relative flex flex-col h-full rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.08)] overflow-hidden transition-all duration-300 hover:shadow-[0_20px_40px_rgb(0,0,0,0.12)] hover:-translate-y-1 bg-slate-50">
      
      {/* Image Area */}
      <Link href={`/corsi/${slug}`} className="relative block w-full aspect-[4/5] overflow-hidden shrink-0 bg-slate-100">
        <div className="absolute inset-0">
          {copertina_url ? (
            <img 
              src={copertina_url} 
              alt={nome} 
              className="w-full h-full object-contain object-top group-hover:scale-105 transition-transform duration-700 ease-out bg-white" 
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-tr from-slate-200 to-slate-100" />
          )}
        </div>
        <div className="absolute top-4 left-4 z-20 bg-white/90 backdrop-blur-md text-slate-800 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest shadow-sm">
          {disciplina}
        </div>
      </Link>
      
      {/* Content Section overlapping with rounded top corners */}
      <div className="relative z-20 flex flex-col flex-1 p-6 md:p-7 bg-white rounded-[24px] -mt-8 shadow-[0_-8px_20px_rgba(0,0,0,0.04)]">
        {/* Title */}
        <Link href={`/corsi/${slug}`}>
          <h3 className="font-bold text-[22px] text-slate-800 mb-3 leading-tight group-hover:text-slate-600 transition-colors">
            {getLocalizedText(nome, locale)}
          </h3>
        </Link>
        
        {/* Orari */}
        {orari && orari.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {orari.map((orario, idx) => (
              <div 
                key={idx} 
                className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-[10px] sm:text-[11px] px-2.5 py-1.5 rounded-full shadow-sm hover:border-slate-300 hover:shadow-md transition-all cursor-default group/badge"
              >
                <div className="flex items-center gap-1">
                  <span className="font-extrabold text-slate-900 uppercase tracking-wider">{orario.giorno}</span>
                  <span className="font-medium text-slate-500">{orario.ora_inizio}</span>
                </div>
                
                <div className="w-1 h-1 rounded-full bg-slate-200 mx-0.5 group-hover/badge:bg-slate-300 transition-colors" />
                
                <div className="flex items-center gap-1 text-slate-500 group-hover/badge:text-slate-700 transition-colors">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="font-semibold tracking-wide truncate max-w-[70px]">{orario.sede}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* Description */}
        <p className="text-slate-500 text-[15px] leading-relaxed mb-6 line-clamp-3 flex-1">
          {getLocalizedText(descrizione_breve, locale) || "Scopri i nostri corsi e migliora il tuo benessere fisico e mentale."}
        </p>
        
        {/* Footer Action */}
        <div className="mt-auto pt-2">
          <Link href={`/corsi/${slug}`} className="block w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm px-6 py-3 rounded-xl shadow-md transition-colors text-center">
            Scopri di più
          </Link>
        </div>
      </div>
    </div>
  );
}
