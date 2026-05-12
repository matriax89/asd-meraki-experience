import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/server";
import { clearCart } from "@/lib/shop/cart-actions";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  const type = searchParams.get("type");

  if (!sessionId) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  try {
    const supabase = await createClient();

    if (type === "ticket") {
      // Find the ticket matching the stripe session id
      const { data: ticket, error } = await supabase
        .from("tickets")
        .select("id")
        .eq("stripe_session_id", sessionId)
        .single();

      if (ticket && !error) {
        return NextResponse.redirect(new URL(`/it/biglietto/${ticket.id}`, request.url));
      }
    } else if (type === "shop") {
      // Find the order matching the stripe session id
      const { data: order, error } = await supabase
        .from("orders")
        .select("id")
        .eq("stripe_session_id", sessionId)
        .single();

      if (order && !error) {
        // Clear the cart
        await clearCart();
        return NextResponse.redirect(new URL(`/it/ordine/${order.id}/conferma`, request.url));
      }
    }

    // Se il webhook non ha ancora finito di salvare, ricarichiamo dopo qualche istante (molto basic come approccio, meglio un long polling client side)
    // Per questo prototipo possiamo usare un delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (type === "ticket") {
      const { data: ticket } = await supabase.from("tickets").select("id").eq("stripe_session_id", sessionId).single();
      if (ticket) return NextResponse.redirect(new URL(`/it/biglietto/${ticket.id}`, request.url));
    } else if (type === "shop") {
      const { data: order } = await supabase.from("orders").select("id").eq("stripe_session_id", sessionId).single();
      if (order) {
        await clearCart();
        return NextResponse.redirect(new URL(`/it/ordine/${order.id}/conferma`, request.url));
      }
    }

    // Fallback error
    return NextResponse.redirect(new URL(`/?error=no_record_found`, request.url));
  } catch (error) {
    console.error("Success page error:", error);
    return NextResponse.redirect(new URL(`/?error=unknown_error`, request.url));
  }
}
