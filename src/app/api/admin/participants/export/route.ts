import { loadParticipantRoster, ParticipantRosterError } from "@/lib/admin/participant-roster";
import { participantRosterCsv, participantRosterFilename } from "@/lib/admin/participant-roster-csv";

const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const status = query.get("status") || "all";
  const documents = query.get("documents") || "0";
  if (["event", "affiliate", "status", "documents"].some(key => query.getAll(key).length > 1) || !["all", "valid"].includes(status) || !["0", "1"].includes(documents)) {
    return Response.json({ error: "Seleziona un evento e filtri validi per l’esportazione." }, { status: 400, headers });
  }
  try {
    const roster = await loadParticipantRoster({ locale: "it", eventId: query.get("event") || "", affiliateId: query.get("affiliate") || undefined, includeDocuments: documents === "1" });
    const selected = status === "valid" ? { ...roster, participants: roster.participants.filter(person => person.valid) } : roster;
    return new Response(participantRosterCsv(selected), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${participantRosterFilename(selected, status === "valid")}"` } });
  } catch (error) {
    const status = error instanceof ParticipantRosterError ? error.status : 503;
    const message = status === 403 ? "Accedi con un account autorizzato per esportare i partecipanti." : status === 400 ? "Seleziona un evento e un affiliato validi." : status === 404 ? "Evento o affiliato non disponibile." : "Esportazione non disponibile. Riprova: nessun elenco parziale è stato esportato.";
    return Response.json({ error: message }, { status, headers });
  }
}
