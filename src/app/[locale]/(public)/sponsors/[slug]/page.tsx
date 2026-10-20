import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { ArrowLeft, Globe, Mail } from "lucide-react";


export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { slug } = await params;
  const t = await getTranslations("PublicUi");
  // In a real app, fetch the sponsor name by slug.
  const name = slug.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  return {
    title: `${name} | Sponsor ASD Meraki Experience`,
    description: t("sponsorMeta", { name }),
  };
}

export default async function SponsorDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getTranslations("PublicUi");
  const name = slug.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

  return (
    <div className="flex flex-col min-h-screen pt-24 pb-24">
      <div className="container max-w-4xl">
        <Link href="/sponsors" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground mb-12 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {t("sponsorsBack")}
        </Link>

        {/* Sponsor Header */}
        <div className="bg-secondary/30 rounded-[3rem] p-8 md:p-16 border border-border/40 flex flex-col items-center text-center mb-16 shadow-apple">
          <div className="w-32 h-32 md:w-40 md:h-40 bg-background rounded-3xl mb-8 flex items-center justify-center font-bold text-2xl text-muted-foreground shadow-sm">
            LOGO
          </div>
          <p className="text-[13px] font-bold text-[#c9a84c] uppercase tracking-widest mb-3">{t("sponsorOfficial")}</p>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tighter text-foreground mb-6">{name}</h1>
          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
            {t("sponsorIntro", { name })}
          </p>

          <div className="flex items-center gap-4 mt-8">
            <a href="#" className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-muted-foreground hover:text-foreground hover:shadow-sm transition-all border border-border/50">
              <Globe className="w-4 h-4" />
            </a>
            <a href="#" className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-muted-foreground hover:text-foreground hover:shadow-sm transition-all border border-border/50">
              <Mail className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Sponsor Content (Mock) */}
        <div className="prose prose-lg dark:prose-invert max-w-none px-4 md:px-8">
          <h2>{t("partnership")}</h2>
          <p>
            {t("sponsorBody", { name })}
          </p>
          <p>
            {t("sponsorExplore", { name })}
          </p>
        </div>
      </div>
    </div>
  );
}
