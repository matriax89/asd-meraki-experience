import { z } from 'zod';
import type { CommerceDiscountSnapshot, CommerceQuote } from './types';

export const normalizeDiscountCode = (value: string) => value.trim().toUpperCase();
const identifier = z.string().regex(/^[a-z0-9_-]{1,64}$/);
const ids = z.array(identifier).max(30).refine(values => new Set(values).size === values.length, 'Identificativi duplicati');
export const discountSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().transform(normalizeDiscountCode).pipe(z.string().regex(/^[A-Z0-9_-]{1,50}$/)),
  name: z.string().trim().min(1).max(120), active: z.boolean(),
  startsAt: z.iso.datetime({ offset: true }).nullable(), endsAt: z.iso.datetime({ offset: true }).nullable(),
  discountType: z.enum(['percentage', 'fixed_amount']), discountValue: z.number().int().min(1).max(10_000_000),
  minSubtotalCents: z.number().int().min(0).max(10_000_000).default(0), maxUses: z.number().int().min(1).max(1_000_000).nullable(),
  targetType: z.enum(['order', 'package', 'activity', 'addon']), targetIds: ids, allowedTierIds: ids,
}).strict().superRefine((value, ctx) => {
  const issue = (message: string, path: string[]) => ctx.addIssue({ code: 'custom', message, path });
  if (value.discountType === 'percentage' && value.discountValue > 99) issue('La percentuale deve essere tra 1 e 99', ['discountValue']);
  if (value.startsAt && value.endsAt && Date.parse(value.startsAt) >= Date.parse(value.endsAt)) issue('La fine deve essere successiva all’inizio', ['endsAt']);
  if (value.targetType === 'order' ? value.targetIds.length > 0 : value.targetIds.length === 0) issue('Seleziona gli elementi a cui applicare il codice', ['targetIds']);
});
export type CommerceDiscountCodeInput = z.infer<typeof discountSchema>;
export type CommerceDiscountCode = {
  id: string; event_id: string; code: string; name: string; active: boolean; starts_at: string | null; ends_at: string | null;
  discount_type: 'percentage' | 'fixed_amount'; discount_value: number; min_subtotal_cents: number; max_uses: number | null;
  target_type: 'order' | 'package' | 'activity' | 'addon'; target_ids: string[]; allowed_tier_ids: string[];
  created_at: string; updated_at: string; reserved_uses: number; redeemed_uses: number;
};

/** Pure preview of the database calculation. Availability and redemption remain server-only. */
export function discountQuote(quote: CommerceQuote, discount: CommerceDiscountCodeInput, id: string): CommerceQuote | { error: string } {
  if (quote.lines.some(line => line.kind === 'upgrade')) return { error: 'discount_upgrade_unsupported' };
  const subtotalCents = quote.lines.reduce((sum, line) => sum + line.totalCents, 0);
  if (subtotalCents < discount.minSubtotalCents) return { error: 'discount_minimum_subtotal' };
  const excluded = new Set(quote.discountExcludedActivityIds ?? []);
  const eligible = quote.lines.map(line => {
    if (discount.allowedTierIds.length && (!line.tierId || !discount.allowedTierIds.includes(line.tierId))) return 0;
    // Dinner remains full price, including when it is part of a package. Quotes
    // without a reliable split conservatively exclude the entire affected line.
    const excludedIds = line.activityIds.filter(activityId => excluded.has(activityId));
    const excludedCents = excludedIds.some(activityId => line.activityAmounts?.[activityId] === undefined)
      ? line.totalCents : excludedIds.reduce((sum, activityId) => sum + (line.activityAmounts?.[activityId] ?? 0), 0);
    const nonDinnerCents = Math.max(0, line.totalCents - excludedCents);
    if (discount.targetType === 'order') return line.kind === 'package' ? nonDinnerCents : 0;
    if (discount.targetType === 'package') return line.kind === 'package' && line.packageId && discount.targetIds.includes(line.packageId) ? nonDinnerCents : 0;
    if (discount.targetType === 'addon') return line.kind === 'addon' && line.addonId && discount.targetIds.includes(line.addonId) ? nonDinnerCents : 0;
    return Math.min(nonDinnerCents, discount.targetIds.reduce((sum, activityId) => sum + (excluded.has(activityId) ? 0 : line.activityAmounts?.[activityId] || 0), 0));
  });
  const eligibleCents = eligible.reduce((sum, amount) => sum + amount, 0);
  if (!eligibleCents) return { error: 'discount_not_applicable' };
  const discountCents = discount.discountType === 'percentage' ? Math.round(eligibleCents * discount.discountValue / 100) : Math.min(eligibleCents, discount.discountValue);
  if (!discountCents) return { error: 'discount_not_applicable' };
  if (subtotalCents - discountCents < 50) return { error: 'discount_minimum_payment' };
  let cumulative = 0; let allocated = 0;
  const lines = quote.lines.map((line, index) => {
    cumulative += eligible[index];
    const next = Math.floor(discountCents * cumulative / eligibleCents);
    const amount = next - allocated; allocated = next;
    return { ...line, subtotalCents: line.totalCents, discountCents: amount, unitAmountCents: line.unitAmountCents - amount, totalCents: line.totalCents - amount };
  });
  const snapshot: CommerceDiscountSnapshot = { id, code: discount.code, discountType: discount.discountType, discountValue: discount.discountValue, targetType: discount.targetType, targetIds: discount.targetIds, eligibleCents };
  return { ...quote, lines, subtotalCents, discountCents, totalCents: subtotalCents - discountCents, discount: snapshot };
}
