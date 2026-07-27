"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { sendTicketConfirmation } from "@/lib/resend/client";
import { stripe } from "@/lib/stripe/client";

export async function checkInTicket(ticketId: string) {
  await requireAdmin();
  const supabase = await createClient();
  
  // Verify auth and role
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "Unauthorized" };
  
  const adminSupabase = createAdminClient();
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();
    
  if (!profile || (profile.role !== "admin" && profile.role !== "editor")) {
    return { error: "Forbidden" };
  }

  const { data: checkedIn, error } = await adminSupabase
    .from("tickets")
    .update({ 
      status: 'used',
      used_at: new Date().toISOString()
    })
    .eq("id", ticketId)
    .eq("status", "paid")
    .select("id")
    .maybeSingle();

  if (error || !checkedIn) {
    console.error("Check-in error:", error);
    return { error: "Errore durante il check-in del biglietto." };
  }

  revalidatePath("/[locale]/admin/biglietti", "page");
  
  return { success: true };
}

export async function undoCheckInTicket(ticketId: string) {
  await requireAdmin();
  const adminSupabase = createAdminClient();
  const { data: restored, error } = await adminSupabase
    .from("tickets")
    .update({
      status: "paid",
      used_at: null,
    })
    .eq("id", ticketId)
    .eq("status", "used")
    .select("id")
    .maybeSingle();

  if (error || !restored) {
    console.error("Undo check-in error:", error);
    return { error: "Non è stato possibile annullare il check-in. Il biglietto potrebbe essere già stato modificato." };
  }

  revalidatePath("/[locale]/admin/biglietti", "page");
  return { success: true };
}

export async function getEventCheckInStats(eventId: string) {
  await requireAdmin();
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("tickets")
    .select("status")
    .eq("event_id", eventId);
  if (error) return { error: "Statistiche non disponibili." };
  const valid = (data || []).filter(ticket => ticket.status === "paid" || ticket.status === "used");
  const entered = valid.filter(ticket => ticket.status === "used").length;
  return {
    success: true,
    stats: {
      total: valid.length,
      entered,
      missing: Math.max(valid.length - entered, 0),
    },
  };
}

export async function checkInTicketByCode(qrCode: string, eventId: string) {
  await requireAdmin();
  const adminSupabase = createAdminClient();
  const submittedCode = qrCode.trim();
  if (!submittedCode || submittedCode.length > 100) return { error: "Codice non valido.", code: "invalid_code" };

  const { data: qrTicket, error: qrLookupError } = await adminSupabase
    .from("tickets")
    .select("id, event_id, status, used_at, buyer_nome, buyer_cognome, buyer_email")
    .eq("qr_code", submittedCode)
    .maybeSingle();
  if (qrLookupError) return { error: "Biglietto non trovato.", code: "not_found" };

  let ticket = qrTicket;
  if (!ticket && /^MK-[2-9A-HJ-NP-Z]{6}$/i.test(submittedCode)) {
    const { data: shortTicket, error: shortLookupError } = await adminSupabase
      .from("tickets")
      .select("id, event_id, status, used_at, buyer_nome, buyer_cognome, buyer_email")
      .eq("short_code", submittedCode.toUpperCase())
      .maybeSingle();
    if (shortLookupError) return { error: "Biglietto non trovato.", code: "not_found" };
    ticket = shortTicket;
  }
  if (!ticket) return { error: "Biglietto non trovato.", code: "not_found" };
  if (ticket.event_id !== eventId) return { error: "Il biglietto appartiene a un altro evento.", code: "wrong_event" };
  if (ticket.status === "used") return { error: "Questo biglietto è già stato utilizzato.", code: "already_used", usedAt: ticket.used_at };
  if (ticket.status !== "paid") return { error: "Questo biglietto non è valido per il check-in.", code: "invalid_status" };

  const usedAt = new Date().toISOString();
  const { data: checkedIn, error } = await adminSupabase
    .from("tickets")
    .update({ status: "used", used_at: usedAt })
    .eq("id", ticket.id)
    .eq("status", "paid")
    .select("id")
    .maybeSingle();
  if (error) return { error: "Check-in non riuscito.", code: "update_error" };
  if (!checkedIn) return { error: "Biglietto già convalidato da un altro dispositivo.", code: "already_used" };

  const statsResult = await getEventCheckInStats(eventId);
  revalidatePath("/[locale]/admin/biglietti", "page");
  return {
    success: true,
    ticket: {
      name: `${ticket.buyer_nome || ""} ${ticket.buyer_cognome || ""}`.trim() || ticket.buyer_email,
      email: ticket.buyer_email,
      usedAt,
    },
    stats: statsResult.stats,
  };
}

export async function resendTicketEmail(ticketId: string) {
  await requireAdmin();
  const adminSupabase = createAdminClient();
  const { data: ticket } = await adminSupabase
    .from("tickets")
    .select("*, event:events(*)")
    .eq("id", ticketId)
    .single();
  if (!ticket?.event) return { error: "Biglietto non trovato." };
  const result = await sendTicketConfirmation(ticket, ticket.event, ticket.locale || "it");
  if (!result?.success) return { error: "Invio email non riuscito. Controlla le impostazioni email." };
  await adminSupabase.from("tickets").update({ customer_email_sent_at: new Date().toISOString() }).eq("id", ticketId);
  return { success: true };
}

export async function cancelTicket(ticketId: string) {
  const identity = await requireAdmin();
  if (identity.role !== "admin") return { error: "Solo un amministratore può annullare una prenotazione." };

  const adminSupabase = createAdminClient();
  const { data: ticket, error: lookupError } = await adminSupabase
    .from("tickets")
    .select("id, event_id, status, amount_cents, stripe_payment_intent")
    .eq("id", ticketId)
    .single();

  if (lookupError || !ticket) return { error: "Biglietto non trovato." };
  if (ticket.status === "used") return { error: "Non puoi annullare un biglietto già utilizzato. Prima annulla il check-in." };
  if (ticket.status !== "paid") return { error: "Questo biglietto è già stato annullato o non è ancora valido." };

  try {
    if ((ticket.amount_cents || 0) > 0) {
      if (!ticket.stripe_payment_intent) return { error: "Pagamento Stripe non trovato: il rimborso non può essere eseguito automaticamente." };
      await stripe.refunds.create(
        { payment_intent: ticket.stripe_payment_intent },
        { idempotencyKey: `cancel-ticket-${ticket.id}` },
      );
    }

    const { error } = await (adminSupabase.rpc as any)("cancel_event_ticket", { p_ticket_id: ticket.id });
    if (error) {
      console.error("Cancel ticket database error:", error);
      return { error: "Il pagamento è stato elaborato, ma lo stato del biglietto non è stato aggiornato. Contatta l’assistenza." };
    }
  } catch (error) {
    console.error("Cancel ticket error:", error);
    return { error: "Annullamento non riuscito. Nessuna modifica è stata applicata al biglietto." };
  }

  revalidatePath("/[locale]/admin/biglietti", "page");
  revalidatePath("/[locale]/admin/eventi", "page");
  return { success: true, refunded: (ticket.amount_cents || 0) > 0 };
}
