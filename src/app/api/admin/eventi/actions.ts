"use server";

import { revalidatePath } from "next/cache";
import { requireCommerceStaff } from "@/lib/commerce/admin-auth";
import { z } from "zod";
import { parseCommerceConfig } from "@/lib/commerce/config";

const localized = z.union([z.string().max(200_000), z.record(z.string(), z.string().max(200_000))]);
const eventSchema = z.object({
  id: z.string().uuid().optional(), slug: z.string().trim().max(160).optional(), titolo: localized,
  sottotitolo: localized.nullable().optional(), descrizione: localized.nullable().optional(),
  tipo: z.enum(["evento", "workshop", "masterclass"]), data_inizio: z.iso.datetime({ offset: true }),
  data_fine: z.iso.datetime({ offset: true }).nullable().optional(),
  check_in_starts_at: z.iso.datetime({ offset: true }).nullable().optional(),
  location: z.string().max(500).nullable().optional(), indirizzo: z.string().max(1000).nullable().optional(),
  copertina_url: z.string().max(2048).nullable().optional(),
  prezzo_cents: z.number().int().min(0).max(10_000_000).nullable().optional(),
  capacity: z.number().int().min(0).max(100_000).nullable().optional(), attivo: z.boolean().optional(),
  ticketing_mode: z.enum(["single", "advanced"]).optional(),
}).refine((event) => !event.data_fine || Date.parse(event.data_fine) >= Date.parse(event.data_inizio), { message: "La fine dell’evento non può precedere l’inizio.", path: ["data_fine"] })
  .refine((event) => !event.check_in_starts_at || Date.parse(event.check_in_starts_at) <= Date.parse(event.data_inizio), { message: "L’apertura del check-in non può essere successiva all’inizio dell’evento.", path: ["check_in_starts_at"] });

export async function getEvent(id: string) {
  const supabase = await requireCommerceStaff();
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

export async function upsertEvent(raw: unknown) {
  const supabase = await requireCommerceStaff();
  const validation = eventSchema.safeParse(raw);
  if (!validation.success) {
    const openingError = validation.error.issues.find((issue) => issue.path[0] === "check_in_starts_at");
    return { success: false, error: openingError ? openingError.code === "custom" ? openingError.message : "Controlla data e orario dell’apertura check-in." : "Controlla date, prezzo, capienza e dettagli dell’evento." };
  }
  // Configurations, counters and Stripe IDs have dedicated transactional paths.
  const { ticketing_mode: ticketingMode, ...eventData } = validation.data;
  const createAdvancedDraft = !eventData.id && ticketingMode === "advanced";
  if (eventData.id && ticketingMode === "advanced" && eventData.attivo) {
    const { data: existing, error: existingError } = await supabase.from("events").select("*").eq("id", eventData.id).single();
    const config = parseCommerceConfig((existing as (typeof existing & { commerce_config?: unknown }))?.commerce_config);
    if (existingError || !config?.enabled) return { success: false, error: "Configura le formule e pubblica l’evento da Formule e prezzi." };
  }
  
  // Create slug if new
  let slug = eventData.slug;
  if (!eventData.id && !slug && eventData.titolo) {
    const title = typeof eventData.titolo === "string" ? eventData.titolo : eventData.titolo.it || Object.values(eventData.titolo)[0] || "evento";
    slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
      
    // Append random string to avoid collisions
    slug += "-" + Math.random().toString(36).substring(2, 6);
  }

  const payload = {
    ...eventData,
    ...(createAdvancedDraft ? { attivo: false, prezzo_cents: null } : {}),
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
  const supabase = await requireCommerceStaff();
  if (!z.string().uuid().safeParse(id).success) return { success: false, error: "Evento non valido." };
  
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
