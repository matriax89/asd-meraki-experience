"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function getEvent(id: string) {
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
  const supabase = createAdminClient();
  
  // Create slug if new
  let slug = eventData.slug;
  if (!eventData.id && !slug && eventData.titolo) {
    slug = eventData.titolo
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

  revalidatePath("/admin/eventi");
  revalidatePath("/eventi");
  return { success: true, id: data.id };
}

export async function deleteEvent(id: string) {
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

  revalidatePath("/admin/eventi");
  revalidatePath("/eventi");
  return { success: true };
}
