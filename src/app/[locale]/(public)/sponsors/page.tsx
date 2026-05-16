import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  return {
    title: "Diventa Sponsor | ASD Meraki Experience",
    description: "Scopri come supportare il nostro progetto sportivo e i vantaggi di diventare un nostro partner ufficiale.",
  };
}

export default async function SponsorsPage() {
  const supabase = await createClient();
  const { data: sponsorsList } = await supabase
    .from("sponsors")
    .select("*")
    .eq("attivo", true)
    .order("ordine_display", { ascending: true });

  const benefits = [
    "Visibilità Premium del tuo brand all'interno delle nostre sedi e sui nostri canali digitali.",
    "Accesso esclusivo a eventi, workshop e masterclass organizzati dall'associazione.",
    "Associare il tuo marchio a valori di eccellenza, salute, benessere e dedizione sportiva.",
    "Iniziative di co-marketing personalizzate per raggiungere una community attiva e fedele."
  ];

  return (
    <div className="flex flex-col min-h-screen pt-24 pb-12">
      
      {/* Header & Intro */}
      <section className="py-12 md:py-20">
        <div className="container max-w-4xl text-center">
          <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-4">Partnership</p>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tighter mb-6 text-foreground leading-[1.1]">
            Diventa nostro Sponsor
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed mb-10 max-w-2xl mx-auto">
            Unisciti alla nostra missione. Sostenere ASD Meraki Experience significa investire nel benessere, nello sport e in una community in continua crescita.
          </p>
          
          <div className="bg-secondary/40 border border-border/50 p-8 md:p-12 rounded-[2rem] text-left">
            <h3 className="text-2xl font-bold mb-6 tracking-tight">Perché diventare partner?</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {benefits.map((b, i) => (
                <div key={i} className="flex gap-3">
                  <CheckCircle2 className="w-5 h-5 text-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-[15px] text-muted-foreground leading-relaxed">{b}</p>
                </div>
              ))}
            </div>
            
            <div className="mt-10 pt-8 border-t border-border/50 text-center">
              <Link href="/contatti" className="inline-flex h-12 items-center gap-2 rounded-full bg-foreground text-background px-8 text-sm font-bold transition-all hover:opacity-90 active:scale-[0.97]">
                Contattaci per una proposta
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Erogazione Liberale */}
          <div className="mt-8 bg-amber-50/50 border border-amber-100 p-8 md:p-12 rounded-[2rem] text-left">
            <h3 className="text-2xl font-bold mb-4 tracking-tight text-amber-900">Supportaci con un'Erogazione Liberale</h3>
            <div className="space-y-4 text-[15px] text-amber-800/80 leading-relaxed">
              <p>
                Oltre alla sponsorizzazione commerciale, puoi sostenere ASD Meraki Experience attraverso un'<strong>Erogazione Liberale</strong> (donazione volontaria). 
              </p>
              <p>
                Le erogazioni liberali a favore delle Associazioni Sportive Dilettantistiche (ASD) godono di importanti <strong>agevolazioni fiscali</strong> previste dalla normativa italiana (art. 15, comma 1, lett. i-ter del TUIR per le persone fisiche e art. 100, comma 2, lett. m del TUIR per i soggetti IRES). 
              </p>
              <p>
                Privati cittadini e aziende possono così contribuire attivamente alla crescita dello sport e del benessere sul territorio, deducendo o detraendo l'importo donato nella propria dichiarazione dei redditi.
              </p>
            </div>
            
            <div className="mt-8 pt-6 border-t border-amber-200/50">
              <Link href="/contatti" className="inline-flex h-12 items-center gap-2 rounded-full bg-amber-600 text-white px-8 text-sm font-bold transition-all hover:bg-amber-700 active:scale-[0.97]">
                Richiedi informazioni per donare
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Current Sponsors Grid */}
      <section className="py-16 bg-secondary/20">
        <div className="container max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Chi ci sostiene già</h2>
          </div>
          
          <div className="flex flex-wrap justify-center items-center gap-4 md:gap-6">
            {sponsorsList && sponsorsList.length > 0 ? sponsorsList.map((s) => (
              <Link 
                key={s.id} 
                href={`/sponsors/${s.slug}`} 
                className="group w-[200px] md:w-[280px] h-[160px] md:h-[200px] rounded-[1.5rem] bg-white border border-slate-100 p-5 md:p-6 flex flex-col items-center justify-center shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_15px_30px_rgb(0,0,0,0.08)] hover:-translate-y-1.5 transition-all duration-300 cursor-pointer relative overflow-hidden"
              >
                <div className="flex flex-col items-center justify-center w-full h-full relative z-0">
                  {s.logo_url ? (
                    <div className="relative w-full h-20 md:h-28 mb-3 md:mb-4">
                      <Image src={s.logo_url} alt={s.nome} fill className="object-contain group-hover:scale-105 transition-transform duration-500 ease-out" />
                    </div>
                  ) : (
                    <div className="w-14 h-14 bg-slate-50 rounded-full mb-3 flex items-center justify-center text-slate-300 group-hover:bg-slate-100 transition-colors">
                      <span className="text-xl font-bold">{s.nome[0]}</span>
                    </div>
                  )}
                  <span className="font-bold text-[13px] md:text-sm tracking-tight text-center text-slate-700 group-hover:text-slate-900 transition-colors line-clamp-1">{s.nome}</span>
                  {s.tier && (
                    <span className="mt-2 px-2.5 py-0.5 bg-slate-50 text-slate-600 group-hover:bg-amber-50 group-hover:text-amber-700 text-[9px] font-bold uppercase tracking-wider rounded-full border border-slate-100 group-hover:border-amber-100 whitespace-nowrap transition-colors duration-300">
                      {s.tier}
                    </span>
                  )}
                </div>
              </Link>
            )) : (
              <div className="w-full text-center text-muted-foreground py-12">
                Diventa il nostro primo sponsor! Contattaci per scoprire i vantaggi.
              </div>
            )}
          </div>
        </div>
      </section>

    </div>
  );
}
