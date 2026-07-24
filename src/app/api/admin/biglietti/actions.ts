"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";

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
