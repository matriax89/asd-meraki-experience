import { richText, eventDescription } from "./helpers/rich-text-modules.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
function load(relativePath, mocks = {}, env = {}) {
  const filename = fileURLToPath(new URL(relativePath, root));
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const sandboxModule = { exports: {} };
  vm.runInNewContext(source, {
    module: sandboxModule, exports: sandboxModule.exports, require: (name) => name in mocks ? mocks[name] : name === "@/lib/rich-text" ? richText : name === "@/components/public/event-description" ? eventDescription : name === "@/lib/events/activity-timing" ? load("src/lib/events/activity-timing.ts") : require(name),
    process: { env }, console: { error() {}, warn() {}, log() {} }, Buffer, URL, Request, Response,
    setTimeout, clearTimeout,
  }, { filename });
  return sandboxModule.exports;
}

const paidSession = {
  id: "cs_test_meraki000000001", payment_status: "paid", currency: "eur", mode: "payment", amount_total: 2500,
  payment_intent: "pi_meraki001",
  metadata: { event_id: "event-1", buyer_email: "buyer@example.test", reservation_id: "reservation-1", locale: "it", flow_type: "ticket_event" },
};
const buyerTicket = { id: "ticket-1", qr_code: "opaque-token", status: "paid", event_id: "event-1", email_sent_at: "2026-10-18T12:00:00Z" };

test("missing Stripe secret fails clearly, without a placeholder client", () => {
  const client = load("src/lib/stripe/client.ts");
  assert.throws(() => client.getStripe(), /Pagamenti non ancora configurati/);
});

test("Stripe account mismatch blocks payment; successful account is cached", async () => {
  let reads = 0;
  class StripeMock { accounts = { retrieve: async (id) => { assert.equal(id, null); reads++; return { id: "acct_matias" }; } }; }
  const wrong = load("src/lib/stripe/client.ts", { stripe: StripeMock }, { STRIPE_SECRET_KEY: "test-only", STRIPE_EXPECTED_ACCOUNT_ID: "acct_other" });
  await assert.rejects(wrong.getVerifiedStripe(), /non corrisponde/);
  const client = load("src/lib/stripe/client.ts", { stripe: StripeMock }, { STRIPE_SECRET_KEY: "test-only", STRIPE_EXPECTED_ACCOUNT_ID: "acct_matias" });
  await Promise.all([client.getVerifiedStripe(), client.getVerifiedStripe()]);
  assert.equal(reads, 2);
});

test("the default merchant is the authorized Meraki account and still rejects a different secret's account", async () => {
  let account = "acct_sportclubby";
  class StripeMock { accounts = { retrieve: async () => ({ id: account }) }; }
  const client = load("src/lib/stripe/client.ts", { stripe: StripeMock }, { STRIPE_SECRET_KEY: "test-only" });
  await assert.rejects(client.getVerifiedStripe(), /non corrisponde/);
  account = "acct_1UDprNJvhGysD0TP";
  assert.ok(await client.getVerifiedStripe());
});

test("Checkout uses server price, an expiring hold, locale and stable request idempotency", async () => {
  const calls = [];
  const payment = load("src/lib/stripe/checkout-ticket.ts", {
    "./client": { getVerifiedStripe: async () => ({ checkout: { sessions: { create: async (...args) => { calls.push(args); return { url: "https://checkout.stripe.com/test" }; } } } }) },
  });
  const args = { reservationId: "12345678-1111-4111-8111-123456789abc", eventId: "event-1", eventSlug: "serata", title: "Serata", priceCents: 2500,
    buyerEmail: "buyer@example.test", tipo: "evento", siteUrl: "https://meraki.example", locale: "de", expiresAt: "2026-10-18T15:35:00Z" };
  await payment.createTicketCheckoutSession(args);
  await payment.createTicketCheckoutSession(args);
  const [params, options] = calls[0];
  assert.equal(params.line_items[0].price_data.unit_amount, 2500);
  assert.equal(params.expires_at, Date.parse(args.expiresAt) / 1000);
  assert.equal(params.metadata.reservation_id, args.reservationId);
  assert.equal(params.metadata.locale, "de");
  assert.equal("payment_method_types" in params, false);
  assert.match(params.cancel_url, /\/de\/eventi\/serata\?checkout=cancelled$/);
  assert.match(params.integration_identifier, /^meraki-events-[a-z]{8}$/);
  assert.equal(options.idempotencyKey, calls[1][1].idempotencyKey);
  assert.equal(params.integration_identifier, calls[1][0].integration_identifier);
});

