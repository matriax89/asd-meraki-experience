import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed.", err.message);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;
    const metadata = session.metadata;

    if (metadata?.flow_type === "ticket_event" || metadata?.flow_type === "ticket_workshop") {
      const eventId = metadata.event_id;
      const buyerEmail = metadata.buyer_email;

      // Generiamo un id fittizio per il qr code in questo step (nella realtà usiamo uuid)
      const qrCode = `ticket_${session.id}`;

      // Inseriamo il record ticket
      const { data: ticket, error: ticketError } = await supabase
        .from("tickets")
        .insert({
          event_id: eventId,
          buyer_email: buyerEmail,
          stripe_session_id: session.id,
          stripe_payment_intent: session.payment_intent,
          amount_cents: session.amount_total,
          status: "paid",
          qr_code: qrCode,
        })
        .select()
        .single();

      if (ticketError) {
        console.error("Error creating ticket:", ticketError);
        return NextResponse.json({ error: "Database error" }, { status: 500 });
      }

      // Incrementa i posti venduti
      await supabase.rpc('increment_ticket_count', { row_id: eventId });

      // Qui andrebbe inviata la mail con Resend
      console.log(`Ticket ${ticket.id} created successfully for ${buyerEmail}`);
    } else if (metadata?.flow_type === "shop_order") {
      const cartItems = JSON.parse(metadata.cart_data || "[]");
      const customerDetails = session.customer_details;
      const shippingDetails = session.shipping_details;
      
      const email = customerDetails?.email || "";
      const name = customerDetails?.name || "";
      
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          numero_ordine: `ME-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`, // Normally we'd use the sequence we defined
          buyer_email: email,
          buyer_nome: name.split(' ')[0] || "",
          buyer_cognome: name.split(' ').slice(1).join(' ') || "",
          ship_address_line1: shippingDetails?.address?.line1 || "",
          ship_address_line2: shippingDetails?.address?.line2 || null,
          ship_city: shippingDetails?.address?.city || "",
          ship_postal_code: shippingDetails?.address?.postal_code || "",
          ship_state: shippingDetails?.address?.state || "",
          ship_country: shippingDetails?.address?.country || "IT",
          stripe_session_id: session.id,
          stripe_payment_intent: session.payment_intent,
          subtotal_cents: session.amount_subtotal,
          shipping_cents: session.total_details?.amount_shipping || 0,
          total_cents: session.amount_total,
          status: "paid",
        })
        .select()
        .single();

      if (orderError) {
        console.error("Error creating order:", orderError);
        return NextResponse.json({ error: "Database error" }, { status: 500 });
      }

      // Insert Order Items and decrement stock
      for (const item of cartItems) {
        // Find variant info to get SKU and name
        const { data: v } = await supabase.from('product_variants').select('*, product:products(*)').eq('id', item.variantId).single();
        if (v) {
          await supabase.from('order_items').insert({
            order_id: order.id,
            variant_id: v.id,
            product_nome: v.product?.nome || "Prodotto",
            variant_descrizione: `${v.taglia || ''} ${v.colore || ''}`.trim(),
            sku: v.sku,
            quantita: item.quantity,
            prezzo_unitario_cents: v.prezzo_cents || v.product?.prezzo_base_cents || 0,
            totale_cents: (v.prezzo_cents || v.product?.prezzo_base_cents || 0) * item.quantity
          });
          
          // Decrement stock using RPC or update
          await supabase.rpc('decrement_stock', { variant_id: v.id, quantity_to_subtract: item.quantity });
        }
      }

      if (metadata.coupon_code) {
        // Find the coupon and increment uses_count
        const { data: coupon } = await supabase.from('coupons').select('id, uses_count').eq('code', metadata.coupon_code).single();
        if (coupon) {
          await supabase.from('coupons').update({ uses_count: (coupon.uses_count || 0) + 1 }).eq('id', coupon.id);
        }
      }

      console.log(`Order ${order.id} created successfully for ${email}`);
    }
  }

  return NextResponse.json({ received: true });
}
