"use server";

import { createClient, createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

interface TeamMemberData {
  id?: string;
  nome: string;
  cognome: string;
  ruolo: string;
  bio?: string;
  foto_url?: string;
  is_istruttore?: boolean;
  is_direttivo?: boolean;
  ordine_display?: number;
}

const generateSlug = (nome: string, cognome: string) => {
  return `${nome} ${cognome}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
};

export async function upsertTeamMember(data: TeamMemberData) {
  const supabase = await createClient();
  
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

  const payload: any = { ...data };
  if (!payload.id || payload.id === 'nuovo') {
    delete payload.id;
    payload.slug = generateSlug(payload.nome, payload.cognome);
  }

  const { error, data: savedMember } = await supabase
    .from("team_members")
    .upsert(payload)
    .select()
    .single();

  if (error) {
    console.error("Upsert team member error:", error);
    return { error: error.message };
  }

  revalidatePath("/[locale]/admin/impostazioni", "page");
  revalidatePath("/[locale]/admin/corsi/[id]", "page");
  revalidatePath("/[locale]/admin/corsi", "page");
  revalidatePath("/[locale]", "page");
  
  return { success: true, id: savedMember.id };
}

export async function deleteTeamMember(id: string) {
  const supabase = await createClient();
  
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
    .from("team_members")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Delete team member error:", error);
    return { error: error.message };
  }

  revalidatePath("/[locale]/admin/impostazioni", "page");
  revalidatePath("/[locale]/admin/corsi/[id]", "page");
  revalidatePath("/[locale]/admin/corsi", "page");
  revalidatePath("/[locale]", "page");
  
  return { success: true };
}