const attendee = load("src/lib/commerce/attendee.ts");
const checkoutBody = { eventId: "12345678-1111-4111-8111-123456789abc", buyerEmail: "buyer@example.test", buyerNome: "Matias", buyerCognome: "Lisio", locale: "it", checkoutAttemptId: "12345678-2222-4222-8222-123456789abc",
  attendee: { firstName: "Matias", lastName: "Lisio", email: "buyer@example.test", phone: "+393331234567", documentType: "codice_fiscale", documentCountry: "IT", documentNumber: "RSSMRA80A01H501U", marketingConsent: false },
};
function checkoutFor(reservationResult, client) {
  const creations = [];
  const rpcCalls = [];
  class ConfigurationError extends Error {}
  const checkout = load("src/app/api/checkout/ticket/route.ts", {
    "next/server": { NextResponse: Response }, "@/lib/i18n-utils": { getLocalizedText: (value) => value.it },
    "@/lib/stripe/client": { getVerifiedStripe: async () => client, PaymentConfigurationError: ConfigurationError },
    "@/lib/stripe/checkout-ticket": { createTicketCheckoutSession: async () => { creations.push(true); throw Error("Network timeout"); } },
    "@/lib/commerce/attendee": attendee,
    "@/lib/commerce/server": { commerceClient: () => ({ rpc: async (...args) => { rpcCalls.push(args); return { data: reservationResult }; } }) },
    "@/lib/supabase/server": { createAdminClient: () => ({ rpc: async (...args) => { rpcCalls.push(args); return { data: reservationResult }; } }) },
  }, { NEXT_PUBLIC_SITE_URL: "https://meraki.example" });
  return { creations, rpcCalls, post: (body = checkoutBody) => checkout.POST(new Request("https://meraki.example/api/checkout/ticket", {
    method: "POST", headers: { "Content-Type": "application/json", origin: "https://meraki.example" }, body: JSON.stringify(body),
  })) };
}

test("repeated Checkout request reuses existing session even near hold expiry", async () => {
  const checkout = checkoutFor({ reservation: { id: checkoutBody.checkoutAttemptId, stripe_session_id: paidSession.id, expires_at: new Date(Date.now() + 1000).toISOString() } }, {
    checkout: { sessions: { retrieve: async () => ({ status: "open", url: "https://checkout.stripe.com/existing" }) } },
  });
  const response = await checkout.post();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).url, "https://checkout.stripe.com/existing");
  assert.equal(checkout.creations.length, 0);
});

test("confirmed expired attempt returns a structured code for a safe new attempt", async () => {
  const checkout = checkoutFor({ error: "request_expired" }, {});
  const response = await checkout.post();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "request_expired");
});

test("an ambiguous Checkout creation failure preserves the hold for concurrent retries", async () => {
  const checkout = checkoutFor({ reservation: { id: checkoutBody.checkoutAttemptId, event_id: checkoutBody.eventId, titolo: { it: "Evento" },
    locale: "it", tipo: "evento", slug: "evento", amount_cents: 2500, expires_at: new Date(Date.now() + 35 * 60 * 1000).toISOString() } }, {});
  assert.equal((await checkout.post()).status, 500);
  assert.equal(checkout.creations.length, 1);
  assert.equal(checkout.rpcCalls.length, 1);
  assert.equal(checkout.rpcCalls[0][0], "reserve_event_ticket_affiliate");
  assert.equal(checkout.rpcCalls[0][1].p_attendee.email, checkoutBody.buyerEmail);
  assert.equal(checkout.rpcCalls[0][1].p_attendee.marketingConsent, false);
  assert.equal(checkout.rpcCalls[0][1].p_privacy_version, attendee.ATTENDEE_PRIVACY_VERSION);
});

