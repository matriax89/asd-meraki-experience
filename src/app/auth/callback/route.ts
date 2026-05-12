import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/it/admin';

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return undefined; // Non ci serve leggere in questa fase
          },
          set(name: string, value: string, options: CookieOptions) {
            // Sarà settato nel client browser
          },
          remove(name: string, options: CookieOptions) {
            // Idem
          },
        },
      }
    );

    // This is useful if using magic links, but for now we'll mostly use password login.
    // await supabase.auth.exchangeCodeForSession(code);
  }

  // Redirect all'admin
  return NextResponse.redirect(`${origin}${next}`);
}
