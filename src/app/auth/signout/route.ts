import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const sourceOrigin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  let referer: URL | null = null;
  try {
    const value = request.headers.get("referer");
    if (value) referer = new URL(value);
  } catch { /* A malformed referrer cannot supply a locale or authorize a request. */ }

  if ((fetchSite && !["same-origin", "none"].includes(fetchSite)) ||
    (sourceOrigin !== null && sourceOrigin !== origin) ||
    (referer && referer.origin !== origin) ||
    (sourceOrigin === null && referer?.origin !== origin)) {
    return NextResponse.json({ error: "Richiesta non consentita." }, { status: 403, headers: privateHeaders });
  }

  try {
    const cookieLocale = (await cookies()).get("NEXT_LOCALE")?.value;
    const locale = /^\/(it|en|de|es)(?:\/|$)/.exec(referer?.pathname || "")?.[1] ||
      (cookieLocale && ["it", "en", "de", "es"].includes(cookieLocale) ? cookieLocale : "it");
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw new Error("Sign-out failed");

    const response = NextResponse.redirect(new URL(`/${locale}/eventi`, origin), 303);
    response.headers.set("Cache-Control", privateHeaders["Cache-Control"]);
    return response;
  } catch {
    return NextResponse.json({ error: "Disconnessione non riuscita. Riprova." }, { status: 503, headers: privateHeaders });
  }
}
