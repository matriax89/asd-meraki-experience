import { commerceClient } from "@/lib/commerce/server";

const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
const validToken = (token: unknown): token is string => typeof token === "string" && /^[a-f0-9]{64}$/i.test(token);
const validStatus = (value: unknown) => value === "pending" || value === "subscribed" || value === "unsubscribed";

// GET deliberately never grants or revokes consent: email scanners can open links safely.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!validToken(token)) return reply({ error: "invalid_link" }, 400);
  try {
    const { data, error } = await commerceClient().rpc("lookup_marketing_preference", { p_token: token });
    if (error) return reply({ error: "unavailable" }, 503);
    if (!data || typeof data !== "object" || !validStatus(data.status)) return reply({ error: "invalid_link" }, 404);
    return reply({ status: data.status, canConfirm: data.can_confirm === true, canUnsubscribe: data.can_unsubscribe === true });
  } catch { return reply({ error: "unavailable" }, 503); }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "forbidden" }, 403);
  try {
    const raw = await request.text();
    if (raw.length > 2048) return reply({ error: "invalid_request" }, 413);
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || !("token" in body) || !validToken(body.token) || !("action" in body) || typeof body.action !== "string" || !["confirm", "unsubscribe"].includes(body.action)) return reply({ error: "invalid_request" }, 400);
    const { data, error } = await commerceClient().rpc(body.action === "confirm" ? "confirm_marketing_consent" : "unsubscribe_marketing_consent", { p_token: body.token });
    if (error) return reply({ error: "unavailable" }, 503);
    if (!data || typeof data !== "object" || !validStatus(data.status)) return reply({ error: "invalid_link" }, 404);
    return reply({ status: data.status });
  } catch (error) { return reply({ error: error instanceof SyntaxError ? "invalid_request" : "unavailable" }, error instanceof SyntaxError ? 400 : 503); }
}
