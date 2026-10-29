export type AdminAnalyticsPeriod = "7" | "30" | "90" | "all" | "custom";
export type AdminAnalyticsInput = { locale: string; eventId?: string; period?: AdminAnalyticsPeriod; from?: string; to?: string; affiliateId?: string };
export type AnalyticsFinancials = {
  grossCents: number; refundedCents: number;
  /** Captured revenue less refunds, before payment processing fees. */
  netCents: number;
  /** Sum of verified fees; may be partial when missingFeePayments is positive. */
  feesCents: number;
  netAfterFeesCents: number | null;
  missingFeePayments: number;
};
export type AnalyticsSummary = AnalyticsFinancials & {
  /** Active people, counted once per event in the current formula or dinner. */
  count: number;
};
export type AnalyticsSummaryPartitions = {
  registrationSummary: AnalyticsSummary;
  dinnerSummary: AnalyticsSummary;
};
export type AnalyticsRevenueRow = AnalyticsFinancials & {
  id: "masterclass" | "workshop" | "dinner" | "extra" | "unallocated";
  name: string;
};
export type AnalyticsMetrics = AnalyticsFinancials & {
  /** Captured orders with a positive amount remaining after successful refunds, including additions and upgrades. */
  paidOrders: number;
  validParticipants: number; checkedInParticipants: number; waiting: number | null;
  pendingOrders: number; expiredOrders: number; failedOrders: number;
};
export type AnalyticsBreakdown = {
  id: string; name: string; count: number;
  /** Cumulative receipts for the current formula or active addition, less successful refunds and before payment fees. */
  netCents: number;
};
export type AnalyticsActivityRow = {
  id: string; eventId: string; eventTitle: string; name: string; capacity: number | null;
  validAdmissions: number; checkedIn: number; remaining: number | null;
  occupied: number; reservedAdmissions: number; availableForSale: number | null;
};
export type AnalyticsAttendanceGroup = {
  eventId: string; eventTitle: string; currentParticipants: number;
  workshopOnly: number; masterclassOnly: number; both: number; otherParticipants: number;
  capacity: number | null; remaining: number | null; reservedParticipants: number;
};
export type AnalyticsAffiliateRow = AnalyticsFinancials & AnalyticsSummaryPartitions & {
  id: string; eventId: string; eventTitle: string; name: string; validParticipants: number; checkedInParticipants: number;
  paidOrders: number; commissionPerParticipantCents: number; commissionCents: number;
  commissionType: "eur" | "credits"; commissionPerParticipantCredits: number; commissionCredits: number;
};
export type AnalyticsEventRow = AnalyticsMetrics & AnalyticsSummaryPartitions & {
  id: string; title: string; startsAt: string; endsAt: string | null;
  status: "draft" | "upcoming" | "ongoing" | "past" | "canceled";
  capacity: number | null; remaining: number | null;
};
export type AdminAnalytics = AnalyticsSummaryPartitions & {
  filters: { eventId: string; period: AdminAnalyticsPeriod; from: string; to: string; affiliateId: string };
  events: { id: string; title: string; startsAt: string }[];
  affiliateOptions: { id: string; name: string }[];
  metrics: AnalyticsMetrics;
  operations: { newLeads: number; openShopOrders: number; confirmedContacts: number };
  trend: (AnalyticsFinancials & AnalyticsSummaryPartitions & { date: string; paidOrders: number })[];
  revenue: AnalyticsRevenueRow[];
  packages: AnalyticsBreakdown[]; tiers: AnalyticsBreakdown[]; addons: AnalyticsBreakdown[];
  activities: AnalyticsActivityRow[]; affiliates: AnalyticsAffiliateRow[]; eventStats: AnalyticsEventRow[];
  attendanceGroups: AnalyticsAttendanceGroup[];
  notes: string[];
};
