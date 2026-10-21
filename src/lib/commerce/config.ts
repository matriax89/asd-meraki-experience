import { z } from 'zod';
import type { CommerceConfig, CommerceParticipant, CommercePriceTier, CommerceQuote } from './types';

const id = z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/);
const name = z.string().trim().min(1).max(120);
const date = z.iso.datetime({ offset: true }).nullable();
const amount = z.number().int().min(0).max(10_000_000);
const translations = z.object({ it: name.optional(), en: name.optional(), de: name.optional(), es: name.optional() }).strict();
const descriptions = z.object({ it: z.string().trim().max(1000).optional(), en: z.string().trim().max(1000).optional(), de: z.string().trim().max(1000).optional(), es: z.string().trim().max(1000).optional() }).strict();
const priceSchema = z.object({ id, label: name, labelTranslations: translations.optional(), amountCents: amount, activityAmounts: z.record(id, amount).optional(), startsAt: date, endsAt: date }).strict();
export const configSchema = z.object({
  version: z.literal(1), enabled: z.boolean(), waitlistEnabled: z.boolean(), upgradesEnabled: z.boolean(),
  activities: z.array(z.object({ id, name, nameTranslations: translations.optional(), kind: z.enum(['workshop', 'masterclass', 'dinner', 'extra']), capacity: z.number().int().min(0).max(100_000).nullable(), startsAt: date, endsAt: date.optional(), checkInStartsAt: date.optional(), salesEnd: date, menuOptions: z.array(name).max(30), menuTranslations: z.record(name, translations).optional() }).strict()).max(30),
  packages: z.array(z.object({ id, name, nameTranslations: translations.optional(), description: z.string().trim().max(1000), descriptionTranslations: descriptions.optional(), activityIds: z.array(id).min(1).max(30), prices: z.array(priceSchema).min(1).max(20) }).strict()).max(30),
  addons: z.array(z.object({ id, name, nameTranslations: translations.optional(), activityId: id, amountCents: amount }).strict()).max(30),
}).strict().superRefine((config, ctx) => {
  const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: 'custom', message, path });
  const unique = (values: string[], path: (string | number)[]) => { if (new Set(values).size !== values.length) issue('I valori devono essere univoci', path); };
  unique(config.activities.map(a => a.id), ['activities']);
  unique(config.packages.map(p => p.id), ['packages']);
  unique(config.addons.map(a => a.id), ['addons']);
  const activities = new Set(config.activities.map(a => a.id));
  if (config.enabled && (!config.activities.length || !config.packages.length)) issue('Aggiungi almeno un’attività e una formula', ['packages']);
  config.activities.forEach((a, i) => {
    unique(a.menuOptions, ['activities', i, 'menuOptions']);
    if (Object.keys(a.menuTranslations || {}).some(key => !a.menuOptions.includes(key))) issue('Menù inesistente', ['activities', i, 'menuTranslations']);
    if (a.salesEnd && a.startsAt && Date.parse(a.salesEnd) > Date.parse(a.startsAt)) issue('Le vendite devono terminare entro l’inizio dell’attività', ['activities', i, 'salesEnd']);
    if (a.endsAt && a.startsAt && Date.parse(a.endsAt) < Date.parse(a.startsAt)) issue('La fine dell’attività non può precedere l’inizio', ['activities', i, 'endsAt']);
    if (a.checkInStartsAt && a.startsAt && Date.parse(a.checkInStartsAt) > Date.parse(a.startsAt)) issue('L’apertura del check-in non può essere successiva all’inizio dell’attività', ['activities', i, 'checkInStartsAt']);
  });
  config.packages.forEach((p, i) => {
    unique(p.activityIds, ['packages', i, 'activityIds']); unique(p.prices.map(t => t.id), ['packages', i, 'prices']);
    if (p.activityIds.some(a => !activities.has(a))) issue('Attività inesistente', ['packages', i, 'activityIds']);
    p.prices.forEach((tier, j) => {
      if (tier.activityAmounts && (Object.keys(tier.activityAmounts).length !== p.activityIds.length || Object.keys(tier.activityAmounts).some(key => !p.activityIds.includes(key)) || Object.values(tier.activityAmounts).reduce((sum, value) => sum + value, 0) !== tier.amountCents)) issue('La ripartizione deve includere tutte le attività e corrispondere al prezzo', ['packages', i, 'prices', j, 'activityAmounts']);
    });
    const tiers = p.prices.map(t => ({ start: t.startsAt ? Date.parse(t.startsAt) : -Infinity, end: t.endsAt ? Date.parse(t.endsAt) : Infinity })).sort((a, b) => a.start - b.start);
    tiers.forEach((t, j) => { if (t.start >= t.end) issue('Intervallo di prezzo non valido', ['packages', i, 'prices']); if (j > 0 && tiers[j - 1].end > t.start) issue('Gli scaglioni non possono sovrapporsi', ['packages', i, 'prices']); });
  });
  config.addons.forEach((a, i) => { if (!activities.has(a.activityId)) issue('Attività inesistente', ['addons', i, 'activityId']); });
});

