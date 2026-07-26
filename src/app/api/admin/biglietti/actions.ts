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

  const { error } = await supabase
    .from("tickets")
    .update({ 
      status: 'used',
      used_at: new Date().toISOString()
    })
    .eq("id", ticketId)
    .eq("status", "paid"); // Ensure we only check-in paid tickets

  if (error) {
    console.error("Check-in error:", error);
    return { error: "Errore durante il check-in del biglietto." };
  }

  revalidatePath("/[locale]/admin/biglietti", "page");
  
  return { success: true };
}

export async function checkInTicketByCode(qrCode: string) {
  await requireAdmin();
  const adminSupabase = createAdminClient();
  const { data: ticket, error: lookupError } = await adminSupabase
    .from("tickets")
    .select("id, status")
    .eq("qr_code", qrCode.trim())
    .maybeSingle();
  if (lookupError || !ticket) return { error: "Biglietto non trovato." };
  if (ticket.status === "used") return { error: "Questo biglietto è già stato utilizzato." };
  if (ticket.status !== "paid") return { error: "Questo biglietto non è valido per il check-in." };

  const { error } = await adminSupabase
    .from("tickets")
    .update({ status: "used", used_at: new Date().toISOString() })
    .eq("id", ticket.id)
    .eq("status", "paid");
  if (error) return { error: "Check-in non riuscito." };
  revalidatePath("/[locale]/admin/biglietti", "page");
  return { success: true };
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
