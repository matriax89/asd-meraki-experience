import { sendServiceEmail } from "@/lib/resend/client";
import { renderMerakiCancellationNotice, renderMerakiRefundConfirmation, type MerakiCancellationNotice, type MerakiRefundConfirmation } from "./refund-template";

/** The caller owns the durable outbox claim and marks it sent only on success. */
export async function sendMerakiRefundConfirmation(input: MerakiRefundConfirmation) {
  return sendServiceEmail(() => renderMerakiRefundConfirmation(input));
}

export async function sendMerakiCancellationNotice(input: MerakiCancellationNotice) {
  return sendServiceEmail(() => renderMerakiCancellationNotice(input));
}
