import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddToCartForm } from "./add-to-cart-form";
import { Link } from "@/i18n/routing";
import { ChevronRight } from "lucide-react";
import { ProductGallery } from "./product-gallery";

import { getLocale } from "next-intl/server";
import { getLocalizedText } from "@/lib/i18n-utils";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ slug: string, locale: string }> }): Promise<Metadata> {
  const { slug, locale } = await params;
  const supabase = await createClient();

  const { data: prodotto } = await supabase
    .from("products")
    .select("nome, descrizione_breve, copertina_url")
    .eq("slug", slug)
    .single();

  if (!prodotto) {
    return { title: "Prodotto non trovato" };
  }

  const title = getLocalizedText(prodotto.nome, locale);
  const description = getLocalizedText(prodotto.descrizione_breve, locale) || title;
  const image = prodotto.copertina_url;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(image && {
        images: [
          {
            url: image,
            width: 1200,
            height: 630,
            alt: title,
          },
        ],
      }),
    },
  };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string, locale: string }> }) {
  const { slug, locale } = await params;
  const supabase = await createClient();

  const { data: prodotto } = await supabase
    .from("products")
    .select("*, product_variants(*)")
    .eq("slug", slug)
    .eq("in_vendita", true)
    .single();

  if (!prodotto) {
    notFound();
  }

  const varianti = prodotto.product_variants || [];
  const activeVariants = varianti.filter((v: any) => v.attivo);

  // Combine images
  const images: string[] = [];
  if (prodotto.copertina_url) images.push(prodotto.copertina_url);
  if (prodotto.immagini_urls && prodotto.immagini_urls.length > 0) {
    prodotto.immagini_urls.forEach((url: string) => {
      if (!images.includes(url)) images.push(url);
    });
  }
  
  if (activeVariants && activeVariants.length > 0) {
    activeVariants.forEach((v: any) => {
      if (v.immagini_urls && v.immagini_urls.length > 0) {
        v.immagini_urls.forEach((url: string) => {
          if (!images.includes(url)) images.push(url);
        });
      }
    });
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background pb-24 pt-32 md:pt-40">
      <div className="container max-w-[1400px] mx-auto px-4 md:px-6">
        
        {/* Breadcrumbs */}
        <nav className="flex items-center space-x-2 text-sm text-muted-foreground mb-8">
          <Link href="/shop" className="hover:text-foreground transition-colors">Shop</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="capitalize">{prodotto.categoria}</span>
          {prodotto.sottocategoria && (
            <>
              <ChevronRight className="w-4 h-4" />
              <span className="capitalize">{prodotto.sottocategoria}</span>
            </>
          )}
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
          
          {/* Left Column: Image Gallery Slider */}
          <div className="lg:col-span-6 xl:col-span-5 flex flex-col gap-4 md:gap-6">
            <ProductGallery images={images} nome={getLocalizedText(prodotto.nome, locale)} />
          </div>

          {/* Right Column: Info & Buy (Sticky) */}
          <div className="lg:col-span-6 xl:col-span-6 xl:col-start-7 sticky top-32 flex flex-col">
            <div className="mb-6">
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 mb-3 leading-tight">
                {getLocalizedText(prodotto.nome, locale)}
              </h1>
              <div className="text-2xl md:text-3xl font-bold text-indigo-600 dark:text-indigo-400 tracking-tight">
                €{(prodotto.prezzo_base_cents / 100).toFixed(2).replace('.', ',')}
              </div>
            </div>
            
            {prodotto.descrizione_breve && (
              <p className="text-lg text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
                {getLocalizedText(prodotto.descrizione_breve, locale)}
              </p>
            )}

            <div className="bg-white dark:bg-card rounded-[2rem] p-6 md:p-8 shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-100 dark:border-border/50 mb-10">
              <AddToCartForm 
                prodottoId={prodotto.id} 
                varianti={activeVariants} 
                prezzoBase={prodotto.prezzo_base_cents} 
              />
            </div>

            {prodotto.descrizione_lunga && (
              <div className="prose prose-slate dark:prose-invert prose-lg max-w-none prose-p:leading-relaxed prose-headings:font-bold">
                <h3 className="text-xl">Dettagli del prodotto</h3>
                <div className="whitespace-pre-line text-slate-600 dark:text-slate-400 text-base">
                  {getLocalizedText(prodotto.descrizione_lunga, locale).split('\n').map((par, i) => <p key={i}>{par}</p>)}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
