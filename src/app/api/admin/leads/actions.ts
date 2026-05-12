"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateLeadStatus(id: string, status: 'nuovo' | 'contattato' | 'convertito' | 'archiviato') {
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
    .from("leads")
    .update({ status })
    .eq("id", id);

  if (error) {
    console.error("Update lead error:", error);
    return { error: "Errore durante l'aggiornamento dello stato." };
  }

  revalidatePath("/[locale]/admin/leads", "page");
  revalidatePath("/[locale]/admin", "page");
  
  return { success: true };
}
