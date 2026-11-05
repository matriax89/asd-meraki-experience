import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { createAdminClient, createClient } from "@/lib/supabase/server";

/** Verify the authenticated identity before reading private commerce tables. */
export async function requireCommerceStaff(): Promise<SupabaseClient> {
  return (await requireCommerceStaffIdentity()).admin;
}

/** The actor is always the verified session user, never a submitted form field. */
export async function requireCommerceStaffIdentity(): Promise<{ admin: SupabaseClient; userId: string; role: "admin" | "editor" }> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Accedi per gestire le vendite.");
  const admin = createAdminClient();
  const { data: profile, error: roleError } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (roleError || !profile || !["admin", "editor"].includes(profile.role)) throw new Error("Account non autorizzato alla gestione delle vendite.");
  return { admin: admin as unknown as SupabaseClient, userId: user.id, role: profile.role as "admin" | "editor" };
}

/** Public navigation gets only this verified flag, memoized for one render pass. */
export const hasCommerceStaffAccess = cache(async (): Promise<boolean> => {
  try {
    await requireCommerceStaff();
    return true;
  } catch {
    return false;
  }
});
