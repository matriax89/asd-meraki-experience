"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { sendTicketConfirmation } from "@/lib/resend/client";

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
  const { data: ticket, error: lookupError } = await adminSupabase
    .from("tickets")
    .select("id, event_id, status, used_at, buyer_nome, buyer_cognome, buyer_email")
    .eq("qr_code", qrCode.trim())
    .maybeSingle();
  if (lookupError || !ticket) return { error: "Biglietto non trovato.", code: "not_found" };
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
