import { z } from "zod";
import { commerceClient } from "@/lib/commerce/server";
import { commerceBody, commerceFailure, commerceResponse, requestFailure } from "@/lib/commerce/http";

const quoteSchema = z.object({
  eventId: z.string().uuid(),
  discountCode: z.string().trim().max(50).regex(/^[a-z0-9_-]*$/i).transform(value => value.toUpperCase()).optional(),
});

export async function POST(request: Request) {
  try {
    const body = quoteSchema.parse(await commerceBody(request));
    const { data, error } = await commerceClient().rpc("quote_event_ticket_discount", {
      p_event_id: body.eventId, p_discount_code: body.discountCode || null,
    });
    if (error) throw error;
    return data?.error ? commerceFailure(data.error) : commerceResponse(data);
  } catch (error) { return requestFailure(error); }
}
