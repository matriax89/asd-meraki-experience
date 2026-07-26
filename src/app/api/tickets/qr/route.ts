import { createAdminClient } from "@/lib/supabase/server";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return new Response("Missing token", { status: 400 });
  const supabase = createAdminClient();
  const { data: ticket } = await supabase
    .from("tickets")
    .select("qr_code")
    .eq("access_token", token)
    .single();
  if (!ticket?.qr_code) return new Response("Not found", { status: 404 });
  const png = await QRCode.toBuffer(ticket.qr_code, { type: "png", width: 320, margin: 2 });
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
