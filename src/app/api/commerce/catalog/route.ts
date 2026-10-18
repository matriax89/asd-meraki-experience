import { getCommerceCatalog } from "@/lib/commerce/server";
import { commerceResponse, requestFailure } from "@/lib/commerce/http";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const eventId = params.get("eventId") || "";
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return commerceResponse({ error: "Evento non valido." }, 400);
  try { return commerceResponse(await getCommerceCatalog(eventId, params.get("locale") || "it")); }
  catch (error) { return requestFailure(error); }
}
