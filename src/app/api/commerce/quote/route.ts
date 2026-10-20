import { commerceClient } from "@/lib/commerce/server";
import { commerceBody, commerceResponse, commerceFailure, requestFailure, selectionSchema } from "@/lib/commerce/http";

export async function POST(request: Request) {
  try {
    const raw = await commerceBody(request);
    // A quote can precede entering names. Only checkout accepts actual identities.
    if (raw && typeof raw === "object" && "participants" in raw && Array.isArray(raw.participants)) {
      raw.participants = raw.participants.map((person: unknown) => person && typeof person === "object" ? {
        ...person, firstName: "firstName" in person && typeof person.firstName === "string" && person.firstName.trim() ? person.firstName : "Partecipante",
        lastName: "lastName" in person && typeof person.lastName === "string" && person.lastName.trim() ? person.lastName : "Meraki",
      } : person);
    }
    const body = selectionSchema.parse(raw);
    const { data, error } = await commerceClient().rpc(body.discountCode ? "quote_event_commerce_discount" : "quote_event_commerce", {
      p_event_id: body.eventId, p_participants: body.participants,
      p_upgrade_pass_id: body.upgradePassId || null, p_upgrade_token: body.upgradeToken || null,
      ...(body.discountCode ? { p_discount_code: body.discountCode } : {}),
    });
    if (error) throw error;
    return data?.error ? commerceFailure(data.error) : commerceResponse(data);
  } catch (error) { return requestFailure(error); }
}
