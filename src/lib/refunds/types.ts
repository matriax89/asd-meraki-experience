export type RefundStatus = "preparing" | "pending" | "requires_action" | "succeeded" | "failed" | "canceled" | "unknown";
export type RefundRow = {
  id: string; request_id: string; event_id: string; order_id: string | null; ticket_reservation_id: string | null;
  payment_intent: string; amount_cents: number; reason: string; status: RefundStatus; stripe_refund_id: string | null;
  revoke_entitlement_ids: string[]; revoke_ticket: boolean; created_by: string | null; cancellation_id: string | null;
  failure_reason: string | null; full_remaining: boolean; created_at: string; updated_at: string; email_sent_at: string | null; email_claimed_at: string | null;
};
export type RefundPayment = {
  id: string; kind: "commerce" | "legacy"; buyerEmail: string; amountCents: number; refundedCents: number;
  pendingCents: number; availableCents: number; createdAt: string;
  participants: { name: string; entitlements: { id: string; name: string; status: string }[] }[];
  refunds: { id: string; amountCents: number; status: RefundStatus; reason: string; createdAt: string; error: string | null; emailSentAt: string | null }[];
};
export type RefundCancellation = {
  id: string; status: string; totalPayments: number; completed: number; pending: number; failed: number; remaining: number;
  emailsRemaining: number;
};
export type RefundPanel = {
  events: { id: string; title: string }[];
  event: { id: string; title: string; canceledAt: string | null; cancellationReason: string | null } | null;
  payments: RefundPayment[]; canManage: boolean; cancellation: RefundCancellation | null;
};
