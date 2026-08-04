import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { fulfillShopOrder } from "@/lib/stripe/fulfill-shop-order";
import { fulfillTicket } from "@/lib/stripe/fulfill-ticket";

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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;
    const metadata = session.metadata;

    if (metadata?.flow_type === "ticket_event" || metadata?.flow_type === "ticket_workshop") {
      await fulfillTicket(session);
    } else if (metadata?.flow_type === "shop_order") {
      await fulfillShopOrder(session);
    }
  }

  return NextResponse.json({ received: true });
}
