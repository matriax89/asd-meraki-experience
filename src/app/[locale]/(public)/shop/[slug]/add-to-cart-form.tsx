"use client";

import { useState, useTransition } from "react";
import { addToCart } from "@/lib/shop/cart-actions";
import { useRouter } from "next/navigation";
import { Check, ShieldCheck, Truck, RefreshCcw, AlertCircle } from "lucide-react";

type Variant = {
  id: string;
  sku: string;
  taglia?: string | null;
  colore?: string | null;
  prezzo_cents?: number | null;
  stock: number;
};

export function AddToCartForm({
  prodottoId,
  varianti,
  prezzoBase,
}: {
  prodottoId: string;
  varianti: Variant[];
  prezzoBase: number;
}) {
  const [selectedVariantId, setSelectedVariantId] = useState<string>(varianti.length === 1 ? varianti[0].id : "");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const selectedVariant = varianti.find((v) => v.id === selectedVariantId);
  const outOfStock = selectedVariant && selectedVariant.stock <= 0;
  
  const isSimpleProduct = varianti.length === 1 && !varianti[0].taglia && !varianti[0].colore;

  const handleAddToCart = () => {
    if (!selectedVariantId) return;
    
    startTransition(async () => {
      await addToCart(selectedVariantId, 1);
      router.push("/carrello");
    });
  };

  return (
    <div className="flex flex-col">
      {!isSimpleProduct && varianti.length > 0 && (
        <div className="space-y-4 mb-8">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold tracking-wider uppercase text-slate-500 dark:text-slate-400">
              Seleziona Opzione
            </span>
            {!selectedVariantId && (
              <span className="text-xs font-bold text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Richiesto
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            {varianti.map((variant) => {
              const isSelected = variant.id === selectedVariantId;
              const isOOS = variant.stock <= 0;
              const isLowStock = !isOOS && variant.stock > 0 && variant.stock <= 5;
              
              return (
                <button
                  key={variant.id}
                  onClick={() => setSelectedVariantId(variant.id)}
                  disabled={isOOS}
                  className={`
                    relative rounded-2xl p-4 text-left border-2 transition-all overflow-hidden flex flex-col items-start justify-center w-full
                    ${isSelected ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/20 shadow-sm' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-card'}
                    ${isOOS ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  <span className={`font-bold text-[17px] ${isSelected ? 'text-indigo-900 dark:text-indigo-300' : 'text-slate-800 dark:text-slate-200'}`}>
                    {variant.taglia && variant.colore 
                      ? `${variant.taglia} - ${variant.colore}`
                      : variant.taglia || variant.colore || variant.sku}
                  </span>
                  
                  {isSelected && (
                    <div className="absolute top-4 right-4 text-indigo-600 dark:text-indigo-400">
                      <Check className="w-5 h-5 stroke-[3]" />
                    </div>
                  )}
                  
                  {isOOS && <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest mt-1">Esaurito</span>}
                  {isLowStock && (
                    <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-widest mt-1">
                      Solo {variant.stock} rimasti
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedVariant && selectedVariant.prezzo_cents && selectedVariant.prezzo_cents !== prezzoBase && (
        <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mb-6 flex items-center gap-2">
          Prezzo Variante: €{(selectedVariant.prezzo_cents / 100).toFixed(2).replace('.', ',')}
        </div>
      )}

      <button
        onClick={handleAddToCart}
        disabled={!selectedVariantId || outOfStock || isPending}
        className={`
          w-full font-bold text-[17px] py-5 px-6 rounded-2xl flex justify-center items-center transition-all duration-300
          ${!selectedVariantId || outOfStock || isPending 
            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 shadow-none' 
            : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-slate-900/10 dark:shadow-white/10'
          }
        `}
      >
        {isPending ? (
          <span className="animate-pulse">Attendi...</span>
        ) : outOfStock ? (
          "Prodotto Esaurito"
        ) : (
          "Aggiungi al Carrello"
        )}
      </button>

      {/* Trust Badges */}
      <div className="flex flex-col gap-4 mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center text-[13px] font-medium text-slate-500 dark:text-slate-400 gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
            <Truck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <span>Spedizione rapida in tutta Italia</span>
        </div>
        <div className="flex items-center text-[13px] font-medium text-slate-500 dark:text-slate-400 gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span>Pagamenti 100% sicuri e crittografati</span>
        </div>
        <div className="flex items-center text-[13px] font-medium text-slate-500 dark:text-slate-400 gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
            <RefreshCcw className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <span>Reso facile entro 14 giorni dalla consegna</span>
        </div>
      </div>
    </div>
  );
}
