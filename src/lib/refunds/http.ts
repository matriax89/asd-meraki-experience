import { NextResponse } from "next/server";
import { z } from "zod";
import { RefundAccessError, requireRefundOrigin, requireRefundAccess } from "./auth";
import { loadRefundPanel } from "./data";
import { createMerakiRefund, executeMerakiRefund, processRefundBatch } from "./service";
import type { RefundRow } from "./types";

const uuid = z.string().uuid();
const reason = z.string().trim().min(3).max(1000);
const inputSchema = z.object({ requestId: uuid, orderId: uuid.optional(), ticketReservationId: uuid.optional(), amountCents: z.number().int().positive().max(100000000), reason,
  entitlementIds: z.array(uuid).max(300), expectedAvailableCents: z.number().int().positive().max(100000000), confirm: z.literal(true), confirmUsed: z.boolean().optional() }).strict().refine(input => Boolean(input.orderId) !== Boolean(input.ticketReservationId));
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const errorReply = (error: unknown) => reply({ error: error instanceof z.ZodError ? "Controlla i dati e la conferma dell’operazione." : error instanceof Error ? error.message : "Operazione non completata. Ricarica e verifica lo stato prima di riprovare." }, error instanceof RefundAccessError ? 403 : 400);
async function json(request: Request) {
  const body = await request.text();
  if (body.length > 20000) throw new Error("Richiesta troppo grande.");
  return JSON.parse(body) as unknown;
}

export async function getRefunds(request: Request) {
  try {
    const { db, canManage } = await requireRefundAccess();
    const rawId = new URL(request.url).searchParams.get("eventId");
    return reply(await loadRefundPanel(db, rawId ? uuid.parse(rawId) : null, canManage));
  } catch (error) { return errorReply(error); }
}

export async function postRefund(request: Request) {
  try {
    requireRefundOrigin(request);
    const { db, userId } = await requireRefundAccess(true);
    const input = inputSchema.parse(await json(request));
    if (input.orderId) {
      const [rights, payment, ledger] = await Promise.all([
        db.from("commerce_entitlements").select("id,status").eq("order_id", input.orderId),
        db.from("commerce_orders").select("amount_cents").eq("id", input.orderId).single(),
        db.from("meraki_refunds").select("amount_cents,status").eq("order_id", input.orderId).in("status", ["succeeded", "pending", "preparing", "requires_action", "unknown"]),
      ]);
      if (rights.error || payment.error || ledger.error) throw new Error("Impossibile verificare gli accessi da revocare.");
      const remaining = payment.data!.amount_cents - (ledger.data || []).reduce((sum, row) => sum + row.amount_cents, 0);
      const fullRemaining = input.amountCents >= remaining;
      if (!input.confirmUsed && (rights.data || []).some(right => right.status === "used" && (fullRemaining || input.entitlementIds.includes(right.id)))) throw new Error("Alcuni accessi sono già stati utilizzati: conferma esplicitamente la loro revoca.");
    } else {
      const reservation = await db.from("ticket_reservations").select("stripe_session_id,amount_cents").eq("id", input.ticketReservationId!).single();
      if (reservation.error) throw new Error("Biglietto non disponibile.");
      const ticket = await db.from("tickets").select("status").eq("stripe_session_id", reservation.data!.stripe_session_id).maybeSingle();
      if (ticket.error) throw new Error("Impossibile verificare l’utilizzo del biglietto.");
      if (!input.confirmUsed && ticket.data?.status === "used") throw new Error("Il biglietto è già stato utilizzato: conferma esplicitamente il rimborso.");
    }
    return reply({ refund: await createMerakiRefund(input, userId, db) });
  } catch (error) { return errorReply(error); }
}

export async function postCancellation(request: Request) {
  try {
    requireRefundOrigin(request);
    const { db, userId } = await requireRefundAccess(true);
    const input = z.object({ eventId: uuid, reason, confirmTitle: z.string().min(1).max(500), requestId: uuid.optional() }).strict().parse(await json(request));
    const panel = await loadRefundPanel(db, input.eventId, true);
    if (!panel.event || input.confirmTitle.trim() !== panel.event.title) throw new Error("Scrivi esattamente il titolo dell’evento per confermare l’annullamento.");
    const result = await db.rpc("begin_meraki_event_cancellation", { p_event_id: input.eventId, p_reason: input.reason, p_created_by: userId });
    if (result.error) throw new Error("Annullamento non confermato. Ricarica e controlla lo stato dell’evento.");
    return reply({ cancellation: result.data });
  } catch (error) { return errorReply(error); }
}

export async function postProcess(request: Request) {
  try {
    requireRefundOrigin(request);
    const { db, userId } = await requireRefundAccess(true);
    const { eventId } = z.object({ eventId: uuid }).strict().parse(await json(request));
    return reply(await processRefundBatch(eventId, userId, db));
  } catch (error) { return errorReply(error); }
}

export async function postRetry(request: Request) {
  try {
    requireRefundOrigin(request);
    const { db } = await requireRefundAccess(true);
    const { refundId } = z.object({ refundId: uuid }).strict().parse(await json(request));
    const row = await db.from("meraki_refunds").select("*").eq("id", refundId).single();
    if (row.error || !row.data) throw new Error("Richiesta di rimborso non trovata.");
    return reply({ refund: await executeMerakiRefund(row.data as RefundRow, db) });
  } catch (error) { return errorReply(error); }
}
