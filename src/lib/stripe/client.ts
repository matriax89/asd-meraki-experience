import Stripe from "stripe";

export const stripe = new Stripe((process.env.STRIPE_SECRET_KEY || "dummy_key") as string, {
  apiVersion: "2026-04-22.dahlia" as any, // TypeScript sometimes lags behind Stripe SDK updates depending on the package version
});
