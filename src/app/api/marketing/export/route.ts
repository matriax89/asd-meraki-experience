import { requireCommerceStaff } from "@/lib/commerce/admin-auth";
import { marketingContactsCsv, type MarketingContact } from "@/lib/email/marketing";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
  let db;
  try { db = await requireCommerceStaff(); } catch { return Response.json({ error: "Non autorizzato." }, { status: 403, headers }); }
  try {
    const contacts: MarketingContact[] = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await db.from("marketing_contacts").select("email,first_name,last_name,locale,confirmed_at")
        .eq("status", "subscribed").not("confirmed_at", "is", null).order("id").range(start, start + 499);
      if (error) throw error;
      contacts.push(...data || []);
      if (!data || data.length < 500) break;
    }
    return new Response(marketingContactsCsv(contacts), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="meraki-contatti-consenso-confermato.csv"' } });
  } catch { return Response.json({ error: "Esportazione non disponibile. Verifica la migrazione dei contatti e riprova." }, { status: 503, headers }); }
}
