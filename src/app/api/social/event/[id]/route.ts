import { createClient } from "@supabase/supabase-js";
import { publicSocialPosterUrl } from "@/lib/events/social-poster";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const noPreview = () => new Response("Event preview unavailable", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID.test(id)) return noPreview();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return noPreview();
  try {
    // Previously shared preview URLs now resolve to the unchanged original poster.
    // The anonymous lookup preserves the same visibility as a logged-out visitor.
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data, error } = await db.from("events").select("id,copertina_url").eq("id", id).eq("attivo", true).maybeSingle();
    if (error || !data) return noPreview();
    const poster = publicSocialPosterUrl(data.copertina_url, url);
    if (!poster) return noPreview();
    return new Response(null, { status: 302, headers: {
      Location: poster.href,
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return noPreview();
  }
}
