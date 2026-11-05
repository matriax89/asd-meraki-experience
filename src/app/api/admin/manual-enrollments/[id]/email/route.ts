import { z } from 'zod';
import { commerceResponse, requestFailure } from '@/lib/commerce/http';
import { manualStaff, manualBody } from '@/lib/commerce/manual-http';
import { deliverManualEnrollment } from '@/lib/commerce/manual-service';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const staff = await manualStaff();
    await manualBody(request);
    const id = z.string().uuid().parse((await context.params).id);
    return commerceResponse({ orderId: id, emailStatus: await deliverManualEnrollment(staff, id) });
  } catch (error) { return requestFailure(error); }
}
