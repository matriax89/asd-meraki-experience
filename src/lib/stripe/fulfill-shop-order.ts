import type Stripe from "stripe";
import { getLocalizedText } from "@/lib/i18n-utils";
import { sendOrderConfirmation, sendOrderNotification } from "@/lib/resend/client";
import { createAdminClient } from "@/lib/supabase/server";

export async function fulfillShopOrder(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid" || session.metadata?.flow_type !== "shop_order") {
    return null;
  }

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("orders")
    .select("*")
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (existing) {
    const { data: existingItems } = await supabase.from("order_items").select("*").eq("order_id", existing.id);
    const updates: { customer_confirmation_sent_at?: string; admin_notification_sent_at?: string } = {};
    if (!existing.customer_confirmation_sent_at) {
      const result = await sendOrderConfirmation(existing, existingItems || [], existing.locale || "it");
      if (result.success) updates.customer_confirmation_sent_at = new Date().toISOString();
    }
    if (!existing.admin_notification_sent_at) {
      const result = await sendOrderNotification(existing, existingItems || []);
      if (result?.success) updates.admin_notification_sent_at = new Date().toISOString();
    }
    if (Object.keys(updates).length) await supabase.from("orders").update(updates).eq("id", existing.id);
    return existing;
  }

  const cartItems = JSON.parse(session.metadata.cart_data || "[]") as Array<{ variantId: string; quantity: number }>;
  const customer = session.customer_details;
  const shipping = (session as any).shipping_details || (session as any).collected_information?.shipping_details;
  const fullName = customer?.name || "";
  const { data: orderNumber } = await supabase.rpc("generate_order_number");

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      numero_ordine: orderNumber || `ME-${new Date().getFullYear()}-${session.id.slice(-8).toUpperCase()}`,
      buyer_email: customer?.email || "",
      buyer_nome: fullName.split(" ")[0] || "",
      buyer_cognome: fullName.split(" ").slice(1).join(" "),
      ship_address_line1: shipping?.address?.line1 || "",
      ship_address_line2: shipping?.address?.line2 || null,
      ship_city: shipping?.address?.city || "",
      ship_postal_code: shipping?.address?.postal_code || "",
      ship_state: shipping?.address?.state || "",
      ship_country: shipping?.address?.country || "IT",
      delivery_method: session.metadata.hand_delivery === "true" ? "hand_delivery" : "shipping",
      locale: ["it", "en", "de"].includes(session.metadata.locale || "") ? session.metadata.locale : "it",
      stripe_session_id: session.id,
      stripe_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
      subtotal_cents: session.amount_subtotal || 0,
      shipping_cents: session.total_details?.amount_shipping || 0,
      total_cents: session.amount_total || 0,
      status: "paid",
    })
    .select()
    .single();

  if (error || !order) {
    // A simultaneous webhook/return may have won the unique-key race.
    const { data: racedOrder } = await supabase.from("orders").select("*").eq("stripe_session_id", session.id).maybeSingle();
    if (racedOrder) return racedOrder;
    throw new Error(`Order fulfillment failed: ${error?.message || "unknown error"}`);
  }

  for (const item of cartItems) {
    const { data: variant } = await supabase
      .from("product_variants")
      .select("*, product:products(*)")
      .eq("id", item.variantId)
      .single();
    if (!variant) continue;

    const unitPrice = variant.prezzo_cents || variant.product?.prezzo_base_cents || 0;
    const { error: itemError } = await supabase.from("order_items").insert({
      order_id: order.id,
      variant_id: variant.id,
      product_nome: getLocalizedText(variant.product?.nome, session.metadata?.locale || "it") || "Prodotto",
      variant_descrizione: `${variant.taglia || ""} ${variant.colore || ""}`.trim(),
      sku: variant.sku,
      quantita: item.quantity,
      prezzo_unitario_cents: unitPrice,
      totale_cents: unitPrice * item.quantity,
    });
    if (!itemError) {
      await supabase.rpc("decrement_stock", { variant_id: variant.id, quantity_to_subtract: item.quantity });
    }
  }

  if (session.metadata.coupon_code) {
    const { data: coupon } = await supabase.from("coupons").select("id, uses_count").eq("code", session.metadata.coupon_code).maybeSingle();
    if (coupon) await supabase.from("coupons").update({ uses_count: (coupon.uses_count || 0) + 1 }).eq("id", coupon.id);
  }

  const { data: items } = await supabase.from("order_items").select("*").eq("order_id", order.id);
  const [customerEmail, adminEmail] = await Promise.all([
    sendOrderConfirmation(order, items || [], session.metadata?.locale || "it"),
    sendOrderNotification(order, items || []),
  ]);
  const emailUpdates: { customer_confirmation_sent_at?: string; admin_notification_sent_at?: string } = {};
  if (customerEmail.success) emailUpdates.customer_confirmation_sent_at = new Date().toISOString();
  if (adminEmail?.success) emailUpdates.admin_notification_sent_at = new Date().toISOString();
  if (Object.keys(emailUpdates).length) await supabase.from("orders").update(emailUpdates).eq("id", order.id);

  return order;
}
