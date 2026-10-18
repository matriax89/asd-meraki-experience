import { NextResponse } from "next/server";
import { getTicketCheckoutStatus } from "@/lib/stripe/ticket-status";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

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
      const result = await getTicketCheckoutStatus(sessionId);
      const destination = result.status === "ready" && result.url && (!("tickets" in result) || (result.tickets?.length || 0) <= 1)
        ? result.url
        : `/${result.locale}/pagamento?session_id=${encodeURIComponent(sessionId)}`;
      const response = NextResponse.redirect(new URL(destination, request.url));
      response.headers.set("Cache-Control", "no-store");
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    } else if (type === "shop") {
      // Find the order matching the stripe session id
      const { data: order, error } = await supabase
        .from("orders")
        .select("id")
        .eq("stripe_session_id", sessionId)
        .single();

      if (order && !error) {
        // Clear the cart
        (await cookies()).delete("meraki_cart");
        return NextResponse.redirect(new URL(`/it/ordine/${order.id}/conferma`, request.url));
      }
    }

    // Se il webhook non ha ancora finito di salvare, ricarichiamo dopo qualche istante (molto basic come approccio, meglio un long polling client side)
    // Per questo prototipo possiamo usare un delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (type === "shop") {
      const { data: order } = await supabase.from("orders").select("id").eq("stripe_session_id", sessionId).single();
      if (order) {
        (await cookies()).delete("meraki_cart");
        return NextResponse.redirect(new URL(`/it/ordine/${order.id}/conferma`, request.url));
      }
    }

    // Fallback error
    return NextResponse.redirect(new URL(`/?error=no_record_found`, request.url));
  } catch {
    console.error("Checkout return could not be verified.");
    if (type === "ticket") {
      return NextResponse.redirect(new URL(`/it/pagamento?session_id=${encodeURIComponent(sessionId)}`, request.url));
    }
    return NextResponse.redirect(new URL(`/?error=unknown_error`, request.url));
  }
}
