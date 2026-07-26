"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { getLocalizedText } from "@/lib/i18n-utils";
import { sendEventCommunication, type EventCommunicationType } from "@/lib/resend/client";
import { stripe } from "@/lib/stripe/client";

export async function getEvent(id: string) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching event:", error);
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

export async function upsertEvent(eventData: any) {
  await requireAdmin();
  const supabase = createAdminClient();
  
  const start = new Date(eventData.data_inizio);
  const end = eventData.data_fine ? new Date(eventData.data_fine) : null;
  if (Number.isNaN(start.getTime())) return { success: false, error: "Data di inizio non valida." };
  if (end && (Number.isNaN(end.getTime()) || end <= start)) return { success: false, error: "La data di fine deve essere successiva all’inizio." };
  if (eventData.capacity !== null && (!Number.isInteger(eventData.capacity) || eventData.capacity < 1)) return { success: false, error: "La capienza deve essere almeno 1." };
  if (eventData.prezzo_cents !== null && eventData.prezzo_cents < 0) return { success: false, error: "Il prezzo non può essere negativo." };

  // Create slug if new
  let slug = eventData.slug;
  if (!eventData.id && !slug && eventData.titolo) {
    slug = getLocalizedText(eventData.titolo, "it")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
      
    // Append random string to avoid collisions
    slug += "-" + Math.random().toString(36).substring(2, 6);
  }

  const payload = {
    ...eventData,
    ...(slug ? { slug } : {}),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("events")
    .upsert(payload)
    .select()
    .single();

  if (error) {
    console.error("Error saving event:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/[locale]/admin/eventi", "page");
  revalidatePath("/[locale]/eventi", "page");
  revalidatePath("/[locale]/workshop", "page");
  return { success: true, id: data.id };
}

export async function deleteEvent(id: string) {
  await requireAdmin();
  const supabase = createAdminClient();
  
  // Check if there are tickets
  const { count, error: countError } = await supabase
    .from("tickets")
    .select("*", { count: 'exact', head: true })
    .eq("event_id", id);
    
  if (countError) {
    return { success: false, error: countError.message };
  }
  
  if (count && count > 0) {
    return { success: false, error: "Non puoi eliminare un evento che ha dei biglietti venduti. Disattivalo invece." };
  }

  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting event:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/[locale]/admin/eventi", "page");
  revalidatePath("/[locale]/eventi", "page");
  revalidatePath("/[locale]/workshop", "page");
  return { success: true };
}

export async function sendEventCommunicationToAttendees(
  eventId: string,
  type: EventCommunicationType,
) {
  const identity = await requireAdmin();
  if (!["reminder", "update", "cancelled", "thank_you"].includes(type)) {
    return { success: false, error: "Tipo di comunicazione non valido." };
  }
  const supabase = createAdminClient();
  const [{ data: event }, { data: tickets, error }] = await Promise.all([
    supabase.from("events").select("*").eq("id", eventId).single(),
    supabase
      .from("tickets")
      .select("*")
      .eq("event_id", eventId)
      .in("status", type === "thank_you" ? ["used"] : ["paid", "used"]),
  ]);
  if (!event) return { success: false, error: "Evento non trovato." };
  if (error) return { success: false, error: error.message };
  if (!tickets?.length) {
    return { success: false, error: type === "thank_you" ? "Nessun partecipante entrato." : "Nessun partecipante da avvisare." };
  }

  let sent = 0;
  let failed = 0;
  for (let index = 0; index < tickets.length; index += 10) {
    const results = await Promise.all(
      tickets.slice(index, index + 10).map((ticket) => sendEventCommunication(ticket, event, type)),
    );
    sent += results.filter((result) => result.success).length;
    failed += results.filter((result) => !result.success).length;
  }
  await (supabase as any).from("event_communications").insert({
    event_id: eventId,
    communication_type: type,
    recipient_count: tickets.length,
    sent_count: sent,
    failed_count: failed,
    created_by: identity.id,
  });
  return {
    success: failed === 0,
    sent,
    failed,
    error: sent === 0 ? "Nessuna email è stata inviata. Controlla le impostazioni email." : undefined,
  };
}

export async function duplicateEvent(id: string) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data: source } = await supabase.from("events").select("*").eq("id", id).single();
  if (!source) return { error: "Evento non trovato." };
  const sourceData = source as any;
  const start = new Date(sourceData.data_inizio);
  const end = sourceData.data_fine ? new Date(sourceData.data_fine) : null;
  const duration = end ? end.getTime() - start.getTime() : null;
  const nextStart = start.getTime() > Date.now()
    ? new Date(start.getTime() + 7 * 86_400_000)
    : new Date(Date.now() + 7 * 86_400_000);
  const nextEnd = duration ? new Date(nextStart.getTime() + duration) : null;
  const title = typeof sourceData.titolo === "object"
    ? Object.fromEntries(Object.entries(sourceData.titolo).map(([locale, value]) => [locale, `${value} — Copia`]))
    : `${sourceData.titolo} — Copia`;
  const payload = {
    ...sourceData,
    id: undefined,
    titolo: title,
    slug: `${sourceData.slug}-copia-${Math.random().toString(36).slice(2, 6)}`,
    data_inizio: nextStart.toISOString(),
    data_fine: nextEnd?.toISOString() || null,
    posti_venduti: 0,
    stripe_price_id: null,
    attivo: false,
    cancelled_at: null,
    duplicated_from: id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("events").insert(payload).select("id").single();
  if (error || !data) return { error: error?.message || "Duplicazione non riuscita." };
  revalidatePath("/[locale]/admin/eventi", "page");
  return { success: true, id: data.id };
}

export async function getEventCommunicationHistory(eventId: string) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data, error } = await (supabase as any)
    .from("event_communications")
    .select("id, communication_type, recipient_count, sent_count, failed_count, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(20);
  return error ? { error: error.message, data: [] } : { data: data || [] };
}

