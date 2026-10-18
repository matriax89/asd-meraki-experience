import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/** Verify the authenticated identity before reading private commerce tables. */
export async function requireCommerceStaff(): Promise<SupabaseClient> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Accedi per gestire le vendite.");
  const admin = createAdminClient();
  const { data: profile, error: roleError } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (roleError || !profile || !["admin", "editor"].includes(profile.role)) throw new Error("Account non autorizzato alla gestione delle vendite.");
  return admin as unknown as SupabaseClient;
}
