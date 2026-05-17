"use client";

import { useTransition, useState } from "react";
import { addToCart } from "@/lib/shop/cart-actions";
import { useRouter } from "@/i18n/routing";
import { Plus, Loader2 } from "lucide-react";

export type CrossSellItem = {
  id: string;
  variantId: string;
  nome: string;
  categoria: string;
  prezzo_base_cents: number;
  copertina_url: string;
};

export function CrossSellSection({ items }: { items: CrossSellItem[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleAdd = (variantId: string) => {
    setLoadingId(variantId);
    startTransition(async () => {
      await addToCart(variantId, 1);
      setLoadingId(null);
      router.refresh();
    });
  };

  return (
    <div className="mt-12 pt-10 border-t border-slate-100">
      <h3 className="text-xl font-bold text-slate-800 mb-2">Completa il tuo look</h3>
      <p className="text-sm text-slate-500 mb-6">Aggiungi questi prodotti al carrello per completare il tuo acquisto.</p>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {items.map(product => (
          <div key={product.id} className="flex bg-white border border-slate-100 rounded-2xl p-3 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-20 h-20 rounded-xl bg-slate-100 overflow-hidden shrink-0">
              <img src={product.copertina_url} alt={product.nome} className="w-full h-full object-cover" />
            </div>
            
            <div className="ml-4 flex flex-col justify-center flex-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{product.categoria}</span>
              <h4 className="font-bold text-slate-800 text-sm leading-tight mb-1">{product.nome}</h4>
              <span className="font-extrabold text-slate-900 text-sm">€{(product.prezzo_base_cents / 100).toFixed(2)}</span>
            </div>
            
            <div className="flex items-center ml-2">
              <button
                onClick={() => handleAdd(product.variantId)}
                disabled={isPending}
                className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-900 hover:text-white transition-colors disabled:opacity-50"
              >
                {loadingId === product.variantId ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
