import { loadParticipantDetails, ParticipantRosterError } from "@/lib/admin/participant-roster";

const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const single = (name: string) => query.getAll(name).length === 1 ? query.get(name) || "" : "";
  try {
    // The loader authenticates before validating these untrusted identifiers.
    const details = await loadParticipantDetails({ eventId: single("event"), participantId: single("participant"), source: single("source"), locale: query.has("locale") ? single("locale") : "it" });
    return Response.json(details, { headers });
  } catch (error) {
    const status = error instanceof ParticipantRosterError ? error.status : 503;
    const message = error instanceof ParticipantRosterError ? error.message : "Non è stato possibile caricare il partecipante. Riprova.";
    return Response.json({ error: message }, { status, headers });
  }
}
