import { getTranslations } from "next-intl/server";
import { LeadForm } from "@/components/public/lead-form";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Index" });
  return { title: `Prova Gratuita · ${t("title")}` };
}

export default async function ProvaGratuitaPage() {
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "prova_gratuita_content")
    .single();

  const content = (settings?.value as any) || {};

  const badge = content.badge || "Posti disponibili";
  const titolo = content.titolo || "Prova gratuita";
  const sottotitolo = content.sottotitolo || "Compila il modulo, verrai ricontattato entro 24 ore per fissare la tua prova.";
  const steps = content.steps || [
    { n: "1", title: "Compila", desc: "Lascia i tuoi dati e le preferenze." },
    { n: "2", title: "Ti chiamiamo", desc: "Scegliamo insieme il giorno." },
    { n: "3", title: "Allenati", desc: "La prima lezione è offerta." },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <div className="container pt-32 pb-20 flex-1 flex flex-col items-center justify-center">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-1.5 text-xs font-medium text-muted-foreground mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {badge}
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4 leading-[1.1]">
            {titolo}
          </h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed whitespace-pre-line">
            {sottotitolo}
          </p>
        </div>

        <div className="w-full max-w-lg mx-auto rounded-2xl border border-border p-8 md:p-10">
          <LeadForm />
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-3xl mx-auto text-center">
          {steps.map((s: any, i: number) => (
            <div key={i}>
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center mx-auto mb-3">
                <span className="text-xs font-bold text-muted-foreground">{s.n}</span>
              </div>
              <h3 className="text-sm font-bold mb-1">{s.title}</h3>
              <p className="text-xs text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