export const participantSchema = z.object({ firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), packageId: id, addonIds: z.array(id).max(30), menuChoices: z.record(id, name) }).strict().superRefine((p, ctx) => {
  if (new Set(p.addonIds).size !== p.addonIds.length) ctx.addIssue({ code: 'custom', message: 'Aggiunta duplicata', path: ['addonIds'] });
});
export const participantsSchema = z.array(participantSchema).min(1).max(20);

export function parseCommerceConfig(input: unknown): CommerceConfig | null {
  const parsed = configSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export function activePrice(prices: CommercePriceTier[], now = new Date()): CommercePriceTier | null {
  const instant = now.getTime();
  return prices.find(p => (!p.startsAt || Date.parse(p.startsAt) <= instant) && (!p.endsAt || instant < Date.parse(p.endsAt))) ?? null;
}

/** Historical packages without an allocation split cents equally in activity order. */
export function activityPriceAmounts(activityIds: string[], tier: Pick<CommercePriceTier, 'amountCents' | 'activityAmounts'>): Record<string, number> {
  if (tier.activityAmounts) return { ...tier.activityAmounts };
  const quotient = Math.floor(tier.amountCents / activityIds.length);
  const remainder = tier.amountCents % activityIds.length;
  return Object.fromEntries(activityIds.map((activityId, index) => [activityId, quotient + (index < remainder ? 1 : 0)]));
}

/** Client preview only: checkout always recalculates and locks prices in PostgreSQL. */
export function previewCommerceQuote(config: CommerceConfig, participants: CommerceParticipant[], now = new Date()): CommerceQuote | null {
  const parsed = participantsSchema.safeParse(participants);
  if (!config.enabled || !parsed.success) return null;
  const quote: CommerceQuote = { totalCents: 0, lines: [], participants: parsed.data };
  for (const [participantIndex, person] of parsed.data.entries()) {
    const pkg = config.packages.find(p => p.id === person.packageId);
    const tier = pkg && activePrice(pkg.prices, now);
    if (!pkg || !tier) return null;
    quote.lines.push({ label: `${pkg.name} · ${tier.label}`, quantity: 1, unitAmountCents: tier.amountCents, totalCents: tier.amountCents, kind: 'package', packageId: pkg.id, tierId: tier.id, activityIds: pkg.activityIds, participantIndex, activityAmounts: activityPriceAmounts(pkg.activityIds, tier) });
    const selected = new Set(pkg.activityIds);
    for (const addonId of person.addonIds) {
      const addon = config.addons.find(a => a.id === addonId);
      if (!addon || selected.has(addon.activityId)) return null;
      selected.add(addon.activityId);
      quote.lines.push({ label: addon.name, quantity: 1, unitAmountCents: addon.amountCents, totalCents: addon.amountCents, kind: 'addon', addonId: addon.id, tierId: tier.id, activityIds: [addon.activityId], participantIndex, activityAmounts: { [addon.activityId]: addon.amountCents } });
    }
    for (const activityId of selected) {
      const activity = config.activities.find(a => a.id === activityId);
      if (!activity || (activity.salesEnd && Date.parse(activity.salesEnd) <= now.getTime()) || (activity.startsAt && Date.parse(activity.startsAt) <= now.getTime())) return null;
      const choice = person.menuChoices[activityId];
      if (activity.menuOptions.length ? !activity.menuOptions.includes(choice) : Boolean(choice)) return null;
    }
    if (Object.keys(person.menuChoices).some(k => !selected.has(k))) return null;
  }
  quote.totalCents = quote.lines.reduce((sum, line) => sum + line.totalCents, 0);
  return quote.totalCents > 0 && quote.totalCents <= 10_000_000 ? quote : null;
}
