import { commerceClient, missingCommerceMigration } from "./server";
import { activePrice, parseCommerceConfig } from "./config";
import type { MerakiEvent } from "@/components/meraki/event-model";

/** One optional bulk read keeps legacy feeds usable before schema rollout. */
export async function enrichCommerceFeed(events: MerakiEvent[]): Promise<MerakiEvent[]> {
  if (!events.length) return events;
  const { data, error } = await commerceClient().from("events").select("id,commerce_config,cta_tipo").in("id", events.map(event => event.id));
  if (error) {
    if (!missingCommerceMigration(error)) console.error("Commerce feed prices temporarily unavailable.");
    return events;
  }
  const now = new Date();
  return events.map(event => {
    const row = data?.find(row => row.id === event.id);
    const config = row && (row.cta_tipo || "stripe") === "stripe" ? parseCommerceConfig(row.commerce_config) : null;
    if (!config?.enabled) return event;
    const prices = config.packages.map(pkg => activePrice(pkg.prices, now)?.amountCents).filter((price): price is number => price !== undefined);
    return { ...event, price: prices.length ? Math.min(...prices) : null, priceFrom: true };
  });
}
