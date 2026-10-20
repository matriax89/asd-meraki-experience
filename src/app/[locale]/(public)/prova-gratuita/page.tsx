import { getLocale, getTranslations } from "next-intl/server";
import { LeadForm } from "@/components/public/lead-form";
import { createClient } from "@/lib/supabase/server";
import { getLocalizedText } from "@/lib/i18n-utils";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "PublicUi" });
  return { title: `${t("freeTrialTitle")} · Meraki Experience` };
}

export default async function ProvaGratuitaPage() {
  const locale = await getLocale();
  const t = await getTranslations("PublicUi");
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "prova_gratuita_content")
    .single();

  const content = (settings?.value as any) || {};

  const badge = getLocalizedText(content.badge, locale) || t("freeTrialBadge");
  const titolo = getLocalizedText(content.titolo, locale) || t("freeTrialTitle");
  const sottotitolo = getLocalizedText(content.sottotitolo, locale) || t("freeTrialDescription");
  const steps = content.steps || [
    { n: "1", title: t("freeTrialStep1"), desc: t("freeTrialStep1Description") },
    { n: "2", title: t("freeTrialStep2"), desc: t("freeTrialStep2Description") },
    { n: "3", title: t("freeTrialStep3"), desc: t("freeTrialStep3Description") },
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
              <h3 className="text-sm font-bold mb-1">{getLocalizedText(s.title, locale)}</h3>
              <p className="text-xs text-muted-foreground">{getLocalizedText(s.desc, locale)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
