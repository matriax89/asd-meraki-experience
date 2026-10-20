import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { SocialEvent } from "./social-metadata";

export const socialEventColumns = "id,slug,tipo,titolo,sottotitolo,descrizione,meta_title,meta_description,data_inizio,data_fine,copertina_url,location,updated_at";

type EventKind = "evento" | "workshop" | "masterclass";

export const getSocialEvent = cache(async (slug: string, types: readonly EventKind[]): Promise<SocialEvent | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").select(socialEventColumns)
    .eq("slug", slug).in("tipo", types).eq("attivo", true).single();
  return error ? null : data;
});

// Match the visible feed: first by start time, including events still in progress.
export const getFeaturedSocialEvent = cache(async (types?: readonly EventKind[]): Promise<SocialEvent | null> => {
  const supabase = await createClient();
  let query = supabase.from("events").select(socialEventColumns).eq("attivo", true).order("data_inizio", { ascending: true });
  if (types?.length) query = query.in("tipo", types);
  const { data, error } = await query;
  if (error) return null;
  const now = Date.now();
  return data?.find(event => Date.parse(event.data_fine || event.data_inizio) > now) || null;
});
