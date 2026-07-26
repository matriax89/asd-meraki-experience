"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { stripe } from "@/lib/stripe/client";
import { fulfillShopOrder } from "@/lib/stripe/fulfill-shop-order";
import { sendOrderConfirmation, sendOrderNotification, sendOrderStatusUpdate } from "@/lib/resend/client";

export async function syncPaidStripeOrders() {
  await requireAdmin();
  const sessions = await stripe.checkout.sessions.list({ limit: 100 });
  let recovered = 0;

  for (const session of sessions.data) {
    if (session.payment_status !== "paid" || session.metadata?.flow_type !== "shop_order") continue;
    const adminSupabase = createAdminClient();
    const { data: existing } = await adminSupabase.from("orders").select("id").eq("stripe_session_id", session.id).maybeSingle();
    if (!existing) {
      await fulfillShopOrder(session);
      recovered += 1;
    }
  }

  revalidatePath("/[locale]/admin/ordini", "page");
  revalidatePath("/[locale]/admin", "page");
  console.info(`Stripe order sync completed: ${recovered} recovered`);
}

export async function updateOrderStatus(id: string, status: string, trackingNumber?: string, trackingUrl?: string) {
  await requireAdmin();
  const supabase = await createClient();
  
  // Verify auth and role
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "Unauthorized" };
  
  const adminSupabase = createAdminClient();
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();
    
  if (!profile || (profile.role !== "admin" && profile.role !== "editor")) {
    return { error: "Forbidden" };
  }

  const updates: any = { status };
  const { data: currentOrder } = await adminSupabase.from("orders").select("*").eq("id", id).single();
  if (!currentOrder) return { error: "Ordine non trovato." };

  if (currentOrder.delivery_method === "hand_delivery" && ["shipped", "delivered"].includes(status)) {
    return { error: "Un ordine con ritiro a mano non può essere segnato come spedito." };
  }
  if (currentOrder.delivery_method !== "hand_delivery" && status === "ready_for_pickup") {
    return { error: "Questo ordine deve essere spedito: usa lo stato Spedito." };
  }
  
  if (status === 'shipped') {
    updates.shipped_at = new Date().toISOString();
  } else if (status === 'delivered') {
    updates.delivered_at = new Date().toISOString();
  } else if (status === 'completed') {
    updates.completed_at = new Date().toISOString();
  }

  if (trackingNumber !== undefined) updates.tracking_number = trackingNumber;
  if (trackingUrl !== undefined) updates.tracking_url = trackingUrl;

  const { error } = await supabase
    .from("orders")
    .update(updates)
    .eq("id", id);

  if (error) {
    console.error("Update order error:", error);
    return { error: "Errore durante l'aggiornamento dell'ordine." };
  }

  let emailWarning: string | undefined;
  if (currentOrder.status !== status) {
    const { data: updatedOrder } = await adminSupabase.from("orders").select("*").eq("id", id).single();
    const { data: items } = await adminSupabase.from("order_items").select("*").eq("order_id", id);
    if (updatedOrder) {
      const emailResult = await sendOrderStatusUpdate(updatedOrder, items || [], updatedOrder.locale || "it");
      if (!emailResult.success) emailWarning = "Stato salvato, ma l’email al cliente non è partita.";
    }
  }

  revalidatePath("/[locale]/admin/ordini", "page");
  revalidatePath(`/[locale]/admin/ordini/${id}`, "page");
  revalidatePath("/[locale]/admin", "page");
  
  return { success: true, warning: emailWarning };
}

export async function resendOrderEmails(id: string, target: "customer" | "admin") {
  await requireAdmin();
  const supabase = createAdminClient();
  const [{ data: order }, { data: items }] = await Promise.all([
    supabase.from("orders").select("*").eq("id", id).single(),
    supabase.from("order_items").select("*").eq("order_id", id),
  ]);
  if (!order) return { error: "Ordine non trovato." };
  const result = target === "admin"
    ? await sendOrderNotification(order, items || [])
    : await sendOrderConfirmation(order, items || [], order.locale || "it");
  if (!result?.success) return { error: "Invio non riuscito. Controlla provider, mittente e destinatario." };
  return { success: true };
}
