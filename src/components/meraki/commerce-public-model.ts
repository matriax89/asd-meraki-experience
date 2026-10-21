import type { CommerceConfig } from "@/lib/commerce/types";

export type CommerceParticipant = {
  firstName: string;
  lastName: string;
  packageId: string;
  addonIds: string[];
  menuChoices: Record<string, string>;
};

export type CommerceCatalog = {
  config: CommerceConfig;
  affiliates?: { id: string; name: string }[];
  availability: Record<string, number | null>;
  available: boolean;
  event: { id: string; title: string; date: string };
};

export type CommerceUpgrade = {
  passId: string;
  token: string;
  firstName: string;
  lastName: string;
  packageId: string;
  activityIds: string[];
  contact?: { email: string; phone?: string; documentType?: "codice_fiscale" | "foreign_id"; documentCountry?: string };
};

export function currentTier(prices: CommerceConfig["packages"][number]["prices"], now = Date.now()) {
  return prices.find((price) => (!price.startsAt || Date.parse(price.startsAt) <= now) && (!price.endsAt || Date.parse(price.endsAt) > now));
}

/** Compare only the next scheduled price; later increases cannot inflate savings. */
export function nextTierComparison(prices: CommerceConfig["packages"][number]["prices"], now = Date.now()) {
  if (!Number.isFinite(now)) return null;
  const current = currentTier(prices, now);
  if (!current?.endsAt) return null;
  const endsAt = Date.parse(current.endsAt);
  if (!Number.isFinite(endsAt)) return null;
  const next = prices.filter((price) => price.startsAt && Date.parse(price.startsAt) >= endsAt && Date.parse(price.startsAt) > now)
    .sort((left, right) => Date.parse(left.startsAt!) - Date.parse(right.startsAt!))[0];
  if (!next || ![current.amountCents, next.amountCents].every((amount) => Number.isSafeInteger(amount) && amount >= 0)) return null;
  const savingCents = Math.max(0, next.amountCents - current.amountCents);
  const savingPercent = next.amountCents > 0 ? Number(BigInt(savingCents) * BigInt(1000) / BigInt(next.amountCents)) / 10 : 0;
  return { current, next, savingCents, savingPercent };
}

export function packageSavings(config: CommerceConfig, packageId: string, now = Date.now()) {
  const bundle = config.packages.find((item) => item.id === packageId);
  const tier = bundle && currentTier(bundle.prices, now);
  if (!bundle || !tier || bundle.activityIds.length < 2) return 0;
  let total = 0;
  for (const id of bundle.activityIds) {
    const soloPrices = config.packages.filter((item) => item.activityIds.length === 1 && item.activityIds[0] === id).map((item) => currentTier(item.prices, now)?.amountCents).filter((amount): amount is number => amount !== undefined);
    if (!soloPrices.length) return 0;
    total += Math.min(...soloPrices);
  }
  return Math.max(0, total - tier.amountCents);
}

export function packageAvailable(catalog: CommerceCatalog, packageId: string, existingIds: string[] = [], now = Date.now()) {
  if (!existingIds.length && catalog.availability._event === 0) return false;
  const offer = catalog.config.packages.find((item) => item.id === packageId);
  if (!offer || (!currentTier(offer.prices, now) && !offer.activityIds.every((id) => existingIds.includes(id)))) return false;
  return offer.activityIds.every((id) => {
    if (existingIds.includes(id)) return true;
    return activityAvailable(catalog, id, now);
  });
}

export function activityAvailable(catalog: CommerceCatalog, id: string, now = Date.now()) {
  const activity = catalog.config.activities.find((item) => item.id === id);
  return !!activity && (!activity.startsAt || Date.parse(activity.startsAt) > now) && (!activity.salesEnd || Date.parse(activity.salesEnd) > now) && catalog.availability[id] !== 0;
}

/** Show complete experiences first, preserving the configured order within each group. */
export function prioritizePackages<T extends { activityIds?: readonly string[] }>(items: readonly T[]): T[] {
  return [...items.filter((item) => (item.activityIds?.length || 0) > 1), ...items.filter((item) => (item.activityIds?.length || 0) <= 1)];
}

export function eligiblePackages(catalog: CommerceCatalog, upgrade?: CommerceUpgrade) {
  if (!upgrade) return prioritizePackages(catalog.config.packages);
  const current = catalog.config.packages.find((item) => item.id === upgrade.packageId);
  const base = current?.activityIds || upgrade.activityIds.filter((id) => !catalog.config.addons.some((addon) => addon.activityId === id));
  return prioritizePackages(catalog.config.packages.filter((item) => base.every((id) => item.activityIds.includes(id))));
}

export function safeCommerceRedirect(value: unknown, origin: string) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, origin);
    if (url.username || url.password) return null;
    const stripeCheckout = url.protocol === "https:" && !url.port
      && ["checkout.stripe.com", "pay.merakiexperience.org"].includes(url.hostname);
    const localSuccess = url.origin === origin && url.pathname === "/api/checkout/success";
    return stripeCheckout || localSuccess ? url.href : null;
  } catch { return null; }
}
