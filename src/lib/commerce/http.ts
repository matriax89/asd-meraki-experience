import { z } from "zod";
import { participantSchema } from "./config";

export const privateHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
export const commerceResponse = (body: unknown, status = 200) => Response.json(body, { status, headers: privateHeaders });
export const selectionSchema = z.object({
  eventId: z.string().uuid(), participants: z.array(participantSchema).min(1).max(10),
  upgradePassId: z.string().uuid().optional(), upgradeToken: z.string().min(16).max(256).regex(/^[a-z0-9_-]+$/i).optional(),
}).refine((body) => Boolean(body.upgradePassId) === Boolean(body.upgradeToken), "Credenziali upgrade incomplete.");

export async function commerceBody(request: Request): Promise<unknown> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new CommerceRequestError("Richiesta non consentita.", 403);
  const body = await request.text();
  if (body.length > 50_000) throw new CommerceRequestError("Richiesta troppo grande.", 413);
  return JSON.parse(body);
}

export class CommerceRequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const errors: Record<string, string> = {
  sold_out: "Posti esauriti o temporaneamente prenotati per una delle attività. Puoi iscriverti alla lista d’attesa.",
  unavailable: "Evento non disponibile per l’acquisto.", event_unavailable: "Evento non disponibile per l’acquisto.",
  invalid_config: "Le formule di questo evento devono essere completate dall’organizzatore.",
  sales_closed: "Le prenotazioni per una delle attività selezionate sono chiuse.",
  no_active_price: "La formula selezionata non è in vendita in questo momento.",
  invalid_selection: "Controlla la formula, gli extra e le scelte del menù.",
  invalid_menu: "Seleziona un menù valido per le attività acquistate.",
  invalid_package: "Seleziona una formula disponibile.",
  invalid_addon: "Controlla gli extra selezionati: alcuni potrebbero essere già compresi.",
  commerce_unavailable: "Le formule di questo evento non sono disponibili in questo momento.",
  invalid_participants: "Inserisci nome e cognome di ogni partecipante.",
  invalid_upgrade: "Questo cambio formula non è disponibile per il tuo biglietto.",
  upgrade_unavailable: "Questo cambio formula non è disponibile per il tuo biglietto.",
  upgrade_pending: "È già in corso un aggiornamento di questo biglietto. Completa o attendi la scadenza del pagamento.",
  invalid_price: "La formula selezionata non è in vendita in questo momento.",
  pricing_unavailable: "La formula selezionata non è in vendita in questo momento.",
  invalid_request: "La selezione è cambiata. Avvia un nuovo acquisto.",
  upgrade_in_progress: "È già in corso un aggiornamento di questo biglietto. Completa o attendi la scadenza del pagamento.",
  email_mismatch: "Per aggiornare il biglietto usa l’indirizzo email dell’acquisto originale.",
  request_conflict: "La selezione è cambiata. Avvia un nuovo acquisto.",
  request_expired: "Il tempo per completare l’acquisto è scaduto. Avvia un nuovo acquisto.",
  no_change: "Questo biglietto comprende già gli accessi selezionati.",
};
export function commerceFailure(code: string) {
  return commerceResponse({ code, error: errors[code] || "La selezione non è disponibile. Controlla formule, orari e posti disponibili." }, 409);
}
export function requestFailure(error: unknown) {
  if (error instanceof CommerceRequestError) return commerceResponse({ error: error.message }, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return commerceResponse({ error: "Controlla i dati inseriti e riprova." }, 400);
  console.error("Meraki commerce request failed.");
  return commerceResponse({ error: "Servizio momentaneamente non disponibile. Riprova tra poco." }, 503);
}
