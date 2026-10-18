import Stripe from "stripe";

let client: Stripe | undefined;
let verifiedAccount: Promise<Stripe> | undefined;

export class PaymentConfigurationError extends Error {}

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new PaymentConfigurationError("Pagamenti non ancora configurati. Contatta Meraki per assistenza.");
  }
  // The installed SDK pins its supported API version; keep the two in sync.
  client ??= new Stripe(key);
  return client;
}

export async function getVerifiedStripe() {
  const expectedAccountId = process.env.STRIPE_EXPECTED_ACCOUNT_ID;
  if (!expectedAccountId) {
    throw new PaymentConfigurationError("Il conto Stripe di Meraki deve ancora essere verificato.");
  }
  verifiedAccount ??= (async () => {
    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(null);
    if (account.id !== expectedAccountId) {
      throw new PaymentConfigurationError("Il conto Stripe configurato non corrisponde al conto Meraki autorizzato.");
    }
    return stripe;
  })().catch((error: unknown) => {
    verifiedAccount = undefined;
    throw error;
  });
  return verifiedAccount;
}
