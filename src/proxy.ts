import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { LOCALE_CHOICE_COOKIE } from "./i18n/locale-choice";
import { publicLocaleRedirect } from "./i18n/locale-preference";

const intlMiddleware = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const localePath = publicLocaleRedirect({
    pathname: request.nextUrl.pathname,
    method: request.method,
    acceptLanguage: request.headers.get("accept-language"),
    manualLocale: request.cookies.get(LOCALE_CHOICE_COOKIE)?.value,
    previousLocale: request.cookies.get("NEXT_LOCALE")?.value,
    userAgent: request.headers.get("user-agent"),
    isPrefetch: request.headers.has("next-router-prefetch") || /prefetch/i.test(request.headers.get("purpose") ?? request.headers.get("sec-purpose") ?? ""),
    isServerNavigation: request.headers.has("rsc") || request.headers.has("next-action"),
  });
  if (localePath) {
    const url = request.nextUrl.clone();
    url.pathname = localePath;
    const redirect = NextResponse.redirect(url, 307);
    redirect.headers.set("Cache-Control", "private, no-store");
    redirect.headers.set("Vary", "Accept-Language, Cookie, User-Agent");
    return redirect;
  }

  // Genera la risposta iniziale dal middleware di next-intl
  let response = intlMiddleware(request);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = intlMiddleware(request);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isTargetingAdmin = path.includes('/admin');

  if (isTargetingAdmin && !user) {
    const url = request.nextUrl.clone();
    const pathParts = path.split('/');
    const locale = routing.locales.find(l => pathParts[1] === l) || routing.defaultLocale;
    url.pathname = `/${locale}/login`;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|auth/signout(?:/|$)|_next|_vercel|.*\\..*).*)"]
};