test("guest single ticket checkout requires valid private contacts but never requires an account or marketing consent", async () => {
  const checkout = checkoutFor({ error: "sold_out" }, {});
  const accepted = await checkout.post({ ...checkoutBody, locale: "es" });
  assert.equal(accepted.status, 409);
  assert.equal(checkout.rpcCalls[0][0], "reserve_event_ticket_affiliate");
  assert.equal(checkout.rpcCalls[0][1].p_locale, "es");
  assert.equal(checkout.rpcCalls[0][1].p_attendee.marketingConsent, false);
  assert.equal(checkout.rpcCalls[0][1].userId, undefined);
  for (const contact of [undefined, { ...checkoutBody.attendee, email: "other@example.test" }, { ...checkoutBody.attendee, documentNumber: "RSSMRA80A01H501A" }, { ...checkoutBody.attendee, phone: "3331234567" }]) {
    assert.equal((await checkout.post({ ...checkoutBody, attendee: contact })).status, 400);
  }
  assert.equal(checkout.rpcCalls.length, 1);
});

test("single-ticket affiliate attribution is optional and an untrusted label never reaches the reservation", async () => {
  const checkout = checkoutFor({ error: "sold_out" }, {});
  const affiliateId = "20000000-0000-4000-8000-000000000001";
  assert.equal((await checkout.post({ ...checkoutBody, affiliateId, affiliateName: "Untrusted name" })).status, 409);
  assert.equal(checkout.rpcCalls[0][1].p_affiliate_id, affiliateId);
  assert.equal(checkout.rpcCalls[0][1].affiliateName, undefined);
  assert.equal((await checkout.post()).status, 409);
  assert.equal(checkout.rpcCalls[1][1].p_affiliate_id, null);
  assert.equal((await checkout.post({ ...checkoutBody, affiliateId: "not-an-id" })).status, 400);
  assert.equal(checkout.rpcCalls.length, 2);
});

test("unpaid asynchronous checkout never issues a ticket", async () => {
  const fulfillment = load("src/lib/stripe/fulfill-ticket.ts", {
    "@/lib/supabase/server": { createAdminClient: () => { throw Error("No database write expected"); } },
    "@/lib/resend/client": {}, "./client": {},
  });
  await fulfillment.fulfillTicketSession({ ...paidSession, payment_status: "unpaid" });
});

test("a fulfilled payment retry returns existing ticket and skips delivered email", async () => {
  const rpcCalls = [];
  const fulfillment = load("src/lib/stripe/fulfill-ticket.ts", {
    "@/lib/supabase/server": { createAdminClient: () => ({ rpc: async (...args) => { rpcCalls.push(args); return { data: { outcome: "fulfilled", ticket: buyerTicket } }; } }) },
    "@/lib/resend/client": { sendTicketConfirmation: () => { throw Error("No duplicate email expected"); } }, "./client": {},
  });
  await fulfillment.fulfillTicketSession(paidSession);
  await fulfillment.fulfillTicketSession(paidSession);
  assert.equal(rpcCalls.length, 2);
  assert.equal(rpcCalls[0][0], "fulfill_event_ticket");
  assert.equal(rpcCalls[0][1].p_amount_cents, 2500);
  assert.equal(rpcCalls[0][1].p_session_id, paidSession.id);
});

test("late paid checkout without capacity requests one idempotent refund", async () => {
  const refunds = [];
  const updates = [];
  const fulfillment = load("src/lib/stripe/fulfill-ticket.ts", {
    "@/lib/supabase/server": { createAdminClient: () => ({
      rpc: async () => ({ data: { outcome: "refund_required", reservation_id: "reservation-1" } }),
      from: () => ({ update: (values) => { updates.push(values); return { eq: () => ({ neq: async () => ({ error: null }) }) }; } }),
    }) },
    "@/lib/resend/client": {},
    "./client": { getVerifiedStripe: async () => ({ refunds: { create: async (...args) => { refunds.push(args); return { id: "re_one", status: "pending" }; } } }) },
  });
  await fulfillment.fulfillTicketSession(paidSession);
  await fulfillment.fulfillTicketSession(paidSession);
  assert.equal(refunds[0][0].payment_intent, paidSession.payment_intent);
  assert.equal(refunds[0][1].idempotencyKey, refunds[1][1].idempotencyKey);
  assert.equal(updates[0].state, "refund_pending");
});

