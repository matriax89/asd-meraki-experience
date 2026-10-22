export type AdminAnalyticsPeriod = "7" | "30" | "90" | "all" | "custom";
export type AdminAnalyticsInput = { locale: string; eventId?: string; period?: AdminAnalyticsPeriod; from?: string; to?: string; affiliateId?: string };
export type AnalyticsMetrics = {
  grossCents: number; refundedCents: number; netCents: number; paidOrders: number;
  validParticipants: number; checkedInParticipants: number; waiting: number | null;
  pendingOrders: number; expiredOrders: number; failedOrders: number;
};
export type AnalyticsBreakdown = { id: string; name: string; count: number; grossCents: number };
export type AnalyticsActivityRow = { id: string; eventId: string; eventTitle: string; name: string; capacity: number | null; validAdmissions: number; checkedIn: number; remaining: number | null };
export type AnalyticsAffiliateRow = {
  id: string; eventId: string; eventTitle: string; name: string; validParticipants: number; checkedInParticipants: number;
  paidOrders: number; grossCents: number; refundedCents: number; netCents: number;
};
export type AnalyticsEventRow = AnalyticsMetrics & {
  id: string; title: string; startsAt: string; endsAt: string | null;
  status: "draft" | "upcoming" | "ongoing" | "past" | "canceled";
  capacity: number | null; remaining: number | null;
};
export type AdminAnalytics = {
  filters: { eventId: string; period: AdminAnalyticsPeriod; from: string; to: string; affiliateId: string };
  events: { id: string; title: string; startsAt: string }[];
  affiliateOptions: { id: string; name: string }[];
  metrics: AnalyticsMetrics;
  operations: { newLeads: number; openShopOrders: number; confirmedContacts: number };
  trend: { date: string; grossCents: number; refundedCents: number; netCents: number; paidOrders: number }[];
  packages: AnalyticsBreakdown[]; tiers: AnalyticsBreakdown[]; addons: AnalyticsBreakdown[];
  activities: AnalyticsActivityRow[]; affiliates: AnalyticsAffiliateRow[]; eventStats: AnalyticsEventRow[];
  notes: string[];
};
