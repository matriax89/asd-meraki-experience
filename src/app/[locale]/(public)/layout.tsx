import { getLocale } from "next-intl/server";
import { PublicSurface } from "@/components/meraki/public-surface";
import { Header } from "@/components/public/header";
import { Footer } from "@/components/public/footer";
import { CookieBanner } from "@/components/public/cookie-banner";
import { GlobalPopup } from "@/components/public/global-popup";
import { createClient } from "@/lib/supabase/server";

type HomepageSettings = {
  popup?: React.ComponentProps<typeof GlobalPopup>["data"];
  branding?: { logo_url?: string; logo_white_url?: string };
  contacts?: React.ComponentProps<typeof Footer>["contacts"];
  footer_text?: React.ComponentProps<typeof Footer>["footerData"];
  locations?: string[];
};

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch popup settings
  const locale = await getLocale();
  const supabase = await createClient();
  const { data: settings } = await supabase.from("site_settings").select("value").eq("key", "homepage_content").single();
  const homepageContent = settings?.value as HomepageSettings | undefined;
    
  const popupData = homepageContent?.popup || null;
  // Suppress saved promotions that still point to the retired storefront.
  const popupTargetsRemovedShop = /^(?:https?:\/\/(?:www\.)?merakiexperience\.org)?\/(?:(?:it|en|de)\/)?(?:shop|carrello)(?:[/?#]|$)/i.test(popupData?.link_bottone || "");
  const brandingData = homepageContent?.branding || null;
  const contactsData = homepageContent?.contacts || null;
  const footerData = homepageContent?.footer_text || null;
  const locations = homepageContent?.locations || ["Bolzano", "Appiano", "Altro"];

  return (
    <>
      <PublicSurface
        locale={locale}
        logoUrl={brandingData?.logo_url}
        header={<Header logoUrl={brandingData?.logo_url} logoWhiteUrl={brandingData?.logo_white_url} appearance="solid" />}
        footer={<Footer logoUrl={brandingData?.logo_url} locations={locations} branding={brandingData} contacts={contactsData} footerData={footerData} />}
        popup={<GlobalPopup data={popupTargetsRemovedShop ? null : popupData} />}
      >
        {children}
      </PublicSurface>
      <CookieBanner />
    </>
  );
}