test("stale refund events and pending refund saves cannot regress an already succeeded refund", async () => {
  const reservation = { state: "refunded" };
  const filters = [];
  const fulfillment = load("src/lib/stripe/fulfill-ticket.ts", {
    "@/lib/supabase/server": { createAdminClient: () => ({
      rpc: async () => ({ data: { outcome: "refund_required", reservation_id: "reservation-1" } }),
      from: () => ({ update: (values) => ({ eq: () => {
        const query = {
          neq: (column, value) => { filters.push([column, value]); query.skip = reservation[column] === value; return query; },
          then: (resolve) => { if (!query.skip) Object.assign(reservation, values); resolve({ error: null }); },
        };
        return query;
      } }) }),
    }) },
    "@/lib/resend/client": {},
    "./client": { getVerifiedStripe: async () => ({ refunds: { create: async () => ({ id: "re_one", status: "pending" }) } }) },
  });
  await fulfillment.updateTicketRefund({ id: "re_one", status: "pending", metadata: { meraki_reservation_id: "reservation-1" } });
  assert.equal(reservation.state, "refunded");
  await fulfillment.fulfillTicketSession(paidSession);
  assert.equal(reservation.state, "refunded");
  assert.deepEqual(filters, [["state", "refunded"], ["state", "refunded"]]);
  reservation.state = "refund_pending";
  await fulfillment.updateTicketRefund({ id: "re_one", status: "succeeded", metadata: { meraki_reservation_id: "reservation-1" } });
  assert.equal(reservation.state, "refunded");
});

test("fully refunded charges use the atomic persistent revocation RPC", async () => {
  const calls = [];
  const fulfillment = load("src/lib/stripe/fulfill-ticket.ts", {
    "@/lib/supabase/server": { createAdminClient: () => ({ rpc: async (...args) => { calls.push(args); return { error: null }; } }) },
    "@/lib/resend/client": {}, "./client": {},
  });
  await fulfillment.revokeRefundedTicket({ refunded: false, payment_intent: "pi_partial" });
  assert.equal(calls.length, 0);
  await fulfillment.revokeRefundedTicket({ refunded: true, payment_intent: "pi_refunded" });
  assert.equal(calls[0][0], "revoke_event_ticket");
  assert.equal(calls[0][1].p_payment_intent, "pi_refunded");
});

test("database failure leaves webhook retryable", async () => {
  const fulfillment = load("src/lib/stripe/fulfill-ticket.ts", {
    "@/lib/supabase/server": { createAdminClient: () => ({ rpc: async () => ({ error: { message: "offline" } }) }) },
    "@/lib/resend/client": {}, "./client": {},
  });
  await assert.rejects(fulfillment.fulfillTicketSession(paidSession), /transaction failed/);
});

test("ticket email contains escaped content, secure link and attached QR", async () => {
  let delivered;
  class ResendMock { emails = { send: async (...args) => { delivered = args; return { error: null }; } }; }
  const mail = load("src/lib/resend/client.ts", {
    "@/lib/email/meraki-template": load("src/lib/email/meraki-template.ts"),
    "@/lib/events/travel-link": load("src/lib/events/travel-link.ts", { "@/lib/events/logistics": load("src/lib/events/logistics.ts") }),
    resend: { Resend: ResendMock }, nodemailer: {}, qrcode: { toBuffer: async () => Buffer.from("png") },
    "@/lib/i18n-utils": { getLocalizedText: (value, locale) => value[locale] || value.it },
    "@/lib/supabase/server": { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }) }) },
  }, { RESEND_API_KEY: "test-only", NEXT_PUBLIC_SITE_URL: "https://meraki.example" });
  const result = await mail.sendTicketConfirmation({ ...buyerTicket, buyer_email: "buyer@example.test" }, {
    titolo: { it: "Serata <Meraki>" }, data_inizio: "2026-11-18T19:00:00Z", location: "Roma", indirizzo: null,
  });
  assert.equal(result.success, true);
  assert.match(delivered[0].html, /Serata &lt;Meraki&gt;/);
  assert.match(delivered[0].html, /https:\/\/meraki.example\/it\/biglietto\/ticket-1\?token=opaque-token/);
  assert.equal(delivered[0].html.includes("${"), false);
  assert.equal(delivered[0].attachments[0].contentId, "meraki-ticket");
  assert.equal(delivered[1].idempotencyKey, "meraki-ticket-ticket-1");
});

