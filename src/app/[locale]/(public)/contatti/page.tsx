import { getTranslations } from "next-intl/server";
import { ContactForm } from "@/components/public/contact-form";
import { Mail, MapPin, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Index" });
  return { title: `Contatti · ${t("title")}` };
}

export default async function ContattiPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Contact" });

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "homepage_content")
    .single();

  const contactsData = (settings?.value as any)?.contacts || null;

  return (
    <div className="pt-24 pb-24 md:pt-32 md:pb-32 bg-background min-h-screen">
      <div className="container max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">{t("badge")}</p>
          <h1 className="text-5xl md:text-6xl font-heading font-extrabold text-slate-900 tracking-tight mb-6">
            {t("headline")}
          </h1>
          <p className="text-lg text-slate-500 leading-relaxed">
            {t("subheadline")}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12 items-start">
          {/* Info Card */}
          <div className="lg:col-span-2 bg-slate-900 rounded-[32px] md:rounded-[40px] p-6 sm:p-8 md:p-12 text-white shadow-[0_20px_40px_rgb(0,0,0,0.2)] relative overflow-hidden h-full flex flex-col justify-between">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-slate-800 rounded-full blur-3xl opacity-50 pointer-events-none"></div>
            
            <div className="relative z-10 space-y-10">
              <div>
                <h3 className="text-2xl font-bold mb-8">{t("details_title")}</h3>
                <div className="space-y-8">
                  {[
                    { icon: MapPin, title: t("hq"), content: contactsData?.address || "Via delle Palestre 12, 39100 Bolzano (BZ)" },
                    { icon: Mail, title: t("email"), content: contactsData?.email || "info@merakiexperience.org", href: `mailto:${contactsData?.email || "info@merakiexperience.org"}` },
                    { icon: Phone, title: t("phone"), content: contactsData?.phone || "+39 333 1234567", href: `tel:${(contactsData?.phone || "+39 333 1234567").replace(/\\s/g, '')}` },
                  ].map((item) => (
                    <div key={item.title} className="flex items-start gap-5 group">
                      <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 group-hover:bg-white/20 group-hover:scale-110 transition-all duration-300">
                        <item.icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-400 mb-1">{item.title}</p>
                        {item.href ? (
                          <a href={item.href} className="text-base sm:text-lg font-semibold hover:text-slate-300 transition-colors break-all sm:break-words">
                            {item.content}
                          </a>
                        ) : (
                          <p className="text-base sm:text-lg font-semibold break-words">{item.content}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative z-10 mt-16 pt-8 border-t border-white/10">
              <p className="text-sm text-slate-400">
                {t("office_hours_title")}:<br/>
                {t("office_hours_desc")}
              </p>
            </div>
          </div>

          {/* Form Card */}
          <div className="lg:col-span-3 bg-white rounded-[32px] md:rounded-[40px] p-6 sm:p-8 md:p-12 shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-100">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">{t("form_title")}</h2>
            <p className="text-slate-500 mb-10">{t("form_desc")}</p>
            <ContactForm />
          </div>
        </div>
      </div>
    </div>
  );
}
