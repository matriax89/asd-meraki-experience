import { commerceClient, missingCommerceMigration } from "./server";
import { activePrice, parseCommerceConfig } from "./config";
import type { EventPackagePrice, MerakiEvent } from "@/components/meraki/event-model";

/** One optional bulk read keeps legacy feeds usable before schema rollout. */
export async function enrichCommerceFeed(events: MerakiEvent[]): Promise<MerakiEvent[]> {
  if (!events.length) return events;
  const { data, error } = await commerceClient().from("events").select("id,commerce_config,cta_tipo").in("id", events.map(event => event.id));
  if (error) {
    if (!missingCommerceMigration(error)) console.error("Commerce feed prices temporarily unavailable.");
    return events;
  }
  const now = new Date();
  const rows = new Map(data?.map(row => [row.id, row]));
  return events.map(event => {
    const row = rows.get(event.id);
    const config = row && (row.cta_tipo || "stripe") === "stripe" ? parseCommerceConfig(row.commerce_config) : null;
    if (!config?.enabled) return event;
    const packagePrices: EventPackagePrice[] = config.packages.map(pkg => {
      const closingTimes = config.activities.filter(activity => pkg.activityIds.includes(activity.id))
        .flatMap(activity => [activity.salesEnd, activity.startsAt])
        .filter((value): value is string => value !== null)
        .map(value => Date.parse(value)).filter(Number.isFinite);
      const salesCloseAt = closingTimes.length ? new Date(Math.min(...closingTimes)).toISOString() : null;
      return {
        id: pkg.id,
        name: pkg.name,
        activityIds: [...pkg.activityIds],
        ...(pkg.nameTranslations && { nameTranslations: pkg.nameTranslations }),
        prices: pkg.prices.map(tier => ({
          id: tier.id,
          label: tier.label,
          ...(tier.labelTranslations && { labelTranslations: tier.labelTranslations }),
          amountCents: tier.amountCents,
          startsAt: tier.startsAt,
          endsAt: tier.endsAt,
        })),
        salesCloseAt,
      };
    });
    const prices = packagePrices.filter(pkg => !pkg.salesCloseAt || Date.parse(pkg.salesCloseAt) > now.getTime())
      .map(pkg => activePrice(pkg.prices, now)?.amountCents).filter((price): price is number => price !== undefined);
    return { ...event, price: prices.length ? Math.min(...prices) : null, priceFrom: true, packagePrices };
  });
}
