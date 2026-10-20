/** Old preview URLs may redirect only to Meraki's original public poster assets. */
export function publicSocialPosterUrl(value: unknown, supabaseUrl: string): URL | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const project = new URL(supabaseUrl);
    const projectAsset = project.protocol === "https:" && /^[a-z0-9-]+\.supabase\.co$/.test(project.hostname)
      && url.origin === project.origin && url.pathname.startsWith("/storage/v1/object/public/");
    const websiteAsset = url.origin === "https://www.merakiexperience.org" && url.pathname.startsWith("/images/");
    if (!projectAsset && !websiteAsset) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}
