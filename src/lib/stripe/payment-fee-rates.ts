/** Public standard tariffs for an Italian merchant, checked on 6 November 2026.
 * These estimates never replace actual fees or account-specific pricing.
 * https://stripe.com/it/pricing#terminal
 * https://www.paypal.com/it/business/paypal-business-fees
 */
function fee(amountCents: number, basisPoints: number, fixedCents: number) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new Error("Invalid fee estimate amount");
  if (amountCents === 0) return 0;
  // Round once for the payment, using integer arithmetic to preserve cents.
  return Number((BigInt(amountCents) * BigInt(basisPoints) + BigInt(5_000)) / BigInt(10_000)) + fixedCents;
}

export const tapToPayEstimateReason = "Commissione Stripe Tap to Pay calcolata da listino: carta SEE, 1,4% + 0,10 € e 0,10 € per una autorizzazione. Esclusi ulteriori tentativi, conversioni valutarie e tariffe personalizzate.";
export const externalPayPalEstimateReason = "Commissione PayPal mancante calcolata da listino: tariffa standard Italia/SEE 3,4% + 0,35 €. Residenza del pagatore non verificata; esclusi supplementi internazionali, conversioni e tariffe personalizzate.";

export const estimateTapToPayFee = (amountCents: number) => fee(amountCents, 140, 20);
export const estimateExternalPayPalFee = (amountCents: number) => fee(amountCents, 340, 35);
