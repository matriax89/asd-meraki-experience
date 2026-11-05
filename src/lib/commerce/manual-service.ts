import type { SupabaseClient } from '@supabase/supabase-js';
import { getLocalizedText } from '@/lib/i18n-utils';
import { publicEventAffiliates } from '@/lib/events/affiliates';
import { parseCommerceConfig } from './config';
import { CommerceRequestError } from './http';
import { manualAttendees, type ManualEnrollment, type ManualSelection } from './manual-schema';
import type { CommerceOrder, CommercePass } from './types';

export type ManualStaff = { admin: SupabaseClient; userId: string };
const unavailable = () => new CommerceRequestError('Evento o biglietto non disponibile.', 404);

async function existingPass(db: SupabaseClient, eventId: string, id: string) {
  const { data: pass, error } = await db.from('commerce_passes')
    .select('id,event_id,order_id,first_name,last_name,package_id,package_activity_ids,package_paid_cents,qr_code,status').eq('id', id).eq('event_id', eventId).maybeSingle();
  if (error) throw error;
  if (!pass) throw unavailable();
  const { data: order, error: orderError } = await db.from('commerce_orders').select('buyer_email').eq('id', pass.order_id).single();
  if (orderError || !order) throw orderError || unavailable();
  return { pass, buyerEmail: order.buyer_email as string };
}

export async function manualEnrollmentContext(staff: ManualStaff, eventId: string | null, upgradePassId: string | null, locale: string) {
  if (!eventId) {
    const { data, error } = await staff.admin.from('events').select('id,titolo,data_inizio,commerce_config')
      .eq('attivo', true).is('canceled_at', null).gt('data_inizio', new Date().toISOString()).order('data_inizio');
    if (error) throw error;
    return { events: (data || []).filter(row => parseCommerceConfig(row.commerce_config)?.enabled).map(row => ({ id: row.id, title: getLocalizedText(row.titolo, locale), startsAt: row.data_inizio })) };
  }
  const { data: event, error } = await staff.admin.from('events').select('id,titolo,data_inizio,commerce_config,affiliates,attivo,canceled_at,cta_tipo').eq('id', eventId).maybeSingle();
  if (error) throw error;
  const config = parseCommerceConfig(event?.commerce_config);
  if (!event || !event.attivo || event.canceled_at || (event.cta_tipo || 'stripe') !== 'stripe' || !config?.enabled || Date.parse(event.data_inizio) <= Date.now()) throw unavailable();
  const { data: availability, error: availabilityError } = await staff.admin.rpc('commerce_availability', { p_event_id: eventId });
  if (availabilityError) throw availabilityError;
  const upgrade = upgradePassId ? await existingPass(staff.admin, eventId, upgradePassId) : null;
  if (upgrade) {
    const { data: blocked, error: blockedError } = await staff.admin.rpc('meraki_pass_refund_blocked', { p_pass_id: upgrade.pass.id });
    if (blockedError) throw blockedError;
    if (!config.upgradesEnabled || upgrade.pass.status !== 'paid' || blocked) throw new CommerceRequestError('Questo biglietto non può essere aggiornato.', 409);
  }
  const rights = upgrade ? await staff.admin.from('commerce_entitlements').select('activity_id,menu_choice').eq('pass_id', upgrade.pass.id).in('status', ['valid', 'used']) : { data: [], error: null };
  if (rights.error) throw rights.error;
  return {
    event: { id: event.id, title: getLocalizedText(event.titolo, locale), startsAt: event.data_inizio }, config, availability,
    affiliates: publicEventAffiliates(event.affiliates),
    ...(upgrade ? { upgrade: { id: upgrade.pass.id, firstName: upgrade.pass.first_name, lastName: upgrade.pass.last_name, buyerEmail: upgrade.buyerEmail,
      packageId: upgrade.pass.package_id, packageActivityIds: upgrade.pass.package_activity_ids, packagePaidCents: upgrade.pass.package_paid_cents,
      ownedActivityIds: (rights.data || []).map(right => right.activity_id as string),
      menuChoices: Object.fromEntries((rights.data || []).filter(right => right.menu_choice).map(right => [right.activity_id, right.menu_choice])) } } : {}),
  };
}

