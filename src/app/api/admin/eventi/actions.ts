"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { getLocalizedText } from "@/lib/i18n-utils";

export async function getEvent(id: string) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching event:", error);
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

export async function upsertEvent(eventData: any) {
  await requireAdmin();
  const supabase = createAdminClient();
  
  const start = new Date(eventData.data_inizio);
  const end = eventData.data_fine ? new Date(eventData.data_fine) : null;
  if (Number.isNaN(start.getTime())) return { success: false, error: "Data di inizio non valida." };
  if (end && (Number.isNaN(end.getTime()) || end <= start)) return { success: false, error: "La data di fine deve essere successiva all’inizio." };
  if (eventData.capacity !== null && (!Number.isInteger(eventData.capacity) || eventData.capacity < 1)) return { success: false, error: "La capienza deve essere almeno 1." };
  if (eventData.prezzo_cents !== null && eventData.prezzo_cents < 0) return { success: false, error: "Il prezzo non può essere negativo." };

  // Create slug if new
  let slug = eventData.slug;
  if (!eventData.id && !slug && eventData.titolo) {
    slug = getLocalizedText(eventData.titolo, "it")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
      
    // Append random string to avoid collisions
    slug += "-" + Math.random().toString(36).substring(2, 6);
  }

  const payload = {
    ...eventData,
    ...(slug ? { slug } : {}),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("events")
    .upsert(payload)
    .select()
    .single();

  if (error) {
    console.error("Error saving event:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/[locale]/admin/eventi", "page");
  revalidatePath("/[locale]/eventi", "page");
  revalidatePath("/[locale]/workshop", "page");
  return { success: true, id: data.id };
}

export async function deleteEvent(id: string) {
  await requireAdmin();
  const supabase = createAdminClient();
  
  // Check if there are tickets
  const { count, error: countError } = await supabase
    .from("tickets")
    .select("*", { count: 'exact', head: true })
    .eq("event_id", id);
    
  if (countError) {
    return { success: false, error: countError.message };
  }
  
  if (count && count > 0) {
    return { success: false, error: "Non puoi eliminare un evento che ha dei biglietti venduti. Disattivalo invece." };
  }

  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting event:", error);
    return { success: false, error: error.message };
  }

  revalidatePath("/[locale]/admin/eventi", "page");
  revalidatePath("/[locale]/eventi", "page");
  revalidatePath("/[locale]/workshop", "page");
  return { success: true };
}
