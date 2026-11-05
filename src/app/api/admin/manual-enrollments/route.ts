import { commerceResponse, requestFailure } from '@/lib/commerce/http';
import { manualStaff, manualFailure, manualBody } from '@/lib/commerce/manual-http';
import { manualEnrollmentSchema } from '@/lib/commerce/manual-schema';
import { recordManualEnrollment, deliverManualEnrollment } from '@/lib/commerce/manual-service';

export async function POST(request: Request) {
  try {
    const staff = await manualStaff();
    const body = manualEnrollmentSchema.parse(await manualBody(request));
    const result = await recordManualEnrollment(staff, body);
    if (result.error) return manualFailure(result.error);
    // A delivery outage must never make an already recorded payment look failed.
    let emailStatus: 'sent' | 'pending' = 'pending';
    try { emailStatus = await deliverManualEnrollment(staff, result.orderId); } catch { /* Retry is independent. */ }
    return commerceResponse({ orderId: result.orderId, passIds: result.passIds, replayed: result.replayed, emailStatus }, result.replayed ? 200 : 201);
  } catch (error) { return requestFailure(error); }
}
