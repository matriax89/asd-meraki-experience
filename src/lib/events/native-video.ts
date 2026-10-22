const nativeVideoPath = /^\/storage\/v1\/object\/public\/public-assets\/event-videos\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.mp4$/;

/** Only our public MP4 archive may autoplay without contacting a third party. */
export function normalizeNativeVideoUrl(value: unknown, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): string | null {
  if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u001f\u007f\\%]/.test(value) || !supabaseUrl) return null;
  const candidate = value.trim();
  try {
    const archive = new URL(supabaseUrl);
    const url = new URL(candidate);
    if (archive.protocol !== "https:" || !/^[a-z0-9-]+\.supabase\.co$/.test(archive.hostname)) return null;
    if (url.origin !== archive.origin || url.username || url.password || url.port || url.search || url.hash) return null;
    if (!nativeVideoPath.test(url.pathname)) return null;
    // Reject parser-normalized paths, alternate authorities and explicit ports.
    if (candidate !== `${url.origin}${url.pathname}`) return null;
    return candidate;
  } catch { return null; }
}
