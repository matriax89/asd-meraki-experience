import { z } from 'zod';
import { commerceResponse, requestFailure } from '@/lib/commerce/http';
import { manualStaff } from '@/lib/commerce/manual-http';
import { manualEnrollmentContext } from '@/lib/commerce/manual-service';
const parameters = z.object({ event: z.string().uuid().nullable(), upgradePass: z.string().uuid().nullable(), locale: z.enum(['it', 'en', 'de', 'es']).default('it') });
export async function GET(request: Request) {
  try {
    const staff = await manualStaff();
    const url = new URL(request.url);
    const query = parameters.parse({ event: url.searchParams.get('event'), upgradePass: url.searchParams.get('upgradePass'), locale: url.searchParams.get('locale') || 'it' });
    return commerceResponse(await manualEnrollmentContext(staff, query.event, query.upgradePass, query.locale));
  } catch (error) { return requestFailure(error); }
}
