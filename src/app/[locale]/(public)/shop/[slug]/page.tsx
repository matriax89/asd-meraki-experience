import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddToCartForm } from "./add-to-cart-form";
import { Link } from "@/i18n/routing";
import { ChevronRight } from "lucide-react";

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
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
          
          {/* Left Column: Images (Stack on desktop, swipe on mobile natively with CSS snap if we wanted, but stack is fine for high-end look) */}
          <div className="lg:col-span-7 flex flex-col gap-4 md:gap-6">
            {images.length > 0 ? (
              images.map((url, idx) => (
                <div key={idx} className="aspect-[4/5] bg-muted/30 rounded-[2rem] overflow-hidden relative border border-border/50 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={url} 
                    alt={`${prodotto.nome} - Vista ${idx + 1}`} 
                    className="object-cover w-full h-full hover:scale-105 transition-transform duration-700 ease-out" 
                  />
                </div>
              ))
            ) : (
              <div className="aspect-[4/5] bg-gradient-to-tr from-secondary to-muted rounded-[2rem] relative border border-border/50" />
            )}
          </div>

          {/* Right Column: Info & Buy (Sticky) */}
          <div className="lg:col-span-5 sticky top-32 flex flex-col">
            <div className="mb-6">
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 mb-3 leading-tight">
                {prodotto.nome}
              </h1>
              <div className="text-2xl md:text-3xl font-bold text-indigo-600 dark:text-indigo-400 tracking-tight">
                €{(prodotto.prezzo_base_cents / 100).toFixed(2).replace('.', ',')}
              </div>
            </div>
            
            {prodotto.descrizione_breve && (
              <p className="text-lg text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
                {prodotto.descrizione_breve}
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
                  {prodotto.descrizione_lunga}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
