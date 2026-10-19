import { createAdminClient } from "@/lib/supabase/server";
import { getLocalizedText } from "@/lib/i18n-utils";
import { parseWalletRequest, walletTicket } from "@/lib/tickets/wallet";

const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: privateHeaders });

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return respond({ error: "Richiesta non consentita." }, 403);
    const raw = await request.text();
    if (raw.length > 30_000) return respond({ error: "Richiesta troppo grande." }, 413);
    const body = parseWalletRequest(JSON.parse(raw));
    if (!body) return respond({ error: "Link del biglietto non valido." }, 400);
    if (!body.tickets.length) return respond({ tickets: [] });

    // The token is the buyer's credential, not a public lookup by id or email.
    // Batched IN filters alone form a cross-product: verify EACH exact pair below.
    const { data, error } = await createAdminClient().from("tickets")
      .select("id,qr_code,status,event:events(titolo,data_inizio,location,indirizzo,check_in_starts_at)")
      .in("id", body.tickets.map((ticket) => ticket.id))
      .in("qr_code", body.tickets.map((ticket) => ticket.token));
    if (error) return respond({ error: "Impossibile aggiornare i biglietti. Riprova tra poco." }, 503);
    const pairs = new Set(body.tickets.map((ticket) => `${ticket.id.toLowerCase()}:${ticket.token}`));
    const tickets = (data || []).flatMap((row) => {
      if (!row.qr_code || !row.event || !pairs.has(`${row.id.toLowerCase()}:${row.qr_code}`)) return [];
      const ticket = walletTicket({
        id: row.id, token: row.qr_code,
        title: getLocalizedText(row.event.titolo, body.locale).slice(0, 240) || "Evento Meraki",
        date: row.event.data_inizio,
        checkInStartsAt: row.event.check_in_starts_at,
        location: [row.event.location, row.event.indirizzo].filter(Boolean).join(" · ").slice(0, 320),
        status: row.status || "pending",
      });
      return ticket ? [ticket] : [];
    });
    const missing = body.tickets.filter(item => !tickets.some(ticket => ticket.id === item.id && ticket.token === item.token));
    if (missing.length) tickets.push(...await (await import("@/lib/commerce/server")).getCommerceWalletTickets(missing, body.locale));
    return respond({ tickets });
  } catch (error) {
    return error instanceof SyntaxError
      ? respond({ error: "Link del biglietto non valido." }, 400)
      : respond({ error: "Impossibile aggiornare i biglietti. Riprova tra poco." }, 503);
  }
}