export async function manualEnrollmentQuote(staff: ManualStaff, selection: ManualSelection) {
  const upgrade = selection.upgradePassId ? await existingPass(staff.admin, selection.eventId, selection.upgradePassId) : null;
  const participants = upgrade ? selection.participants.map(person => ({ ...person, firstName: upgrade.pass.first_name, lastName: upgrade.pass.last_name })) : selection.participants;
  const { data, error } = await staff.admin.rpc(selection.discountCode ? 'quote_event_commerce_discount' : 'quote_event_commerce', {
    p_event_id: selection.eventId, p_participants: participants, p_upgrade_pass_id: upgrade?.pass.id || null, p_upgrade_token: upgrade?.pass.qr_code || null,
    ...(selection.discountCode ? { p_discount_code: selection.discountCode } : {}),
  });
  if (error) throw error;
  // The public pricing result may contain a snapshot; expose just the quote.
  return data?.error ? { error: data.error as string } : { quote: data.quote };
}

export async function recordManualEnrollment(staff: ManualStaff, body: ManualEnrollment) {
  const attendees = manualAttendees(body);
  if (!body.upgradePassId && !attendees) throw new CommerceRequestError('Inserisci per ogni partecipante contatti e codice fiscale italiano o documento estero validi. Il marketing non viene attivato da questa registrazione.');
  const upgrade = body.upgradePassId ? await existingPass(staff.admin, body.eventId, body.upgradePassId) : null;
  const participants = upgrade ? body.participants.map(person => ({ ...person, firstName: upgrade.pass.first_name, lastName: upgrade.pass.last_name })) : body.participants;
  const { data, error } = await staff.admin.rpc('record_manual_commerce_enrollment', {
    p_actor_id: staff.userId, p_request_id: body.requestId, p_event_id: body.eventId, p_buyer_email: upgrade?.buyerEmail || body.buyerEmail,
    p_locale: body.locale, p_participants: participants, p_attendees: attendees, p_expected_total_cents: body.expectedTotalCents,
    p_payment_method: body.paymentMethod, p_paid_at: body.paidAt, p_payment_reference: body.paymentReference || null,
    p_fee_cents: body.feeCents, p_note: body.note || null, p_discount_code: body.discountCode || null,
    p_affiliate_id: upgrade ? null : body.affiliateId || null, p_upgrade_pass_id: upgrade?.pass.id || null,
  });
  if (error) throw error;
  return data as { orderId: string; passIds: string[]; replayed: boolean; error?: string };
}

/** Financial recording is committed before email. A retry can only deliver an existing order. */
export async function deliverManualEnrollment(staff: ManualStaff, orderId: string): Promise<'sent' | 'pending'> {
  const { data, error } = await staff.admin.from('commerce_orders').select('*').eq('id', orderId).in('payment_method', ['cash', 'pos']).maybeSingle();
  if (error) throw error;
  if (!data) throw unavailable();
  const order = data as CommerceOrder;
  if (order.email_sent_at) return 'sent';
  if (order.state !== 'fulfilled') return 'pending';
  try {
    const query = staff.admin.from('commerce_passes').select('*');
    const { data: passes, error: passError } = order.upgrade_pass_id ? await query.eq('id', order.upgrade_pass_id) : await query.eq('order_id', order.id);
    if (passError || !passes?.length) throw passError || new Error('Pass missing');
    const { deliverCommerceOrder } = await import('@/lib/stripe/commerce');
    await deliverCommerceOrder(order, passes as CommercePass[]);
    const { data: refreshed, error: refreshedError } = await staff.admin.from('commerce_orders').select('email_sent_at').eq('id', orderId).single();
    return !refreshedError && refreshed?.email_sent_at ? 'sent' : 'pending';
  } catch {
    console.error('Manual enrollment ticket delivery pending.');
    return 'pending';
  }
}
