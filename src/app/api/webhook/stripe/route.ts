import { NextResponse } from "next/server";
import { getLocalizedText } from "@/lib/i18n-utils";
import Stripe from "stripe";
import { getStripe, getVerifiedStripe } from "@/lib/stripe/client";
import { fulfillTicketSession, transitionTicketSession, updateTicketRefund, revokeRefundedTicket } from "@/lib/stripe/fulfill-ticket";
import { isTicketSession } from "@/lib/stripe/ticket-status";
import { createAdminClient } from "@/lib/supabase/server";
import { sendOrderConfirmation, sendOrderNotification } from "@/lib/resend/client";

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  let event: Stripe.Event;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      secret
    );
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  try {
    if (event.type === "charge.refunded") {
      await revokeRefundedTicket(event.data.object);
      const charge = event.data.object;
      const paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (charge.refunded && paymentIntent) await (await import("@/lib/stripe/commerce")).revokeCommercePayment(paymentIntent);
      return NextResponse.json({ received: true });
    }
    if (event.type === "refund.created" || event.type === "refund.updated" || event.type === "refund.failed") {
      // Panel refunds have explicit amounts and admission targets. They must
      // never enter the older automatic full-payment revocation path.
      const { syncMerakiRefund } = await import("@/lib/refunds/service");
      const handled = await syncMerakiRefund(event.data.object);
      if (handled || event.data.object.metadata?.meraki_refund_id) return NextResponse.json({ received: true });
      if (event.data.object.metadata?.meraki_commerce_order_id) await (await import("@/lib/stripe/commerce")).updateCommerceRefund(event.data.object);
      else await updateTicketRefund(event.data.object);
      return NextResponse.json({ received: true });
    }
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded"
      || event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object;
      if (session.metadata?.flow_type === "event_commerce") {
        const commerce = await import("@/lib/stripe/commerce");
        const current = await (await getVerifiedStripe()).checkout.sessions.retrieve(session.id);
        if (!commerce.isCommerceSession(current)) throw new Error("Unexpected commerce Checkout flow.");
        if (current.payment_status !== "unpaid") await commerce.fulfillCommerceSession(current);
        else if (event.type === "checkout.session.expired" && current.status === "expired") await commerce.transitionCommerceSession(current, "expired");
        else if (event.type === "checkout.session.async_payment_failed") await commerce.transitionCommerceSession(current, "payment_failed");
        else await commerce.transitionCommerceSession(current, "awaiting_payment");
        return NextResponse.json({ received: true });
      }
      if (isTicketSession(session)) {
        // Fetch from the explicitly authorized account. This also avoids acting
        // on stale unpaid payloads delivered after payment has already succeeded.
        const current = await (await getVerifiedStripe()).checkout.sessions.retrieve(session.id);
        if (!isTicketSession(current)) throw new Error("Unexpected Checkout flow.");
        if (current.payment_status !== "unpaid") await fulfillTicketSession(current);
        else if (event.type === "checkout.session.expired" && current.status === "expired") await transitionTicketSession(current, "expired");
        else if (event.type === "checkout.session.async_payment_failed") await transitionTicketSession(current, "payment_failed");
        else await transitionTicketSession(current, "awaiting_payment");
        return NextResponse.json({ received: true });
      }
    }
  } catch {
    console.error("Meraki payment webhook processing failed; Stripe should retry.");
    return NextResponse.json({ error: "Payment processing temporarily unavailable" }, { status: 500 });
  }

  // Preserve the existing merchandise flow separately from event ticket fulfillment.
  const supabase = createAdminClient();
  if (event.type === "checkout.session.completed") {
    // Legacy merchandise payload is retained while tickets use the typed flow above.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = event.data.object as any;
    const metadata = session.metadata;
    if (metadata?.flow_type === "shop_order") {
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
            product_nome: getLocalizedText(v.product?.nome, 'it') || "Prodotto",
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

      // Invia email di conferma al cliente e notifica all'admin
      const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id);
      const locale = metadata?.locale || 'it';
      await sendOrderConfirmation(order, items || [], locale);
      await sendOrderNotification(order, items || []);

      console.log(`Order ${order.id} created successfully for ${email}`);
    }
  }

  return NextResponse.json({ received: true });
}
