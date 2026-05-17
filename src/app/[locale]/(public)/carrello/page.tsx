import { getCart } from "@/lib/shop/cart-actions";
import { createClient } from "@/lib/supabase/server";
import { Link } from "@/i18n/routing";
import { CartItemsList } from "./cart-items-list";
import { CartSummaryClient } from "./cart-summary-client";
import { CrossSellSection } from "./cross-sell-section";

export default async function CarrelloPage() {
  const cart = await getCart();
  const supabase = await createClient();

  // Fetch full details of items in cart
  const variantIds = cart.items.map((i) => i.variantId);
  
  let cartDetails: any[] = [];
  let subtotal = 0;

  if (variantIds.length > 0) {
    let { data: varianti } = await supabase
      .from("product_variants")
      .select("*, product:products(*)")
      .in("id", variantIds);



    if (varianti) {
      cartDetails = cart.items.map((cartItem) => {
        const dbVariant = varianti!.find((v) => v.id === cartItem.variantId);
        if (!dbVariant) return null;
        
        const price = dbVariant.prezzo_cents || dbVariant.product?.prezzo_base_cents || 0;
        subtotal += price * cartItem.quantity;

        return {
          ...cartItem,
          variant: dbVariant,
          product: dbVariant.product,
          price,
        };
      }).filter(Boolean);
    }
  }

  // Fetch real cross sell variants (up to 10 to filter from)
  const { data: allVariants } = await supabase
    .from("product_variants")
    .select("*, product:products(*)")
    .limit(10);
    
  const crossSellItems = (allVariants || [])
    .filter(v => !variantIds.includes(v.id) && (v.product as any)?.status === "published")
    .slice(0, 2)
    .map(v => ({
      id: v.id,
      variantId: v.id,
      nome: v.product?.nome || "Prodotto",
      categoria: "CONSIGLIATO",
      prezzo_base_cents: v.prezzo_cents || v.product?.prezzo_base_cents || 0,
      copertina_url: v.product?.copertina_url || "/images/placeholder.png"
    }));

  return (
    <div className="container py-12 md:py-24 max-w-6xl">
      <h1 className="text-4xl font-extrabold text-slate-900 mb-8 tracking-tight">
        Il tuo Carrello
      </h1>

      {cartDetails.length === 0 ? (
        <div className="text-center py-20 bg-white border border-slate-100 shadow-sm rounded-3xl">
          <p className="text-slate-500 mb-8 text-lg font-medium">Il tuo carrello è vuoto.</p>
          <Link href="/shop" className="inline-flex items-center justify-center bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-xl font-bold transition-all shadow-md hover:shadow-lg">
            Torna allo Shop
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Main Content Column */}
          <div className="lg:col-span-7 xl:col-span-8">
            <CartItemsList initialItems={cartDetails} />
            {crossSellItems.length > 0 && <CrossSellSection items={crossSellItems} />}
          </div>
          
          {/* Sidebar Summary Column */}
          <div className="lg:col-span-5 xl:col-span-4">
            <CartSummaryClient 
              subtotalCents={subtotal} 
              cartItems={cartDetails.map(i => ({ 
                variantId: i.variantId, 
                quantity: i.quantity, 
                priceCents: i.price, 
                productId: i.product?.id || i.product?.slug 
              }))} 
            />
          </div>
        </div>
      )}
    </div>
  );
}
