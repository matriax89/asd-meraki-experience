"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";

export async function updateLeadStatus(id: string, status: 'nuovo' | 'contattato' | 'convertito' | 'archiviato') {
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

export async function deleteLead(id: string) {
  await requireAdmin();
  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase.from("leads").delete().eq("id", id);

  if (error) {
    console.error("Delete lead error:", error);
    return { error: "Non è stato possibile eliminare il lead." };
  }

  revalidatePath("/[locale]/admin/leads", "page");
  revalidatePath("/[locale]/admin", "page");
  return { success: true };
}
