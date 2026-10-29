export type CommerceActivityKind = 'workshop' | 'masterclass' | 'dinner' | 'extra';
export type CommerceTranslations = Partial<Record<'it' | 'en' | 'de' | 'es', string>>;
export type CommercePriceTier = { id: string; label: string; labelTranslations?: CommerceTranslations; amountCents: number; activityAmounts?: Record<string, number>; startsAt: string | null; endsAt: string | null };
export type CommerceActivity = { id: string; name: string; nameTranslations?: CommerceTranslations; kind: CommerceActivityKind; capacity: number | null; startsAt: string | null; endsAt?: string | null; checkInStartsAt?: string | null; salesEnd: string | null; menuOptions: string[]; menuTranslations?: Record<string, CommerceTranslations> };
export type CommercePackage = { id: string; name: string; nameTranslations?: CommerceTranslations; description: string; descriptionTranslations?: CommerceTranslations; activityIds: string[]; prices: CommercePriceTier[] };
export type CommerceAddon = { id: string; name: string; nameTranslations?: CommerceTranslations; activityId: string; amountCents: number };
export type CommerceConfig = { version: 1; enabled: boolean; waitlistEnabled: boolean; upgradesEnabled: boolean; activities: CommerceActivity[]; packages: CommercePackage[]; addons: CommerceAddon[] };
export type CommerceParticipant = { firstName: string; lastName: string; packageId: string; addonIds: string[]; menuChoices: Record<string, string> };
/** Private checkout data. Never include this object in a ticket, QR, wallet, or Stripe metadata. */
export type CommerceAttendee = { firstName: string; lastName: string; email: string; phone: string; documentType: 'codice_fiscale' | 'foreign_id'; documentCountry: string; documentNumber: string; marketingConsent: boolean };
export type CommerceDiscountSnapshot = { id: string; code: string; discountType: 'percentage' | 'fixed_amount'; discountValue: number; targetType: 'order' | 'package' | 'activity' | 'addon'; targetIds: string[]; eligibleCents: number };
export type CommerceQuoteLine = { label: string; quantity: number; unitAmountCents: number; totalCents: number; subtotalCents?: number; discountCents?: number; activityAmounts?: Record<string, number>; participantIndex?: number; kind: 'package' | 'addon' | 'upgrade'; packageId?: string; addonId?: string; tierId?: string; activityIds: string[] };
export type CommerceQuote = { totalCents: number; subtotalCents?: number; discountCents?: number; discount?: CommerceDiscountSnapshot; discountExcludedActivityIds?: string[]; lines: CommerceQuoteLine[]; participants: CommerceParticipant[] };
export type CommerceOrderState = 'reserved' | 'awaiting_payment' | 'fulfilled' | 'expired' | 'payment_failed' | 'refund_required' | 'refund_pending' | 'refunded';
export type CommerceOrder = {
  id: string; request_id: string; event_id: string; buyer_email: string; locale: 'it' | 'en' | 'de' | 'es'; state: CommerceOrderState;
  attendees?: CommerceAttendee[] | null; attendee_privacy_version?: string | null;
  affiliate_id?: string | null; affiliate_name?: string | null;
  amount_cents: number; quote: CommerceQuote; participants: CommerceParticipant[]; demand: Record<string, number>;
  event_snapshot: { slug: string; titolo: string | Record<string, string>; data_inizio: string; location: string | null; commerce_config?: CommerceConfig };
  upgrade_pass_id: string | null; expires_at: string; stripe_session_id: string | null; stripe_payment_intent: string | null;
  refund_id: string | null; refund_status: string | null; failure_reason: string | null; email_sent_at: string | null; email_claimed_at: string | null;
  upgrade_snapshot: { package_id: string; package_name: string; package_paid_cents: number; package_activity_ids?: string[] } | null;
  created_at: string; updated_at: string;
};
export type CommercePass = { id: string; event_id: string; order_id: string; participant_index?: number | null; affiliate_id?: string | null; affiliate_name?: string | null; first_name: string; last_name: string; package_id: string; package_name: string; package_paid_cents: number; package_activity_ids: string[]; original_package_paid_cents: number; qr_code: string; status: 'paid' | 'refunded' | 'canceled'; created_at: string };
export type CommerceEntitlement = { id: string; pass_id: string; event_id: string; order_id: string; activity_id: string; activity_name: string; kind: CommerceActivityKind; menu_choice: string | null; status: 'valid' | 'used' | 'refunded' | 'canceled'; checked_in_at: string | null; created_at: string };
