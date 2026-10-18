export type WaitlistRow = {
  id: string; first_name: string; last_name: string; email: string;
  activity_ids: string[]; status: "waiting" | "notified" | "removed"; created_at: string;
};
export type CommerceSalesStats = {
  paidOrders: number; revenueCents: number; refundedCents: number; participants: number;
  packages: { id: string; name: string; count: number }[];
  tiers: { id: string; name: string; count: number }[];
  addons: { id: string; name: string; count: number }[];
};
