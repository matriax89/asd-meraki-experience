import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { TeamGrid } from "@/components/public/team-grid";
import { Link } from "@/i18n/routing";
import { ArrowRight, Heart, Target, Users } from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Index" });
  return { title: `Chi siamo · ${t("title")}` };
}

export default async function ChiSiamoPage() {
  const supabase = await createClient();
  const { data: teamMembers } = await supabase
    .from("team_members")
    .select("*")
    .order("is_direttivo", { ascending: false })
    .order("ordine_display", { ascending: true });

  const direttivo = teamMembers?.filter((m) => m.is_direttivo) || [];
  const istruttori = teamMembers?.filter((m) => m.is_istruttore && !m.is_direttivo) || [];

  return (
    <div className="pt-32 pb-20">
      <div className="container">
        {/* Hero */}
        <div className="max-w-3xl mb-20">
          <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-[0.2em] mb-4">Chi siamo</p>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tighter mb-6 text-foreground leading-[1.1]">
            La nostra storia
          </h1>
          <div className="space-y-4 text-lg text-muted-foreground leading-relaxed">
            <p>
              <span className="font-bold text-foreground">Meraki</span> (dal greco μεράκι) significa fare qualcosa con anima, creatività o amore — quando metti "qualcosa di te" in quello che fai.
            </p>
            <p>
              Siamo un'associazione sportiva dilettantistica dedicata al benessere e al fitness, con l'obiettivo di accompagnare i nostri soci in un percorso di cambiamento fisico e mentale.
            </p>
          </div>
        </div>

        {/* Values */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-24">
          {[
            { icon: Heart, title: "Passione", desc: "Ogni lezione è un'esperienza, non un allenamento meccanico." },
            { icon: Target, title: "Obiettivi", desc: "Percorsi personalizzati per ogni livello, dal principiante all'avanzato." },
            { icon: Users, title: "Community", desc: "Una famiglia dove ognuno si sente accolto e motivato a dare il meglio." },
          ].map((v) => (
            <div key={v.title} className="bg-background rounded-[2rem] border border-border/40 shadow-sm hover:shadow-apple transition-shadow p-8">
              <div className="w-12 h-12 rounded-[14px] bg-secondary flex items-center justify-center mb-5 text-foreground">
                <v.icon className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold tracking-tight mb-2">{v.title}</h3>
              <p className="text-[15px] text-muted-foreground leading-relaxed">{v.desc}</p>
            </div>
          ))}
        </div>

        {/* Team */}
        {direttivo.length > 0 && (
          <section className="mb-16">
            <h2 className="text-3xl font-bold tracking-tight mb-2">Il Direttivo</h2>
            <p className="text-muted-foreground mb-8">Le persone che guidano la nostra associazione.</p>
            <TeamGrid members={direttivo} />
          </section>
        )}

        {istruttori.length > 0 && (
          <section className="mb-16">
            <h2 className="text-3xl font-bold tracking-tight mb-2">I Nostri Istruttori</h2>
            <p className="text-muted-foreground mb-8">Professionisti dedicati al tuo percorso di crescita.</p>
            <TeamGrid members={istruttori} />
          </section>
        )}

        {/* CTA */}
        <div className="bg-secondary/30 rounded-[2rem] border border-border/40 p-12 md:p-16 text-center">
          <h2 className="text-3xl font-bold tracking-tight mb-4">Vuoi fare parte della famiglia?</h2>
          <p className="text-[15px] text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
            Prenota la tua prima lezione di prova gratuita e scopri se Meraki è il posto giusto per te.
          </p>
          <Link
            href="/prova-gratuita"
            className="group inline-flex h-14 items-center gap-2 rounded-full bg-foreground px-8 text-sm font-bold text-background transition-all shadow-md hover:bg-foreground/90 hover:-translate-y-0.5"
          >
            Prova Gratuita
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </div>
  );
}
