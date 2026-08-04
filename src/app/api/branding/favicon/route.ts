import { createAdminClient } from "@/lib/supabase/server";
import sharp from "sharp";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAdminClient();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "homepage_content")
    .single();

  const faviconUrl = (settings?.value as any)?.branding?.favicon_url;
  if (!faviconUrl) {
    return new Response(null, {
      status: 307,
      headers: { Location: "/favicon.ico", "Cache-Control": "no-store" },
    });
  }

  try {
    const source = await fetch(faviconUrl, { cache: "no-store" });
    if (!source.ok) throw new Error(`Favicon source returned ${source.status}`);
    const png = await sharp(Buffer.from(await source.arrayBuffer()))
      .resize(64, 64, { fit: "contain" })
      .png()
      .toBuffer();

    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Dynamic favicon error:", error);
    return new Response(null, {
      status: 307,
      headers: { Location: "/favicon.ico", "Cache-Control": "no-store" },
    });
  }
}
