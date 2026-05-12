"use client";

import { useTransition } from "react";
import { addToCart } from "@/lib/shop/cart-actions";
import { Link, useRouter } from "@/i18n/routing";

type ProductCardProps = {
  id: string;
  slug: string;
  nome: string;
  categoria: string;
  sottocategoria?: string | null;
  copertina_url?: string | null;
  prezzo_base_cents: number;
  in_evidenza?: boolean | null;
  descrizione_breve?: string | null;
  product_variants?: { id: string; taglia?: string | null; colore?: string | null; stock: number }[] | null;
};

export function ProductCard({
  id,
  slug,
  nome,
  categoria,
  sottocategoria,
  copertina_url,
  prezzo_base_cents,
  in_evidenza,
  descrizione_breve,
  product_variants,
}: ProductCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleAddToCart = (e: React.MouseEvent, variantId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Se non ha varianti o non passiamo variantId, potremmo dover andare alla pagina prodotto 
    // se ci sono opzioni multiple che non sappiamo, oppure aggiungere direttamente l'unica variante.
    // Per ora, se c'è un variantId lo aggiungiamo direttamente:
    if (variantId) {
      startTransition(async () => {
        await addToCart(variantId, 1);
        router.push("/carrello");
      });
      return;
    }

    // Se l'utente clicca "Acquista" generico su un prodotto senza taglie, andiamo alla pagina prodotto 
    // per sicurezza (così può vedere i dettagli), oppure aggiungiamo la prima variante se ce n'è solo una.
    if (product_variants && product_variants.length === 1) {
      startTransition(async () => {
        await addToCart(product_variants[0].id, 1);
        router.push("/carrello");
      });
    } else {
      router.push(`/shop/${slug}`);
    }
  };

  return (
    <div className="group relative flex flex-col h-full rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.08)] overflow-hidden transition-all duration-300 hover:shadow-[0_20px_40px_rgb(0,0,0,0.12)] hover:-translate-y-1 bg-gradient-to-br from-indigo-500/80 to-purple-600/80">
      
      {/* Background Image that sits behind the white card */}
      <div className="absolute top-0 left-0 w-full h-[60%]">
        {copertina_url && (
          <img 
            src={copertina_url} 
            alt={nome} 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out" 
          />
        )}
      </div>

      {/* Top Spacer for the Image Area */}
      <Link href={`/shop/${slug}`} className="block h-56 md:h-64 shrink-0 relative z-10">
        {/* Optional Bestseller Badge */}
        {in_evidenza && (
          <div className="absolute top-4 left-4 z-20 bg-white/90 backdrop-blur-md text-slate-800 text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest shadow-sm">
            Bestseller
          </div>
        )}
      </Link>
      
      {/* Content Section overlapping with rounded top corners */}
      <div className="relative z-20 flex flex-col flex-1 p-6 md:p-7 bg-white rounded-t-[24px] mt-auto">
        {/* Title */}
        <Link href={`/shop/${slug}`}>
          <h3 className="font-bold text-[22px] text-slate-800 mb-3 leading-tight group-hover:text-indigo-600 transition-colors">
            {nome}
          </h3>
        </Link>
        
        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="border border-slate-300 text-slate-600 text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-[4px]">
            {categoria}
          </span>
          {sottocategoria && (
            <span className="border border-slate-300 text-slate-600 text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-[4px]">
              {sottocategoria}
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-slate-500 text-[15px] leading-relaxed mb-6 line-clamp-3">
          {descrizione_breve || "Scopri l'esclusivo merchandising Meraki Experience. Design confortevole, stile inconfondibile e performance al top."}
        </p>
        
          {/* Footer: Price & Add to Cart */}
        <div className="mt-auto flex items-end justify-between pt-2">
          <div className="shrink-0 mr-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
              Prezzo
            </span>
            <span className="text-2xl font-extrabold text-slate-800 tracking-tight">
              €{(prezzo_base_cents / 100).toFixed(2)}
            </span>
          </div>
          
          <div className="flex-1 flex justify-end">
            {product_variants && product_variants.some(v => v.taglia) ? (
              <div className="grid w-full justify-end">
                {/* Default Button (Taglie) */}
                <div className="col-start-1 row-start-1 flex justify-end items-center transition-all duration-300 group-hover:opacity-0 group-hover:invisible">
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      router.push(`/shop/${slug}`);
                    }}
                    className="bg-foreground text-background font-semibold text-sm px-6 py-3 rounded-xl shadow-md whitespace-nowrap"
                  >
                    Taglie
                  </button>
                </div>
                
                {/* Hover Size Bubbles */}
                <div className="col-start-1 row-start-1 flex flex-nowrap gap-1.5 justify-end items-center opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 translate-x-4 group-hover:translate-x-0 w-max">
                  {product_variants.filter(v => v.taglia).map(v => (
                    <button 
                      key={v.id} 
                      disabled={v.stock <= 0 || isPending}
                      className="w-[38px] h-[38px] shrink-0 rounded-full border border-slate-200 text-slate-800 text-[12px] font-bold flex items-center justify-center hover:border-foreground hover:text-foreground disabled:opacity-30 disabled:hover:border-slate-200 bg-white shadow-sm transition-colors"
                      onClick={(e) => handleAddToCart(e, v.id)}
                    >
                      {v.taglia}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button 
                onClick={(e) => handleAddToCart(e)}
                disabled={isPending}
                className="bg-foreground hover:bg-foreground/80 text-background font-semibold text-sm px-6 py-3 rounded-xl shadow-md transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {isPending ? "Attendi..." : "Acquista"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
