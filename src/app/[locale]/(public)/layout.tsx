import { Header } from "@/components/public/header";
import { Footer } from "@/components/public/footer";
import { CookieBanner } from "@/components/public/cookie-banner";
import { GlobalPopup } from "@/components/public/global-popup";
import { getCart } from "@/lib/shop/cart-actions";
import { createClient } from "@/lib/supabase/server";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get initial cart count
  const cart = await getCart();
  const initialCartCount = cart.items.reduce((acc, item) => acc + item.quantity, 0);

  // Fetch popup settings
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "homepage_content")
    .single();
    
  const popupData = (settings?.value as any)?.popup || null;
  const brandingData = (settings?.value as any)?.branding || null;

  return (
    <>
      <Header initialCartCount={initialCartCount} logoUrl={brandingData?.logo_url} />
      {children}
      <Footer logoUrl={brandingData?.logo_url} />
      <CookieBanner />
      <GlobalPopup data={popupData} />
    </>
  );
}
