"use client";

import { LegalLayout } from "@/components/public/legal-layout";
import { Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";

export default function CookiePolicyPage() {
  const t = useTranslations("Legal.cookie");

  const openCookieSettings = () => {
    localStorage.removeItem("meraki_cookie_consent");
    window.location.reload();
  };

  return (
    <LegalLayout title={t("title")} lastUpdated={t("updated")}>
      <p className="lead text-xl text-slate-500 font-medium">{t("lead")}</p>
      
      <h2>{t("sec1_title")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("sec1_desc") }} />

      <h2>{t("sec2_title")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("sec2_desc") }} />
      <ul>
        <li dangerouslySetInnerHTML={{ __html: t("sec2_li1") }} />
        <li dangerouslySetInnerHTML={{ __html: t("sec2_li2") }} />
        <li dangerouslySetInnerHTML={{ __html: t("sec2_li3") }} />
      </ul>

      <h2>{t("sec3_title")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("sec3_desc") }} />
      
      <div className="mt-8 not-prose">
        <button 
          onClick={openCookieSettings}
          className="inline-flex items-center gap-2 bg-slate-900 text-white font-bold py-3 px-6 rounded-xl hover:bg-slate-800 hover:-translate-y-0.5 transition-all shadow-md"
        >
          <Settings2 className="w-5 h-5" />
          {t("update_btn")}
        </button>
      </div>

      <h2>{t("sec4_title")}</h2>
      <p dangerouslySetInnerHTML={{ __html: t("sec4_desc") }} />
    </LegalLayout>
  );
}
