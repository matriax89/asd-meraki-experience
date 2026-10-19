import { Link } from "@/i18n/routing";

import { getLocale } from "next-intl/server";
import { getLocalizedText } from "@/lib/i18n-utils";
import { EventPoster } from "@/components/meraki/event-poster";

type EventCardProps = {
  id: string;
  slug: string;
  tipo: "evento" | "workshop" | "masterclass";
  titolo: unknown;
  sottotitolo?: unknown;
  data_inizio: string;
  copertina_url?: string | null;
  capacity?: number | null;
  posti_venduti?: number | null;
  prezzo_cents?: number | null;
};

export async function EventCard({
  slug,
  tipo,
  titolo,
  sottotitolo,
  data_inizio,
  copertina_url,
  capacity,
  posti_venduti,
  prezzo_cents,
}: EventCardProps) {
  const locale = await getLocale();
  const date = new Date(data_inizio);
  const formattedDate = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" }).format(date);
  const formattedTime = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Rome" }).format(date);
  
  const venduti = posti_venduti || 0;
  const postiDisponibili = capacity == null ? null : Math.max(0, capacity - venduti);
  const isEsaurito = postiDisponibili !== null && postiDisponibili <= 0;
  
  const href = tipo === "evento" ? `/eventi/${slug}` : `/workshop/${slug}`;
  const subtitle = getLocalizedText(sottotitolo, locale);

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-[24px] border border-border/40 bg-background shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
      <div className="mx-auto w-full max-w-[420px] p-4"><EventPoster src={copertina_url || null} title={getLocalizedText(titolo, locale)} locale={locale} /></div>
      
      <div className="p-6 md:p-8 flex flex-col flex-1 relative z-20 bg-background">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{tipo}</p>
        <div className="flex items-center text-[12px] font-semibold text-muted-foreground uppercase tracking-widest mb-3 gap-2">
          <span>{formattedDate}</span>
          <span className="text-border">•</span>
          <span>{formattedTime}</span>
        </div>
        
        <h3 className="font-bold text-[22px] text-foreground mb-3 leading-tight group-hover:text-slate-600 transition-colors">
          <Link href={href} className="outline-offset-4 hover:underline">{getLocalizedText(titolo, locale)}</Link>
        </h3>
        
        {subtitle && (
          <p className="text-slate-500 text-[15px] leading-relaxed mb-6 line-clamp-2">
            {subtitle}
          </p>
        )}
        
        <div className="mt-auto pt-6 flex items-end justify-between border-t border-border/40">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Prezzo</span>
            <span className="text-xl font-extrabold text-foreground tracking-tight">
              {prezzo_cents ? new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(prezzo_cents / 100) : "Gratis"}
            </span>
          </div>
          
          <div className="flex flex-col items-end">
            {isEsaurito ? (
              <span className="text-red-500 font-bold text-xs uppercase tracking-widest px-3 py-1.5 bg-red-50 dark:bg-red-950/30 rounded-lg">Esaurito</span>
            ) : postiDisponibili !== null ? (
              <span className="text-sm font-medium text-muted-foreground bg-secondary/50 px-3 py-1 rounded-lg">
                <strong className="text-foreground">{postiDisponibili}</strong> posti
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}
