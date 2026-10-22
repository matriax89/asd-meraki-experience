const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
const shortHosts = new Set(["youtu.be", "www.youtu.be"]);

/** Extract only a single video from the supported HTTPS YouTube URL formats. */
export function youtubeVideoId(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    let id: string | null = null;
    if (shortHosts.has(url.hostname)) {
      id = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1] || null;
    } else if (youtubeHosts.has(url.hostname)) {
      if (url.pathname === "/watch" && url.searchParams.getAll("v").length === 1) id = url.searchParams.get("v");
      else id = /^\/(?:shorts|embed)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1] || null;
    }
    return id && videoIdPattern.test(id) ? id : null;
  } catch { return null; }
}

export function normalizeYoutubeUrl(value: unknown): string | null {
  const id = youtubeVideoId(value);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

export function youtubeEmbedUrl(value: unknown): string | null {
  const id = youtubeVideoId(value);
  return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&controls=1&rel=0` : null;
}
