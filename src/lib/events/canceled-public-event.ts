import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

/** Unpublished events stay private. Only an explicit cancellation gets this notice. */
export async function getCanceledPublicEvent(slug: string, types: Database["public"]["Enums"]["event_tipo_enum"][]) {
  if (!slug || slug.length > 200) return null;
  const { data, error } = await createAdminClient().from("events")
    .select("slug,tipo,titolo,data_inizio,copertina_url,canceled_at,cancellation_reason")
    .eq("slug", slug).in("tipo", types).not("canceled_at", "is", null).maybeSingle();
  if (error) throw new Error("Impossibile verificare lo stato dell’evento.");
  return data;
}
