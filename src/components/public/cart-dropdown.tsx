"use client";

import { useState, useEffect, useTransition } from "react";
import { Link, useRouter } from "@/i18n/routing";
import { ShoppingCart, Trash2, Plus, Minus, ArrowRight, Loader2 } from "lucide-react";
import { getHydratedCart, updateCartItemQuantity, removeFromCart } from "@/lib/shop/cart-actions";
import { AnimatePresence, motion } from "framer-motion";

export function CartDropdown({ initialCount = 0, isTransparentAndHome = false }: { initialCount?: number; isTransparentAndHome?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [cartData, setCartData] = useState<{ items: any[], subtotal: number }>({ items: [], subtotal: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Fetch dei dettagli ogni volta che initialCount cambia (es. quando l'utente aggiunge qualcosa e la pagina fa router.refresh)
  // Oppure la prima volta che apre il dropdown
  useEffect(() => {
    if (initialCount > 0) {
      fetchCartData();
    } else {
      setCartData({ items: [], subtotal: 0 });
    }
  }, [initialCount]);

  const fetchCartData = async () => {
    setIsLoading(true);
    const data = await getHydratedCart();
    setCartData(data);
    setIsLoading(false);
  };

  const handleUpdate = (variantId: string, newQuantity: number) => {
    startTransition(async () => {
      await updateCartItemQuantity(variantId, newQuantity);
      await fetchCartData(); // Ricarica i dati senza fare refresh della pagina
      router.refresh(); // Sincronizza l'header e gli altri componenti
    });
  };

  const handleRemove = (variantId: string) => {
    startTransition(async () => {
      await removeFromCart(variantId);
      await fetchCartData();
      router.refresh();
    });
  };

  return (
    <div 
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <Link href="/carrello" className="relative p-2.5 rounded-full hover:bg-slate-100 hover:text-slate-900 transition-colors block">
        <ShoppingCart className="w-[18px] h-[18px]" />
        {initialCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white px-1 shadow-sm border-[1.5px] border-white">
            {initialCount}
          </span>
        )}
      </Link>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute top-full right-0 mt-2 w-[340px] bg-white rounded-2xl shadow-[0_20px_40px_rgb(0,0,0,0.12)] border border-slate-100 overflow-hidden z-50 origin-top-right cursor-auto"
          >
            {/* Header Mini Cart */}
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800">Il tuo carrello</h3>
              <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
                {initialCount} {initialCount === 1 ? 'articolo' : 'articoli'}
              </span>
            </div>

            {/* Cart Items List */}
            <div className="max-h-[320px] overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-200">
              {isLoading && cartData.items.length === 0 ? (
                <div className="flex justify-center items-center py-12">
                  <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                </div>
              ) : initialCount === 0 ? (
                <div className="text-center py-10 px-4">
                  <p className="text-slate-500 text-sm font-medium">Il tuo carrello è vuoto.</p>
                </div>
              ) : (
                <div className={`flex flex-col gap-1 ${isPending ? 'opacity-60 pointer-events-none' : ''} transition-opacity`}>
                  {cartData.items.map((item) => (
                    <div key={item.variantId} className="flex gap-4 p-3 hover:bg-slate-50 rounded-xl transition-colors group">
                      {/* Image */}
                      <div className="w-16 h-16 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-100 flex items-center justify-center">
                        {item.variant?.immagini_urls && item.variant.immagini_urls.length > 0 ? (
                          <img src={item.variant.immagini_urls[0]} alt={item.product?.nome} className="w-full h-full object-cover" />
                        ) : item.product?.copertina_url ? (
                          <img src={item.product.copertina_url} alt={item.product?.nome} className="w-full h-full object-cover" />
                        ) : (
                          <img src="/images/logo-meraki.png" alt="Meraki" className="w-1/2 h-1/2 object-contain opacity-50 grayscale" />
                        )}
                      </div>
                      
                      {/* Info */}
                      <div className="flex flex-col flex-1 min-w-0">
                        <h4 className="font-bold text-slate-800 text-sm leading-tight truncate">{item.product?.nome}</h4>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                          {item.variant?.taglia || item.variant?.colore || "UNICA"}
                        </span>
                        
                        <div className="flex items-center justify-between mt-auto">
                          <span className="font-bold text-slate-900 text-sm">€{((item.price * item.quantity) / 100).toFixed(2)}</span>
                          
                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <div className="flex items-center bg-white border border-slate-200 rounded-md">
                              <button onClick={() => handleUpdate(item.variantId, item.quantity - 1)} className="px-1.5 py-0.5 text-slate-400 hover:text-slate-700">
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                              <button onClick={() => handleUpdate(item.variantId, item.quantity + 1)} className="px-1.5 py-0.5 text-slate-400 hover:text-slate-700">
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <button onClick={() => handleRemove(item.variantId)} className="text-slate-300 hover:text-red-500 p-1 rounded-md hover:bg-red-50 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer Mini Cart */}
            {initialCount > 0 && (
              <div className="p-5 border-t border-slate-100 bg-white">
                <div className="flex justify-between items-end mb-4">
                  <span className="text-sm font-medium text-slate-500">Totale parziale</span>
                  <span className="text-xl font-extrabold text-slate-900 tracking-tight">€{(cartData.subtotal / 100).toFixed(2)}</span>
                </div>
                <Link 
                  href="/carrello" 
                  onClick={() => setIsOpen(false)}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 group"
                >
                  Vai al carrello
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
