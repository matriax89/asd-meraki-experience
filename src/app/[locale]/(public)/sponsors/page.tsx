import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  return {
    title: "Diventa Sponsor | ASD Meraki Experience",
    description: "Scopri come supportare il nostro progetto sportivo e i vantaggi di diventare un nostro partner ufficiale.",
  };
}

export default async function SponsorsPage() {
  const sponsors = [
    { name: "Brand One", tier: "Main Sponsor", desc: "Supporto ufficiale attrezzature." },
    { name: "Apex Sport", tier: "Gold Partner", desc: "Fornitura nutrizione sportiva." },
    { name: "Global Fit", tier: "Silver Partner", desc: "Abbigliamento tecnico." },
    { name: "Studio Plus", tier: "Bronze Partner", desc: "Consulenza e servizi." },
  ];

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
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {sponsors.map((s) => (
              <Link 
                key={s.name} 
                href={`/sponsors/${s.name.toLowerCase().replace(" ", "-")}`} 
                className="group p-8 bg-background border border-border/40 rounded-[2rem] flex flex-col items-center text-center shadow-sm hover:shadow-apple hover:-translate-y-1 transition-all duration-300"
              >
                <div className="w-20 h-20 bg-secondary rounded-2xl mb-6 flex items-center justify-center font-bold text-muted-foreground group-hover:bg-foreground group-hover:text-background transition-colors">
                  LOGO
                </div>
                <h3 className="text-[17px] font-bold tracking-tight mb-1">{s.name}</h3>
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">{s.tier}</p>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{s.desc}</p>
                
                <span className="mt-6 text-[12px] font-semibold text-foreground flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  Scopri di più <ArrowRight className="w-3 h-3" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
