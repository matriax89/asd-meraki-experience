"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateHomepageCardSettings(settings: { masterclass_image: string }) {
  const supabase = await createClient();

  // Validate admin
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "Non autorizzato" };

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
  if (!profile || (profile.role !== "admin" && profile.role !== "editor")) {
    return { error: "Permessi insufficienti" };
  }

  // Upsert settings
  const { error } = await supabase.from("site_settings" as any).upsert({
    key: "homepage_cards",
    value: settings,
    updated_at: new Date().toISOString()
  });

  if (error) {
    console.error("Settings Error:", error);
    return { error: "Errore durante il salvataggio delle impostazioni" };
  }

  // Revalidate homepage to reflect changes instantly
  revalidatePath("/");
  revalidatePath("/[locale]", "page");
  
  return { success: true };
}