function webhookFor(event, { invalidSignature = false } = {}) {
  const calls = [];
  const handler = load("src/app/api/webhook/stripe/route.ts", {
    "next/server": { NextResponse: Response }, "@/lib/i18n-utils": {},
    "@/lib/stripe/client": {
      getStripe: () => ({ webhooks: { constructEvent: () => { if (invalidSignature) throw Error("invalid"); return event; } } }),
      getVerifiedStripe: async () => ({ checkout: { sessions: { retrieve: async () => event.data.object } } }),
    },
    "@/lib/stripe/ticket-status": { isTicketSession: (session) => session.metadata?.flow_type === "ticket_event" },
    "@/lib/stripe/fulfill-ticket": {
      fulfillTicketSession: async () => calls.push("fulfill"), transitionTicketSession: async (_, state) => calls.push(state),
      updateTicketRefund: async () => calls.push("refund"), revokeRefundedTicket: async () => calls.push("revoke"),
    },
    "@/lib/supabase/server": { createAdminClient: () => { throw Error("No legacy side effects expected"); } }, "@/lib/resend/client": {},
  }, { STRIPE_WEBHOOK_SECRET: "test-only" });
  return { calls, post: () => handler.POST(new Request("https://meraki.example/api/webhook/stripe", { method: "POST", body: "{}", headers: { "stripe-signature": "test-signature" } })) };
}

test("invalid webhook signature cannot dispatch any payment side effect", async () => {
  const hook = webhookFor({ type: "checkout.session.completed", data: { object: paidSession } }, { invalidSignature: true });
  assert.equal((await hook.post()).status, 400);
  assert.deepEqual(hook.calls, []);
});

test("webhook lifecycle covers paid, asynchronous pending/success/failure and expiration", async () => {
  const cases = [
    ["checkout.session.completed", paidSession, "fulfill"],
    ["checkout.session.completed", { ...paidSession, payment_status: "unpaid" }, "awaiting_payment"],
    ["checkout.session.async_payment_succeeded", paidSession, "fulfill"],
    ["checkout.session.async_payment_failed", { ...paidSession, payment_status: "unpaid" }, "payment_failed"],
    ["checkout.session.expired", { ...paidSession, payment_status: "unpaid", status: "expired" }, "expired"],
    ["charge.refunded", {}, "revoke"],
  ];
  for (const [type, session, expected] of cases) {
    const hook = webhookFor({ type, data: { object: session } });
    assert.equal((await hook.post()).status, 200, type);
    assert.deepEqual(hook.calls, [expected], type);
  }
});

test("single-ticket discount requires an explicit net confirmation and canonical reservation", async () => {
  const checkout = checkoutFor({ error: "discount_limit" }, {});
  const missing = await checkout.post({ ...checkoutBody, discountCode: "WS20" });
  assert.equal(missing.status, 400);
  assert.equal(checkout.rpcCalls.length, 0);
  const response = await checkout.post({ ...checkoutBody, discountCode: " ws20 ", expectedTotalCents: 2000 });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "discount_limit");
  assert.equal(checkout.rpcCalls[0][0], "reserve_event_ticket_affiliate");
  assert.equal(checkout.rpcCalls[0][1].p_discount_code, "WS20");
  assert.equal(checkout.rpcCalls[0][1].p_attendee.email, checkoutBody.buyerEmail);
});

test("single-ticket changed discount amount releases its new hold before any payment", async () => {
  const quote = { subtotalCents: 2500, discountCents: 400, totalCents: 2100 };
  const checkout = checkoutFor({ reservation: { id: checkoutBody.checkoutAttemptId, amount_cents: 2100, discount_quote: quote, stripe_session_id: null } }, {});
  const response = await checkout.post({ ...checkoutBody, discountCode: "SAVE", expectedTotalCents: 2000 });
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, "price_changed");
  assert.deepEqual(body.quote, quote);
  assert.equal(checkout.creations.length, 0);
  assert.equal(checkout.rpcCalls[1][0], "transition_ticket_reservation");
});

test("buyer email is normalized before reservation and Stripe metadata identity", async () => {
  const checkout = checkoutFor({ error: "sold_out" }, {});
  await checkout.post({ ...checkoutBody, buyerEmail: " BUYER@EXAMPLE.TEST " });
  assert.equal(checkout.rpcCalls[0][1].p_buyer_email, "buyer@example.test");
});
