import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { clearCart } from "@/lib/shop/cart-actions";
import { stripe } from "@/lib/stripe/client";
import { fulfillShopOrder } from "@/lib/stripe/fulfill-shop-order";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  const type = searchParams.get("type");

  if (!sessionId) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return NextResponse.redirect(new URL("/", request.url));
    }

    const locale = session.metadata?.locale || "it";
    if (type === "shop") {
      // The Stripe session is the source of truth for payment. Clear the
      // browser cart immediately, independently from webhook timing.
      await clearCart();
      await fulfillShopOrder(session);
    }

    // The Stripe session id is an unguessable capability returned by Stripe.
    // Use the service client only to resolve that exact session; never expose a list.
    const supabase = createAdminClient();

    if (type === "ticket") {
      // Find the ticket matching the stripe session id
      const { data: ticket, error } = await supabase
        .from("tickets")
        .select("id")
        .eq("stripe_session_id", sessionId)
        .single();

      if (ticket && !error) {
        return NextResponse.redirect(new URL(`/${locale}/biglietto/${ticket.id}?session_id=${encodeURIComponent(sessionId)}`, request.url));
      }
    } else if (type === "shop") {
      // Find the order matching the stripe session id
      const { data: order, error } = await supabase
        .from("orders")
        .select("id")
        .eq("stripe_session_id", sessionId)
        .single();

      if (order && !error) {
        return NextResponse.redirect(new URL(`/${locale}/ordine/${order.id}/conferma?session_id=${encodeURIComponent(sessionId)}`, request.url));
      }
    }

    // Se il webhook non ha ancora finito di salvare, ricarichiamo dopo qualche istante (molto basic come approccio, meglio un long polling client side)
    // Per questo prototipo possiamo usare un delay
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (type === "ticket") {
        const { data: ticket } = await supabase.from("tickets").select("id").eq("stripe_session_id", sessionId).maybeSingle();
        if (ticket) return NextResponse.redirect(new URL(`/${locale}/biglietto/${ticket.id}?session_id=${encodeURIComponent(sessionId)}`, request.url));
      } else if (type === "shop") {
        const { data: order } = await supabase.from("orders").select("id").eq("stripe_session_id", sessionId).maybeSingle();
        if (order) {
          return NextResponse.redirect(new URL(`/${locale}/ordine/${order.id}/conferma?session_id=${encodeURIComponent(sessionId)}`, request.url));
        }
      }
    }

    // Payment is confirmed even if the asynchronous webhook is still working.
    return NextResponse.redirect(new URL(`/${locale}/ordine/conferma?session_id=${encodeURIComponent(sessionId)}`, request.url));
  } catch (error) {
    console.error("Success page error:", error);
    return NextResponse.redirect(new URL(`/?error=unknown_error`, request.url));
  }
}
