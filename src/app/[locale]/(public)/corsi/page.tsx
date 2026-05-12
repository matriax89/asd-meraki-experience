import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { CourseCard } from "@/components/public/course-card";
import { Link } from "@/i18n/routing";
import { ArrowRight } from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Index" });
  return { title: `Corsi · ${t("title")}` };
}

export default async function CorsiPage() {
  const supabase = await createClient();
  const { data: corsi } = await supabase
    .from("courses")
    .select("*")
    .eq("attivo", true)
    .order("ordine_display", { ascending: true })
    .order("created_at", { ascending: false });

  return (
    <div className="pt-32 pb-20">
      <div className="container">
        {/* Header */}
        <div className="max-w-2xl mb-16 text-center mx-auto">
          <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-4">La nostra offerta</p>
          <h1 className="text-5xl md:text-6xl font-heading font-extrabold text-slate-900 tracking-tight mb-6">
            I Nostri Corsi
          </h1>
          <p className="text-lg text-slate-600 leading-relaxed">
            Scopri la nostra offerta formativa. Dal potenziamento muscolare alle discipline aeree, troverai il percorso perfetto per te.
          </p>
        </div>

        {corsi && corsi.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {corsi.map((corso) => (
              <CourseCard key={corso.id} {...corso} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-[40px] p-12 md:p-20 text-center shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-100 max-w-3xl mx-auto">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-slate-900 mb-3">Nessun corso disponibile</h3>
            <p className="text-slate-500 mb-8 max-w-md mx-auto">
              Stiamo attualmente aggiornando il nostro palinsesto. Torna a trovarci presto per scoprire i nuovi corsi e le nuove masterclass.
            </p>
            <Link 
              href="/contatti" 
              className="inline-flex items-center justify-center gap-2 bg-slate-900 text-white font-bold py-4 px-8 rounded-2xl hover:bg-slate-800 transition-all hover:-translate-y-0.5 shadow-md"
            >
              Richiedi informazioni <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
