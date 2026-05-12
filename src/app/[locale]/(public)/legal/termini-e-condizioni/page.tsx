import { LegalLayout } from "@/components/public/legal-layout";
import { getTranslations } from "next-intl/server";

export default async function TerminiECondizioniPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Legal.terms" });

  return (
    <LegalLayout title={t("title")} lastUpdated={t("updated")}>
      <p className="lead text-xl text-slate-500 font-medium">{t("lead")}</p>
      
      <h2>{t("sec1_title")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("sec1_desc") }} />

      <h2>{t("sec2_title")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("sec2_desc") }} />

      <h2>{t("sec3_title")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("sec3_desc") }} />

      <h2>{t("sec4_title")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("sec4_desc") }} />

      <h2>{t("sec5_title")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("sec5_desc") }} />
    </LegalLayout>
  );
}
