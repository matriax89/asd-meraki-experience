import { z } from "zod";
import { commerceClient } from "@/lib/commerce/server";
import { parseCommerceConfig } from "@/lib/commerce/config";
import { commerceBody, commerceResponse, requestFailure } from "@/lib/commerce/http";

const schema = z.object({ eventId: z.string().uuid(), email: z.string().trim().toLowerCase().email().max(254), name: z.string().trim().min(2).max(200), packageId: z.string().max(64).regex(/^[a-z0-9_-]+$/) });
export async function POST(request: Request) {
  try {
    const body = schema.parse(await commerceBody(request));
    const db = commerceClient();
    const { data: event, error } = await db.from("events").select("commerce_config,data_inizio,attivo").eq("id", body.eventId).single();
    if (error) throw error;
    const config = parseCommerceConfig(event.commerce_config);
    const pkg = config?.packages.find(pkg => pkg.id === body.packageId);
    if (!config?.enabled || !config.waitlistEnabled || !pkg || !event.attivo || Date.parse(event.data_inizio) <= Date.now()) return commerceResponse({ error: "Lista d’attesa non disponibile per questa formula." }, 400);
    const [firstName, ...surname] = body.name.split(/\s+/);
    const { error: saveError } = await db.from("commerce_waitlist").insert({
      event_id: body.eventId, email: body.email, first_name: firstName, last_name: surname.join(" "),
      package_id: body.packageId, activity_ids: pkg.activityIds, status: "waiting",
    });
    // A partial unique index makes repeat subscriptions idempotent without
    // revealing whether this address was already waiting.
    if (saveError && saveError.code !== "23505") throw saveError;
    return commerceResponse({ success: true });
  } catch (error) { return requestFailure(error); }
}
