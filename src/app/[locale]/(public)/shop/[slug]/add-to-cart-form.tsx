"use client";

import { useState, useTransition } from "react";
import { addToCart } from "@/lib/shop/cart-actions";
import { useRouter } from "next/navigation";

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
  
  // Per prodotti con una sola variante fittizia (es. borraccia senza taglia/colore)
  const isSimpleProduct = varianti.length === 1 && !varianti[0].taglia && !varianti[0].colore;

  const handleAddToCart = () => {
    if (!selectedVariantId) return;
    
    startTransition(async () => {
      await addToCart(selectedVariantId, 1);
      // Optional: mostra un toast o apri il drawer del carrello
      // Per semplicità, in questa fase mandiamo alla pagina carrello
      router.push("/carrello");
    });
  };

  return (
    <div className="space-y-6">
      {!isSimpleProduct && varianti.length > 0 && (
        <div className="space-y-4">
          <label className="block text-sm font-medium text-foreground">
            Seleziona Opzione
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {varianti.map((variant) => {
              const isSelected = variant.id === selectedVariantId;
              const isOOS = variant.stock <= 0;
              return (
                <button
                  key={variant.id}
                  onClick={() => setSelectedVariantId(variant.id)}
                  disabled={isOOS}
                  className={`
                    border rounded-lg p-3 text-sm flex flex-col items-center justify-center transition-all
                    ${isSelected ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary' : 'border-border hover:border-foreground/50 text-foreground'}
                    ${isOOS ? 'opacity-50 cursor-not-allowed bg-muted' : 'cursor-pointer'}
                  `}
                >
                  <span className="font-semibold">
                    {variant.taglia && variant.colore 
                      ? `${variant.taglia} - ${variant.colore}`
                      : variant.taglia || variant.colore || variant.sku}
                  </span>
                  {isOOS && <span className="text-[10px] uppercase mt-1">Esaurito</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedVariant && selectedVariant.prezzo_cents && selectedVariant.prezzo_cents !== prezzoBase && (
        <div className="text-xl font-bold text-primary">
          Prezzo variante: €{(selectedVariant.prezzo_cents / 100).toFixed(2)}
        </div>
      )}

      <button
        onClick={handleAddToCart}
        disabled={!selectedVariantId || outOfStock || isPending}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-4 px-6 rounded-lg transition-colors disabled:opacity-50 flex justify-center items-center"
      >
        {isPending ? (
          <span className="animate-pulse">Aggiunta in corso...</span>
        ) : outOfStock ? (
          "Esaurito"
        ) : (
          "Aggiungi al Carrello"
        )}
      </button>
    </div>
  );
}
