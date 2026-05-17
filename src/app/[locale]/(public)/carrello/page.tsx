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

    // MOCK DATA INJECTION per far funzionare il carrello con i prodotti finti
    const isMock = variantIds.some(id => id.startsWith("v") || id.startsWith("mock"));
    if (isMock) {
      varianti = [
        { id: "v1", taglia: "S", stock: 5, prezzo_cents: 2900, product: { nome: "T-Shirt Ufficiale Meraki", copertina_url: "/images/v2/yoga_moody.png", prezzo_base_cents: 2900, slug: "t-shirt-basic" } },
        { id: "v2", taglia: "M", stock: 10, prezzo_cents: 2900, product: { nome: "T-Shirt Ufficiale Meraki", copertina_url: "/images/v2/yoga_moody.png", prezzo_base_cents: 2900, slug: "t-shirt-basic" } },
        { id: "v3", taglia: "L", stock: 3, prezzo_cents: 2900, product: { nome: "T-Shirt Ufficiale Meraki", copertina_url: "/images/v2/yoga_moody.png", prezzo_base_cents: 2900, slug: "t-shirt-basic" } },
        { id: "mock-2", taglia: null, stock: 10, product: { nome: "Tappetino Premium Eco-Friendly", copertina_url: "/images/v2/salsation_glow.png", prezzo_base_cents: 4500, slug: "tappetino-yoga" } },
        { id: "mock-3", taglia: null, stock: 10, product: { nome: "Borraccia Termica 500ml", copertina_url: "/images/v2/aerial_glow.png", prezzo_base_cents: 1900, slug: "borraccia-termica" } },
      ] as any;
    }

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

  // Verifica se i prodotti "Bundle" sono nel carrello per applicare lo sconto consigliato
  const hasCrossSellDiscount = variantIds.includes("mock-2") || variantIds.includes("mock-3");

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
            <CrossSellSection />
          </div>
          
          {/* Sidebar Summary Column */}
          <div className="lg:col-span-5 xl:col-span-4">
            <CartSummaryClient 
              subtotalCents={subtotal} 
              hasCrossSellDiscount={hasCrossSellDiscount}
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
