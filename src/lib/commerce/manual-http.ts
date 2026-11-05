import { requireCommerceStaffIdentity } from './admin-auth';
import { CommerceRequestError, commerceBody, commerceFailure, commerceResponse } from './http';

export async function manualStaff() {
  try { return await requireCommerceStaffIdentity(); }
  catch { throw new CommerceRequestError('Accedi con un account autorizzato alla gestione delle iscrizioni.', 403); }
}

export async function manualBody(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new CommerceRequestError('Richiesta non consentita.', 403);
  return commerceBody(request);
}

export function manualFailure(code: string) {
  const messages: Record<string, string> = {
    price_changed: 'Il prezzo è cambiato. Verifica il nuovo totale prima di registrare il pagamento.',
    invalid_attendees: 'Controlla contatti e documento di ogni partecipante.',
    invalid_manual_payment: 'Controlla importo, data, metodo e commissioni del pagamento già ricevuto.',
  };
  return messages[code] ? commerceResponse({ code, error: messages[code] }, 409) : commerceFailure(code);
}
