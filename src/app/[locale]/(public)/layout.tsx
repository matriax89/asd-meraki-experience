import { Header } from "@/components/public/header";
import { Footer } from "@/components/public/footer";
import { CookieBanner } from "@/components/public/cookie-banner";
import { GlobalPopup } from "@/components/public/global-popup";
import { createClient } from "@/lib/supabase/server";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch popup settings
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "homepage_content")
    .single();
    
  const popupData = (settings?.value as any)?.popup || null;
  // Suppress saved promotions that still point to the retired storefront.
  const popupTargetsRemovedShop = /^(?:https?:\/\/(?:www\.)?merakiexperience\.org)?\/(?:(?:it|en|de)\/)?(?:shop|carrello)(?:[/?#]|$)/i.test(popupData?.link_bottone || "");
  const brandingData = (settings?.value as any)?.branding || null;
  const contactsData = (settings?.value as any)?.contacts || null;
  const footerData = (settings?.value as any)?.footer_text || null;
  const locations = (settings?.value as any)?.locations || ["Bolzano", "Appiano", "Altro"];

  return (
    <>
      <Header logoUrl={brandingData?.logo_url} logoWhiteUrl={brandingData?.logo_white_url} />
      {children}
      <Footer logoUrl={brandingData?.logo_url} locations={locations} branding={brandingData} contacts={contactsData} footerData={footerData} />
      <CookieBanner />
      <GlobalPopup data={popupTargetsRemovedShop ? null : popupData} />
    </>
  );
}
