import { Link } from "@/i18n/routing";
import { format } from "date-fns";
import { it } from "date-fns/locale";

type EventCardProps = {
  id: string;
  slug: string;
  tipo: "evento" | "workshop" | "masterclass";
  titolo: string;
  sottotitolo?: string | null;
  data_inizio: string;
  copertina_url?: string | null;
  capacity?: number | null;
  posti_venduti?: number | null;
  prezzo_cents?: number | null;
};

export function EventCard({
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
  const date = new Date(data_inizio);
  const formattedDate = format(date, "d MMMM yyyy", { locale: it });
  const formattedTime = format(date, "HH:mm");
  
  const venduti = posti_venduti || 0;
  const postiDisponibili = capacity ? capacity - venduti : null;
  const isEsaurito = postiDisponibili !== null && postiDisponibili <= 0;
  
  const href = tipo === "evento" ? `/eventi/${slug}` : `/workshop/${slug}`;

  return (
    <Link href={href} className="group relative flex flex-col h-full rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.06)] overflow-hidden transition-all duration-300 hover:shadow-[0_20px_40px_rgb(0,0,0,0.12)] hover:-translate-y-1 bg-background border border-border/40">
      <div className="aspect-[16/9] relative overflow-hidden bg-secondary/50">
        {copertina_url ? (
          <img src={copertina_url} alt={titolo} className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-700 ease-out" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-tr from-secondary to-secondary/50" />
        )}
        <div className="absolute top-4 left-4 z-20 bg-background/90 backdrop-blur-md text-foreground text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest shadow-sm">
          {tipo}
        </div>
      </div>
      
      <div className="p-6 md:p-8 flex flex-col flex-1 relative z-20 bg-background">
        <div className="flex items-center text-[12px] font-semibold text-muted-foreground uppercase tracking-widest mb-3 gap-2">
          <span>{formattedDate}</span>
          <span className="text-border">•</span>
          <span>{formattedTime}</span>
        </div>
        
        <h3 className="font-bold text-[22px] text-foreground mb-3 leading-tight group-hover:text-slate-600 transition-colors">
          {titolo}
        </h3>
        
        {sottotitolo && (
          <p className="text-slate-500 text-[15px] leading-relaxed mb-6 line-clamp-2">
            {sottotitolo}
          </p>
        )}
        
        <div className="mt-auto pt-6 flex items-end justify-between border-t border-border/40">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Prezzo</span>
            <span className="text-xl font-extrabold text-foreground tracking-tight">
              {prezzo_cents ? `€${(prezzo_cents / 100).toFixed(2)}` : "Gratis"}
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
    </Link>
  );
}
