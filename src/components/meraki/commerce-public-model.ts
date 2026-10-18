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

export function eligiblePackages(catalog: CommerceCatalog, upgrade?: CommerceUpgrade) {
  if (!upgrade) return catalog.config.packages;
  const current = catalog.config.packages.find((item) => item.id === upgrade.packageId);
  const base = current?.activityIds || upgrade.activityIds.filter((id) => !catalog.config.addons.some((addon) => addon.activityId === id));
  return catalog.config.packages.filter((item) => base.every((id) => item.activityIds.includes(id)));
}

export function safeCommerceRedirect(value: unknown, origin: string) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, origin);
    return (url.protocol === "https:" && url.hostname === "checkout.stripe.com") || (url.origin === origin && url.pathname === "/api/checkout/success") ? url.href : null;
  } catch { return null; }
}
