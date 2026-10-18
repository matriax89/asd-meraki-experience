import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getTicketCheckoutStatus } from "@/lib/stripe/ticket-status";
import { PaymentConfigurationError } from "@/lib/stripe/client";

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id") || "";
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  try {
    const result = await getTicketCheckoutStatus(sessionId);
    return NextResponse.json(result, { status: result.status === "invalid" ? 404 : 200, headers });
  } catch (error: unknown) {
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      return NextResponse.json({ status: "invalid" }, { status: 404, headers });
    }
    return NextResponse.json({ error: error instanceof PaymentConfigurationError ? error.message : "Verifica del pagamento momentaneamente non disponibile." }, { status: 503, headers });
  }
}
