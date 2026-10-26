import { z } from "zod";

export const affiliateCommissionLimitCents = 10_000_000;
export const affiliateCommissionRatesSchema = z.record(
  z.string().uuid().transform((id) => id.toLowerCase()),
  z.number().int().min(0).max(affiliateCommissionLimitCents),
).refine((rates) => Object.keys(rates).length <= 100, "Puoi impostare fino a 100 compensi per evento.");

export type AffiliateCommissionRates = z.infer<typeof affiliateCommissionRatesSchema>;

/** Decimal currency input has no grouping separators and never rounds fractions. */
export function parseAffiliateCommissionEuro(value: string): number | null {
  const input = value.trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(input)) return null;
  const [whole, fraction = ""] = input.split(/[.,]/);
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= affiliateCommissionLimitCents ? cents : null;
}
