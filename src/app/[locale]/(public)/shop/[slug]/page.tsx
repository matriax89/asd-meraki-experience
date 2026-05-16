import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddToCartForm } from "./add-to-cart-form";

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

  // Organize variants (e.g., by size and color if applicable)
  // For simplicity, we just pass the list to the client component to handle the UI

  return (
    <div className="container py-12 md:py-24">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16">
        
        {/* Images */}
        <div className="space-y-4">
          <div className="aspect-[4/5] bg-muted rounded-xl overflow-hidden relative">
            {prodotto.copertina_url ? (
              <img 
                src={prodotto.copertina_url} 
                alt={prodotto.nome} 
                className="object-cover w-full h-full" 
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-tr from-secondary to-muted" />
            )}
          </div>
          {prodotto.immagini_urls && prodotto.immagini_urls.length > 0 && (
            <div className="grid grid-cols-4 gap-4">
              {prodotto.immagini_urls.map((url: string, idx: number) => (
                <div key={idx} className="aspect-square bg-muted rounded-md overflow-hidden">
                  <img src={url} alt={`${prodotto.nome} - ${idx}`} className="object-cover w-full h-full" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col">
          <div className="text-sm text-muted-foreground mb-2 uppercase tracking-wider font-semibold">
            {prodotto.categoria} {prodotto.sottocategoria && `· ${prodotto.sottocategoria}`}
          </div>
          
          <h1 className="text-3xl md:text-4xl font-heading font-bold text-foreground mb-4">
            {prodotto.nome}
          </h1>
          
          <div className="text-2xl font-bold text-foreground mb-6 pb-6 border-b border-border">
            €{(prodotto.prezzo_base_cents / 100).toFixed(2).replace('.', ',')}
          </div>
          
          {prodotto.descrizione_breve && (
            <p className="text-lg text-muted-foreground mb-8">
              {prodotto.descrizione_breve}
            </p>
          )}

          <AddToCartForm 
            prodottoId={prodotto.id} 
            varianti={activeVariants} 
            prezzoBase={prodotto.prezzo_base_cents} 
          />

          {prodotto.descrizione_lunga && (
            <div className="mt-12 pt-12 border-t border-border prose prose-neutral dark:prose-invert max-w-none">
              <h3>Descrizione del prodotto</h3>
              <p>{prodotto.descrizione_lunga}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
