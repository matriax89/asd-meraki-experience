import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCart, clearCart } from "@/lib/shop/cart-actions";
import { stripe } from "@/lib/stripe/client";

export async function POST(request: Request) {
  try {
    const cart = await getCart();
    
    if (!cart || cart.items.length === 0) {
      // Redirect back if empty
      const referer = request.headers.get("referer") || "/";
      return NextResponse.redirect(new URL(referer, request.url));
    }

    const supabase = await createClient();
    const variantIds = cart.items.map(i => i.variantId);
    
    // Fetch variants and their products
    const { data: varianti, error } = await supabase
      .from("product_variants")
      .select("*, product:products(*)")
      .in("id", variantIds);

    if (error || !varianti) {
      throw new Error("Errore nel recupero prodotti dal carrello.");
    }

    const lineItems = [];
    let subtotalCents = 0;

    for (const cartItem of cart.items) {
      const dbVariant = varianti.find(v => v.id === cartItem.variantId);
      if (!dbVariant || dbVariant.stock < cartItem.quantity || !dbVariant.attivo) {
        throw new Error("Un prodotto non è più disponibile nelle quantità richieste.");
      }

      const price = dbVariant.prezzo_cents || dbVariant.product?.prezzo_base_cents || 0;
      subtotalCents += price * cartItem.quantity;
      
      const variantName = dbVariant.taglia || dbVariant.colore 
        ? `${dbVariant.product?.nome || 'Prodotto'} - ${dbVariant.taglia || ''} ${dbVariant.colore || ''}`.trim() 
        : (dbVariant.product?.nome || 'Prodotto');

      lineItems.push({
        price_data: {
          currency: "eur",
          product_data: {
            name: variantName,
            metadata: {
              variant_id: dbVariant.id,
              product_id: dbVariant.product?.id || ''
            }
          },
          unit_amount: price,
        },
        quantity: cartItem.quantity,
      });
    }

    // In a real app we might fetch shipping options from the database.
    // For now we'll add a fixed standard shipping of 5.00 EUR (500 cents), or free if subtotal > 100 EUR.
    const shippingCost = subtotalCents > 10000 ? 0 : 500;
    
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    // Generate temporary order id metadata to pass to Stripe
    const tempOrderId = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card", "paypal"], // Added paypal if enabled
      line_items: lineItems,
      mode: "payment",
      shipping_address_collection: {
        allowed_countries: ["IT", "AT", "DE"],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: shippingCost, currency: "eur" },
            display_name: shippingCost === 0 ? "Spedizione Gratuita" : "Spedizione Standard",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 3 },
              maximum: { unit: "business_day", value: 5 },
            },
          },
        },
      ],
      success_url: `${siteUrl}/api/checkout/success?session_id={CHECKOUT_SESSION_ID}&type=shop`,
      cancel_url: `${siteUrl}/carrello`,
      metadata: {
        flow_type: "shop_order",
        cart_data: JSON.stringify(cart.items),
        temp_order_id: tempOrderId,
      },
    });

    if (session.url) {
      return NextResponse.redirect(session.url, 303);
    } else {
      throw new Error("Impossibile creare sessione Stripe");
    }
  } catch (error: any) {
    console.error("Shop checkout error:", error);
    const referer = request.headers.get("referer") || "/";
    return NextResponse.redirect(new URL(`${referer}?error=${encodeURIComponent(error.message)}`, request.url));
  }
}
