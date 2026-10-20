import { createClient } from "@supabase/supabase-js";
import { createEventSocialImage } from "@/lib/events/social-image";
import type { SocialEvent } from "@/lib/events/social-metadata";

export const runtime = "nodejs";

const PUBLIC_EVENT_COLUMNS = "id,slug,tipo,titolo,sottotitolo,descrizione,meta_title,meta_description,data_inizio,data_fine,copertina_url,location,updated_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noPreview = () => new Response("Event preview unavailable", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID.test(id)) return noPreview();
  const query = new URL(request.url).searchParams;
  const requestedLocale = query.get("lang") || "it";
  const locale = ["it", "en", "de", "es"].includes(requestedLocale) ? requestedLocale : "it";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return noPreview();
  try {
    // Public previews use the same anonymous visibility rules as a logged-out visitor.
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data, error } = await db.from("events").select(PUBLIC_EVENT_COLUMNS).eq("id", id).eq("attivo", true).maybeSingle();
    if (error || !data) return noPreview();
    return await createEventSocialImage(data as SocialEvent, locale, url);
  } catch {
    return noPreview();
  }
}
