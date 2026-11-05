import { commerceResponse, requestFailure } from '@/lib/commerce/http';
import { manualStaff, manualFailure, manualBody } from '@/lib/commerce/manual-http';
import { manualSelectionSchema } from '@/lib/commerce/manual-schema';
import { manualEnrollmentQuote } from '@/lib/commerce/manual-service';
export async function POST(request: Request) {
  try {
    const staff = await manualStaff();
    const raw = await manualBody(request);
    if (raw && typeof raw === 'object' && 'participants' in raw && Array.isArray(raw.participants)) {
      raw.participants = raw.participants.map(person => person && typeof person === 'object' ? { ...person,
        firstName: typeof person.firstName === 'string' && person.firstName.trim() ? person.firstName : 'Partecipante',
        lastName: typeof person.lastName === 'string' && person.lastName.trim() ? person.lastName : 'Meraki' } : person);
    }
    const result = await manualEnrollmentQuote(staff, manualSelectionSchema.parse(raw));
    return result.error ? manualFailure(result.error) : commerceResponse({ quote: result.quote });
  } catch (error) { return requestFailure(error); }
}
