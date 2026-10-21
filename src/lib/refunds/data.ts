import "server-only";
import { commerceClient } from "@/lib/commerce/server";
import { getLocalizedText } from "@/lib/i18n-utils";
import type { RefundPanel, RefundPayment, RefundRow } from "./types";

export type RefundDb = ReturnType<typeof commerceClient>;
const held = new Set(["preparing", "pending", "requires_action", "unknown"]);

export async function refundRows<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await query(from, from + 499);
    if (error || !data) throw new Error("Impossibile leggere i rimborsi. Verifica la configurazione del database.");
    rows.push(...data as T[]);
    if (data.length < 500) return rows;
  }
}

type Event = { id: string; titolo: unknown; canceled_at: string | null; cancellation_reason: string | null };
type Payment = { id: string; buyer_email: string; amount_cents: number; state: string; created_at: string; stripe_payment_intent: string | null; stripe_session_id: string | null };
type Pass = { id: string; order_id: string; first_name: string; last_name: string };
type Right = { id: string; pass_id: string; order_id: string; activity_name: string; status: string };
type Ticket = { id: string; stripe_session_id: string | null; buyer_nome: string | null; buyer_cognome: string | null; status: string; stripe_payment_intent: string | null };

export async function loadRefundPanel(db: RefundDb, eventId: string | null, canManage: boolean): Promise<RefundPanel> {
  const events = await refundRows<Event>((from, to) => db.from("events").select("id,titolo,canceled_at,cancellation_reason").order("data_inizio", { ascending: false }).order("id").range(from, to));
  const summaries = events.map(event => ({ id: event.id, title: getLocalizedText(event.titolo, "it") || "Evento" }));
  const event = events.find(event => event.id === eventId) || (!eventId ? events[0] : null);
  if (!event) return { events: summaries, event: null, payments: [], cancellation: null, canManage };
  const [orders, reservations, passes, rights, tickets, refunds, cancellationResult] = await Promise.all([
    refundRows<Payment>((from, to) => db.from("commerce_orders").select("id,buyer_email,amount_cents,state,created_at,stripe_payment_intent,stripe_session_id").eq("event_id", event.id).order("created_at", { ascending: false }).order("id").range(from, to)),
    refundRows<Payment>((from, to) => db.from("ticket_reservations").select("id,buyer_email,amount_cents,state,created_at,stripe_payment_intent,stripe_session_id").eq("event_id", event.id).order("created_at", { ascending: false }).order("id").range(from, to)),
    refundRows<Pass>((from, to) => db.from("commerce_passes").select("id,order_id,first_name,last_name").eq("event_id", event.id).order("id").range(from, to)),
    refundRows<Right>((from, to) => db.from("commerce_entitlements").select("id,pass_id,order_id,activity_name,status").eq("event_id", event.id).order("id").range(from, to)),
    refundRows<Ticket>((from, to) => db.from("tickets").select("id,stripe_session_id,buyer_nome,buyer_cognome,status,stripe_payment_intent").eq("event_id", event.id).order("id").range(from, to)),
    refundRows<RefundRow>((from, to) => db.from("meraki_refunds").select("*").eq("event_id", event.id).order("created_at", { ascending: false }).order("id").range(from, to)),
    db.from("meraki_event_cancellations").select("id,status").eq("event_id", event.id).maybeSingle(),
  ]);
  if (cancellationResult.error) throw new Error("Impossibile leggere l’annullamento evento.");
  const payment = (row: Payment, kind: "commerce" | "legacy"): RefundPayment | null => {
    const ticket = kind === "legacy" ? tickets.find(ticket => ticket.stripe_session_id === row.stripe_session_id && row.stripe_session_id) : null;
    if (!(row.stripe_payment_intent || ticket?.stripe_payment_intent) || row.amount_cents <= 0) return null;
    const entries = refunds.filter(refund => (kind === "commerce" ? refund.order_id : refund.ticket_reservation_id) === row.id);
    const refundedCents = row.state === "refunded" ? row.amount_cents : entries.filter(refund => refund.status === "succeeded").reduce((sum, refund) => sum + refund.amount_cents, 0);
    const pendingCents = entries.filter(refund => held.has(refund.status)).reduce((sum, refund) => sum + refund.amount_cents, 0);
    const ownRights = rights.filter(right => right.order_id === row.id);
    const participants = kind === "commerce" ? passes.filter(pass => ownRights.some(right => right.pass_id === pass.id)).map(pass => ({ name: `${pass.first_name} ${pass.last_name}`.trim(), entitlements: ownRights.filter(right => right.pass_id === pass.id).map(right => ({ id: right.id, name: right.activity_name, status: right.status })) })) : [{ name: [ticket?.buyer_nome, ticket?.buyer_cognome].filter(Boolean).join(" ") || "Partecipante", entitlements: ticket ? [{ id: ticket.id, name: "Ingresso evento", status: ticket.status }] : [] }];
    return { id: row.id, kind, buyerEmail: row.buyer_email, amountCents: row.amount_cents, refundedCents, pendingCents, availableCents: Math.max(0, row.amount_cents - refundedCents - pendingCents), createdAt: row.created_at, participants,
      refunds: entries.map(refund => ({ id: refund.id, amountCents: refund.amount_cents, status: refund.status, reason: refund.reason, createdAt: refund.created_at, error: refund.failure_reason, emailSentAt: refund.email_sent_at })) };
  };
  const payments = [...orders.flatMap(row => payment(row, "commerce") || []), ...reservations.flatMap(row => payment(row, "legacy") || [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  let cancellation: RefundPanel["cancellation"] = null;
  if (cancellationResult.data) {
    const { count, error } = await db.from("meraki_cancellation_emails").select("id", { count: "exact", head: true }).eq("cancellation_id", cancellationResult.data.id).is("email_sent_at", null);
    if (error) throw new Error("Impossibile leggere le comunicazioni da inviare.");
    const pending = payments.filter(payment => payment.pendingCents > 0).length;
    const remaining = payments.filter(payment => payment.availableCents > 0).length;
    const failed = payments.filter(payment => payment.availableCents > 0 && payment.refunds.some(refund => refund.status === "failed" || refund.status === "canceled")).length;
    const completed = payments.filter(payment => payment.refundedCents >= payment.amountCents).length;
    const emailsRemaining = (count || 0) + refunds.filter(refund => refund.status === "succeeded" && !refund.email_sent_at).length;
    cancellation = { id: cancellationResult.data.id, status: remaining || pending || emailsRemaining ? "processing" : "completed", totalPayments: payments.length, completed, pending, remaining, failed, emailsRemaining };
  }
  return { events: summaries, event: { id: event.id, title: getLocalizedText(event.titolo, "it") || "Evento", canceledAt: event.canceled_at, cancellationReason: event.cancellation_reason }, payments, canManage, cancellation };
}