export async function exportEventAttendees(eventId: string) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data: event } = await supabase.from("events").select("slug").eq("id", eventId).single();
  const { data: tickets, error } = await supabase
    .from("tickets")
    .select("buyer_nome, buyer_cognome, buyer_email, buyer_telefono, status, amount_cents, used_at, created_at, qr_code")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) return { error: error.message };
  const quote = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [
    ["Nome", "Cognome", "Email", "Telefono", "Stato", "Importo EUR", "Check-in", "Iscritto il", "Codice QR"],
    ...(tickets || []).map((ticket) => [
      ticket.buyer_nome,
      ticket.buyer_cognome,
      ticket.buyer_email,
      ticket.buyer_telefono,
      ticket.status,
      ((ticket.amount_cents || 0) / 100).toFixed(2),
      ticket.used_at,
      ticket.created_at,
      ticket.qr_code,
    ]),
  ];
  return {
    success: true,
    filename: `partecipanti-${event?.slug || eventId}.csv`,
    csv: "\uFEFF" + rows.map((row) => row.map(quote).join(";")).join("\n"),
  };
}

export async function cancelEventAndRefund(eventId: string) {
  const identity = await requireAdmin();
  if (identity.role !== "admin") return { error: "Solo un amministratore può annullare e rimborsare un evento." };
  const supabase = createAdminClient();
  const [{ data: event }, { data: tickets, error }] = await Promise.all([
    supabase.from("events").select("*").eq("id", eventId).single(),
    supabase.from("tickets").select("*").eq("event_id", eventId).eq("status", "paid"),
  ]);
  if (!event) return { error: "Evento non trovato." };
  if (error) return { error: error.message };

  let refunded = 0;
  let failed = 0;
  for (const ticket of tickets || []) {
    try {
      if (ticket.stripe_payment_intent && (ticket.amount_cents || 0) > 0) {
        await stripe.refunds.create(
          { payment_intent: ticket.stripe_payment_intent },
          { idempotencyKey: `cancel-event-${eventId}-${ticket.id}` },
        );
      }
      await supabase.from("tickets").update({ status: "refunded" }).eq("id", ticket.id);
      refunded += 1;
    } catch (refundError) {
      failed += 1;
      console.error("Event ticket refund failed", ticket.id, refundError);
    }
  }

  const communicationResults = await Promise.all(
    (tickets || []).map((ticket) => sendEventCommunication(ticket, event, "cancelled")),
  );
  const emailsSent = communicationResults.filter((result) => result.success).length;
  await Promise.all([
    supabase.from("events").update({ attivo: false, cancelled_at: new Date().toISOString() } as any).eq("id", eventId),
    (supabase as any).from("event_communications").insert({
      event_id: eventId,
      communication_type: "cancelled",
      recipient_count: tickets?.length || 0,
      sent_count: emailsSent,
      failed_count: (tickets?.length || 0) - emailsSent,
      created_by: identity.id,
    }),
  ]);
  revalidatePath("/[locale]/admin/eventi", "page");
  revalidatePath("/[locale]/eventi", "page");
  return { success: failed === 0, refunded, failed, emailsSent };
}
