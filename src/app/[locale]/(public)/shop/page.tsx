import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { FadeIn } from "@/components/ui/fade-in";
import { ShopClient } from "@/components/public/shop-client";

import { routing } from "@/i18n/routing";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  let { locale } = await params;
  if (!routing.locales.includes(locale as any)) locale = routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: "ShopPage" });
  return { title: `${t("title")} · Meraki Experience` };
}

export default async function ShopPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ShopPage" });
  const supabase = await createClient();
  const { data: prodotti } = await supabase
    .from("products")
    .select("*, product_variants(*)")
    .eq("in_vendita", true)
    .order("ordine_display", { ascending: true })
    .order("created_at", { ascending: false });

  let displayProdotti = prodotti;
  
  if (!displayProdotti || displayProdotti.length === 0) {
    const mockVariantsAbbigliamento = [
      { id: "v1", taglia: "S", stock: 5 },
      { id: "v2", taglia: "M", stock: 10 },
      { id: "v3", taglia: "L", stock: 3 },
      { id: "v4", taglia: "XL", stock: 0 }
    ];

    displayProdotti = [
      { id: "mock-1", slug: "t-shirt-basic", nome: "T-Shirt Ufficiale Meraki", categoria: "abbigliamento", sottocategoria: "Unisex", copertina_url: "/images/v2/yoga_moody.png", prezzo_base_cents: 2900, in_evidenza: true, product_variants: mockVariantsAbbigliamento },
      { id: "mock-2", slug: "tappetino-yoga", nome: "Tappetino Premium Eco-Friendly", categoria: "accessori", sottocategoria: "Yoga", copertina_url: "/images/v2/salsation_glow.png", prezzo_base_cents: 4500, in_evidenza: false, product_variants: [] },
      { id: "mock-3", slug: "borraccia-termica", nome: "Borraccia Termica 500ml", categoria: "accessori", sottocategoria: "Lifestyle", copertina_url: "/images/v2/aerial_glow.png", prezzo_base_cents: 1900, in_evidenza: true, product_variants: [] },
      { id: "mock-4", slug: "felpa-hoodie", nome: "Felpa Hoodie Meraki", categoria: "abbigliamento", sottocategoria: "Unisex", copertina_url: "/images/v2/hero_dark.png", prezzo_base_cents: 5500, in_evidenza: false, product_variants: mockVariantsAbbigliamento },
    ] as any[];
  }

  return (
    <div className="pt-32 pb-24 md:pt-40 md:pb-32 bg-background min-h-screen">
      <div className="container max-w-7xl mx-auto px-4 md:px-6">
        <FadeIn className="mb-8 md:mb-12 text-center max-w-2xl mx-auto">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">{t("badge")}</p>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight mb-6">{t("headline")}</h1>
          <p className="text-[17px] text-muted-foreground/90">
            {t("subheadline")}
          </p>
        </FadeIn>

        {/* Client Component handles Sidebar & Grid */}
        <ShopClient prodotti={displayProdotti} />
      </div>
    </div>
  );
}
