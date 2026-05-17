"use client";

import { useState } from "react";
import { Tag, ArrowRight, Loader2, CheckCircle2, X } from "lucide-react";
import { Link } from "@/i18n/routing";

type CartSummaryClientProps = {
  subtotalCents: number;
  hasCrossSellDiscount?: boolean;
  cartItems: { variantId: string; quantity: number; priceCents: number; productId: string }[];
};

export function CartSummaryClient({ subtotalCents, hasCrossSellDiscount = false, cartItems }: CartSummaryClientProps) {
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; type: "percentage" | "fixed"; value: number; discountAmount: number } | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [couponError, setCouponError] = useState("");

  const subtotal = subtotalCents / 100;
  let total = subtotal;
  let discountAmount = 0;

  // 1. Cross-sell Bundle Discount (e.g., 10% off if a recommended product is in cart)
  let bundleDiscountAmount = 0;
  if (hasCrossSellDiscount) {
    bundleDiscountAmount = subtotal * 0.10; // 10% bundle discount
  }

  // 2. Coupon Discount
  let couponDiscountAmount = 0;
  if (appliedCoupon) {
    couponDiscountAmount = appliedCoupon.discountAmount;
  }

  discountAmount = bundleDiscountAmount + couponDiscountAmount;
  total = Math.max(0, subtotal - discountAmount);

  const handleApplyCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) return;

    setIsApplying(true);
    setCouponError("");

    try {
      const response = await fetch("/api/cart/verify-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          code: couponCode, 
          subtotalCents,
          items: cartItems
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.valid) {
        setCouponError(data.error || "Errore durante la verifica del coupon.");
      } else {
        setAppliedCoupon({
          code: data.coupon.code,
          type: data.coupon.discount_type === "percentage" ? "percentage" : "fixed",
          value: data.coupon.discount_value,
          discountAmount: data.discountCents / 100
        });
        setCouponCode("");
      }
    } catch (error) {
      setCouponError("Errore di connessione. Riprova.");
    } finally {
      setIsApplying(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
  };

  return (
    <div className="bg-white rounded-3xl p-6 md:p-8 sticky top-24 shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-100">
      <h2 className="text-xl font-bold text-slate-800 mb-6">Riepilogo Ordine</h2>
      
      {/* Coupon Section */}
      <div className="mb-8">
        {!appliedCoupon ? (
          <form onSubmit={handleApplyCoupon} className="relative">
            <div className="relative flex items-center">
              <Tag className="absolute left-4 text-slate-400 w-5 h-5" />
              <input 
                type="text" 
                placeholder="Codice sconto" 
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                className="w-full pl-11 pr-24 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 transition-all font-medium placeholder:text-slate-400"
              />
              <button 
                type="submit"
                disabled={isApplying || !couponCode.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {isApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : "Applica"}
              </button>
            </div>
            {couponError && <p className="text-red-500 text-xs font-medium mt-2 ml-1">{couponError}</p>}
          </form>
        ) : (
          <div className="flex items-center justify-between bg-green-50 border border-green-200 p-3.5 rounded-xl">
            <div className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="w-5 h-5" />
              <div className="flex flex-col">
                <span className="text-sm font-bold tracking-wide">{appliedCoupon.code}</span>
                <span className="text-xs font-medium opacity-80">
                  {appliedCoupon.type === "percentage" ? `-${appliedCoupon.value}% applicato` : `-€${appliedCoupon.value.toFixed(2)} applicato`}
                </span>
              </div>
            </div>
            <button 
              onClick={handleRemoveCoupon}
              className="p-1.5 text-green-700 hover:bg-green-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="space-y-4 mb-8">
        <div className="flex justify-between text-slate-500 font-medium">
          <span>Subtotale</span>
          <span>€{subtotal.toFixed(2)}</span>
        </div>
        
        {hasCrossSellDiscount && (
          <div className="flex justify-between text-slate-900 font-bold">
            <span>Sconto Bundle (10%)</span>
            <span>-€{bundleDiscountAmount.toFixed(2)}</span>
          </div>
        )}

        {appliedCoupon && (
          <div className="flex justify-between text-green-600 font-bold">
            <span>Sconto Coupon ({appliedCoupon.code})</span>
            <span>-€{couponDiscountAmount.toFixed(2)}</span>
          </div>
        )}

        <div className="flex justify-between text-slate-500 font-medium">
          <span>Spedizione</span>
          <span>Calcolata al checkout</span>
        </div>
        
        <div className="border-t border-slate-100 pt-4 flex justify-between items-end">
          <div className="flex flex-col">
            <span className="text-sm text-slate-500 font-medium mb-1">Totale parziale</span>
            <span className="text-xs text-slate-400">IVA inclusa</span>
          </div>
          <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
            €{total.toFixed(2)}
          </span>
        </div>
      </div>

      <form action="/api/checkout/shop" method="POST">
        <input type="hidden" name="coupon" value={appliedCoupon?.code || ""} />
        <button 
          type="submit"
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-4 px-6 rounded-xl transition-all hover:shadow-lg flex items-center justify-center gap-2 group"
        >
          Procedi al Checkout
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>
      </form>
    </div>
  );
}
