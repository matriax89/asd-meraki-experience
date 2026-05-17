"use client";

import { useTransition } from "react";
import { updateCartItemQuantity, removeFromCart } from "@/lib/shop/cart-actions";
import { useRouter } from "next/navigation";
import { Trash2, Minus, Plus } from "lucide-react";

export function CartItemsList({ initialItems }: { initialItems: any[] }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleUpdate = (variantId: string, newQuantity: number) => {
    startTransition(async () => {
      await updateCartItemQuantity(variantId, newQuantity);
      router.refresh();
    });
  };

  const handleRemove = (variantId: string) => {
    startTransition(async () => {
      await removeFromCart(variantId);
      router.refresh();
    });
  };

  return (
    <div className={`space-y-6 ${isPending ? 'opacity-50 pointer-events-none' : ''} transition-opacity duration-300`}>
      {initialItems.map((item) => (
        <div key={item.variantId} className="flex gap-5 md:gap-6 p-4 md:p-5 bg-white border border-slate-100 rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] group">
          <div className="w-24 h-24 md:w-32 md:h-32 bg-slate-50 rounded-2xl overflow-hidden flex-shrink-0 border border-slate-100 flex items-center justify-center p-2">
            {item.variant?.immagini_urls && item.variant.immagini_urls.length > 0 ? (
              <img src={item.variant.immagini_urls[0]} alt={item.product.nome} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            ) : item.product.copertina_url ? (
              <img src={item.product.copertina_url} alt={item.product.nome} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            ) : (
              <img src="/images/logo-meraki.png" alt="Meraki" className="w-1/2 h-1/2 object-contain opacity-50 grayscale" />
            )}
          </div>
          
          <div className="flex-1 flex flex-col justify-between py-1">
            <div className="flex justify-between items-start">
              <div className="pr-4">
                <h3 className="font-bold text-lg text-slate-800 line-clamp-2 leading-tight">{item.product.nome}</h3>
                <p className="text-sm font-medium text-slate-500 mt-1.5 uppercase tracking-wider text-[11px]">
                  {item.variant.taglia && item.variant.colore 
                    ? `${item.variant.taglia} / ${item.variant.colore}`
                    : item.variant.taglia || item.variant.colore || "UNICA"}
                </p>
              </div>
              <div className="font-extrabold text-slate-900 text-lg whitespace-nowrap">
                €{((item.price * item.quantity) / 100).toFixed(2)}
              </div>
            </div>
            
            <div className="flex items-center justify-between mt-4 md:mt-0">
              <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 p-1">
                <button 
                  onClick={() => handleUpdate(item.variantId, item.quantity - 1)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white hover:shadow-sm text-slate-600 transition-all"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-10 text-center text-sm font-bold text-slate-800">{item.quantity}</span>
                <button 
                  onClick={() => handleUpdate(item.variantId, item.quantity + 1)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white hover:shadow-sm text-slate-600 transition-all"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              
              <button 
                onClick={() => handleRemove(item.variantId)}
                className="text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors p-2.5 rounded-xl"
                title="Rimuovi dal carrello"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
