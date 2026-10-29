import { z } from "zod";

export const affiliateCommissionLimitCents = 10_000_000;
export const affiliateCommissionLimitCredits = 1_000_000;
export const affiliateCommissionFields = {
  commissionType: z.enum(["eur", "credits"]).optional().default("eur"),
  commissionCents: z.number().int().min(0).max(affiliateCommissionLimitCents).optional().default(0),
  commissionCredits: z.number().int().min(0).max(affiliateCommissionLimitCredits).optional().default(0),
};
export type AffiliateCommissionValue = { commissionType: "eur" | "credits"; commissionCents: number; commissionCredits: number };
const inactiveAmountIsZero = (value: AffiliateCommissionValue) => value.commissionType === "eur" ? value.commissionCredits === 0 : value.commissionCents === 0;
export const affiliateCommissionValueSchema = z.union([
  z.number().int().min(0).max(affiliateCommissionLimitCents).transform((commissionCents): AffiliateCommissionValue => ({ commissionType: "eur", commissionCents, commissionCredits: 0 })),
  z.object(affiliateCommissionFields).strict().refine(inactiveAmountIsZero, "L’importo dell’unità non selezionata deve essere zero."),
]);
export const affiliateCommissionRatesSchema = z.record(
  z.string().uuid().transform(id => id.toLowerCase()), affiliateCommissionValueSchema,
).refine(rates => Object.keys(rates).length <= 100, "Puoi impostare fino a 100 compensi per evento.");
export type AffiliateCommissionRates = z.infer<typeof affiliateCommissionRatesSchema>;
/** Legacy numbers are euro cents; structured values preserve their explicit unit. */
export function normalizeAffiliateCommissionValue(value: number | AffiliateCommissionValue): AffiliateCommissionValue {
  return affiliateCommissionValueSchema.parse(value);
}
/** Decimal currency input has no grouping separators and never rounds fractions. */
export function parseAffiliateCommissionEuro(value: string): number | null {
  const input = value.trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(input)) return null;
  const [whole, fraction = ""] = input.split(/[.,]/);
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= affiliateCommissionLimitCents ? cents : null;
}
export function parseAffiliateCommissionCredits(value: string): number | null {
  const input = value.trim();
  if (!/^\d+$/.test(input)) return null;
  const credits = Number(input);
  return Number.isSafeInteger(credits) && credits <= affiliateCommissionLimitCredits ? credits : null;
}
