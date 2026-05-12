"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function checkInTicket(ticketId: string) {
  const supabase = await createClient();
  
  // Verify auth and role
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "Unauthorized" };
  
  const { data: profile } = await supabase
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
