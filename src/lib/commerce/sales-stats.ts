import type { CommerceSalesStats } from "./admin-types";
import type { CommerceOrder, CommercePass, CommerceQuoteLine } from "./types";

type StatsOrder = Pick<CommerceOrder, "state" | "amount_cents" | "quote">;
type StatsPass = Pick<CommercePass, "status">;

export function calculateCommerceSalesStats(orders: StatsOrder[], passes: StatsPass[]): CommerceSalesStats {
  const stats: CommerceSalesStats = { paidOrders: 0, revenueCents: 0, refundedCents: 0, participants: passes.filter((pass) => pass.status === "paid").length, packages: [], tiers: [], addons: [] };
  const counters = { packages: new Map<string, { id: string; name: string; count: number }>(), tiers: new Map<string, { id: string; name: string; count: number }>(), addons: new Map<string, { id: string; name: string; count: number }>() };
  const increment = (kind: keyof typeof counters, id: string, name: string, count: number) => {
    const current = counters[kind].get(id) || { id, name, count: 0 };
    current.count += count; counters[kind].set(id, current);
  };
  for (const order of orders) {
    if (order.state === "refunded") stats.refundedCents += order.amount_cents;
    if (order.state !== "fulfilled") continue;
    stats.paidOrders += 1; stats.revenueCents += order.amount_cents;
    for (const line of order.quote?.lines || []) {
      if (!Number.isInteger(line.quantity) || line.quantity < 1) continue;
      if (line.kind === "addon") {
        increment("addons", line.activityIds.join("+"), line.label, line.quantity);
      } else if (line.kind === "package" || line.kind === "upgrade") {
        // Adding dinner to the same package is an extra sale, not another
        // sale of the already owned workshop.
        if (line.kind === "upgrade" && line.tierId === "owned") continue;
        const packageId = line.packageId || line.label;
        increment("packages", packageId, packageName(line), line.quantity);
        if (line.tierId) increment("tiers", `${packageId}:${line.tierId}`, line.label, line.quantity);
      }
    }
  }
  stats.packages = [...counters.packages.values()]; stats.tiers = [...counters.tiers.values()]; stats.addons = [...counters.addons.values()];
  return stats;
}
function packageName(line: CommerceQuoteLine) { return line.label.split(" · ")[0] || line.label; }
