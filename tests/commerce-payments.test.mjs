import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
const plain = value => JSON.parse(JSON.stringify(value));
function load(path, mocks = {}, env = {}) {
  const filename = fileURLToPath(new URL(`../${path}`, import.meta.url));
  const source = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, require: name => name in mocks ? mocks[name] : require(name), console: { error() {} }, URL, Request, Response, process: { env }, Map, Date }, { filename });
  return compiledModule.exports;
}
const config = load("src/lib/commerce/config.ts");
const attendee = load("src/lib/commerce/attendee.ts");
const http = load("src/lib/commerce/http.ts", { "./config": config });
const eventId = "12345678-1111-4111-8111-123456789abc";
const orderId = "12345678-2222-4222-8222-123456789abc";
const sessionId = "cs_test_commerce000000001";
const person = { firstName: "Ada", lastName: "Rossi", packageId: "full", addonIds: ["dinner"], menuChoices: { dinner: "Vegetariano" } };
const contact = { firstName: "Ada", lastName: "Rossi", email: "buyer@example.test", phone: "+393331234567", documentType: "codice_fiscale", documentCountry: "IT", documentNumber: "RSSMRA80A01H501U", marketingConsent: false };
const order = { id: orderId, event_id: eventId, buyer_email: "buyer@example.test", locale: "it", amount_cents: 8500, quote: { lines: [
  { label: "WS + MC · Standard", quantity: 1, unitAmountCents: 6000, totalCents: 6000, kind: "package" },
  { label: "Cena", quantity: 1, unitAmountCents: 2500, totalCents: 2500, kind: "addon" },
] }, expires_at: new Date(Date.now() + 35 * 60000).toISOString(), stripe_session_id: null, state: "reserved" };
const paid = { id: sessionId, mode: "payment", currency: "eur", payment_status: "paid", amount_total: 8500, payment_intent: "pi_commerce_1", metadata: { flow_type: "event_commerce", commerce_order_id: orderId, event_id: eventId } };
const baseMocks = { "@/lib/commerce/server": {}, "@/lib/resend/client": {}, "@/lib/email/marketing": { prepareMarketingEmailLinks: async () => undefined }, "./ticket-status": { ticketUrl: pass => `/it/biglietto/${pass.id}?token=${pass.qr_code}` } };

test("commerce Checkout groups repeated selections without changing authoritative totals", async () => {
  let params, options;
  const mod = load("src/lib/stripe/commerce.ts", { ...baseMocks, "./client": { getVerifiedStripe: async () => ({ checkout: { sessions: { create: async (p, o) => { params = p; options = o; return {}; } } } }) } });
  const multi = { ...order, attendees: [contact, contact], amount_cents: 17000, quote: { lines: [...order.quote.lines, ...order.quote.lines] } };
  await mod.createCommerceSession(multi, "https://meraki.example");
  assert.equal(params.line_items.length, 2);
  assert.equal(params.line_items[0].quantity, 2);
  assert.equal(params.line_items[1].quantity, 2);
  assert.equal(params.line_items.reduce((n, l) => n + l.quantity * l.price_data.unit_amount, 0), 17000);
  assert.equal(params.metadata.commerce_order_id, orderId);
  assert.equal(params.metadata.flow_type, "event_commerce");
  assert.equal(params.metadata.documentNumber, undefined);
  assert.equal(params.metadata.attendees, undefined);
  assert.equal(JSON.stringify(params).includes(contact.documentNumber), false);
  assert.equal(JSON.stringify(params).includes(contact.phone), false);
  assert.equal(params.payment_method_types, undefined);
  assert.equal(options.idempotencyKey, `meraki-commerce-${orderId}`);
  await assert.rejects(mod.createCommerceSession({ ...order, amount_cents: 1 }, "https://meraki.example"), /totals/);
});

test("unpaid commerce sessions never touch fulfillment data", async () => {
  const mod = load("src/lib/stripe/commerce.ts", { ...baseMocks, "./client": {}, "@/lib/commerce/server": { commerceClient: () => { throw Error("No database writes"); } } });
  await mod.fulfillCommerceSession({ ...paid, payment_status: "unpaid" });
});

test("commerce webhook checks identity and passes stored buyer plus exact paid total to atomic fulfillment", async () => {
  const calls = [];
  const db = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: order }) }) }) }), rpc: async (name, args) => { calls.push([name, args]); return { data: { outcome: "refunded" } }; } };
  const mod = load("src/lib/stripe/commerce.ts", { ...baseMocks, "./client": {}, "@/lib/commerce/server": { commerceClient: () => db } });
  await mod.fulfillCommerceSession(paid);
  assert.equal(calls[0][0], "fulfill_event_commerce");
  assert.equal(calls[0][1].p_amount_cents, 8500);
  assert.equal(calls[0][1].p_buyer_email, order.buyer_email);
  assert.equal(calls[0][1].p_payment_intent, "pi_commerce_1");
  await assert.rejects(mod.fulfillCommerceSession({ ...paid, metadata: { ...paid.metadata, event_id: "other" } }), /mismatch/);
  await assert.rejects(mod.fulfillCommerceSession({ ...paid, currency: "usd" }), /Unexpected/);
});

test("succeeded refunds revoke accesses atomically before changing order state", async () => {
  const calls = [];
  const db = { rpc: async (...args) => { calls.push(args); return {}; }, from: () => { throw Error("No separate state mutation before revocation"); } };
  const mod = load("src/lib/stripe/commerce.ts", { ...baseMocks, "./client": {}, "@/lib/commerce/server": { commerceClient: () => db, missingCommerceMigration: () => false } });
  await mod.updateCommerceRefund({ id: "re_one", status: "succeeded", payment_intent: "pi_one", metadata: { meraki_commerce_order_id: orderId } });
  assert.equal(calls[0][0], "revoke_commerce_payment");
  assert.equal(calls[0][1].p_payment_intent, "pi_one");
});

test("expired or failed asynchronous orders remain distinguishable from processing", async () => {
  let current = { ...order, state: "expired" };
  const db = { from: () => ({ select: () => ({ eq() { return this; }, maybeSingle: async () => ({ data: current }) }) }) };
  const mod = load("src/lib/stripe/commerce.ts", { ...baseMocks, "./client": {}, "@/lib/commerce/server": { commerceClient: () => db } });
  assert.equal((await mod.getCommerceCheckoutStatus(paid, "it")).status, "expired");
  current = { ...order, state: "refund_pending" };
  assert.equal((await mod.getCommerceCheckoutStatus(paid, "it")).status, "refund_pending");
});

test("commerce checkout rejects cross-origin input and missing participant names before reserving", async () => {
  const route = load("src/app/api/commerce/checkout/route.ts", {
    "@/lib/commerce/http": http, "@/lib/commerce/server": { commerceClient: () => { throw Error("No reserve"); } },
    "@/lib/commerce/attendee": attendee,
    "@/lib/stripe/client": { getVerifiedStripe: () => { throw Error("No Stripe access"); }, PaymentConfigurationError: class extends Error {} }, "@/lib/stripe/commerce": {},
  });
  const body = { eventId, participants: [{ ...person, firstName: "" }], buyerEmail: "buyer@example.test", locale: "it", checkoutAttemptId: orderId };
  const request = origin => new Request("https://meraki.example/api/commerce/checkout", { method: "POST", headers: { Origin: origin }, body: JSON.stringify(body) });
  assert.equal((await route.POST(request("https://malicious.example"))).status, 403);
  assert.equal((await route.POST(request("https://meraki.example"))).status, 400);
});

test("commerce quote strips client money and permits blank names only for preview", async () => {
  let args;
  const route = load("src/app/api/commerce/quote/route.ts", { "@/lib/commerce/http": http, "@/lib/commerce/server": { commerceClient: () => ({ rpc: async (_, p) => { args = p; return { data: { quote: { totalCents: 8500 } } }; } }) } });
  const response = await route.POST(new Request("https://meraki.example/api/commerce/quote", { method: "POST", body: JSON.stringify({ eventId, totalCents: 1, participants: [{ ...person, firstName: "", lastName: "" }] }) }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).quote.totalCents, 8500);
  assert.equal(args.p_participants[0].firstName, "Partecipante");
  assert.equal(args.totalCents, undefined);
});

test("catalog availability uses a private RPC and missing migration falls back to existing tickets", async () => {
  const server = load("src/lib/commerce/server.ts", { "@supabase/supabase-js": { createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ error: { code: "42703" } }) }) }) }) }) }, "@/lib/i18n-utils": {}, "./config": config, "@/lib/tickets/wallet": {} });
  assert.deepEqual(plain(await server.getCommerceCatalog(eventId)), { config: null });
});

function checkoutEndpoint(savedOrder) {
  const calls = [];
  const route = load("src/app/api/commerce/checkout/route.ts", {
    "@/lib/commerce/http": http,
    "@/lib/commerce/attendee": attendee,
    "@/lib/commerce/server": { commerceClient: () => ({ rpc: async (name, args) => { calls.push([name, args]); return { data: name === "reserve_event_commerce" || name === "reserve_event_commerce_attendees" ? { order: savedOrder } : null }; } }) },
    "@/lib/stripe/client": { PaymentConfigurationError: class extends Error {}, getVerifiedStripe: async () => ({ checkout: { sessions: { retrieve: async () => ({ status: "open", url: "https://checkout.stripe.com/existing" }) } } }) },
    "@/lib/stripe/commerce": { createCommerceSession: async () => { throw Error("No additional Stripe session expected"); } },
  });
  return { calls, post: (expectedTotalCents = 8500, overrides = {}) => route.POST(new Request("https://meraki.example/api/commerce/checkout", { method: "POST", body: JSON.stringify({
    eventId, participants: [person], attendees: [contact], buyerEmail: "buyer@example.test", locale: "it", checkoutAttemptId: orderId, expectedTotalCents, ...overrides,
  }) })) };
}

test("a tier boundary requires explicit reconfirmation before starting any payment", async () => {
  const endpoint = checkoutEndpoint(order);
  const response = await endpoint.post(8000);
  assert.equal(response.status, 409);
  const result = await response.json();
  assert.equal(result.code, "price_changed");
  assert.deepEqual(result.quote, order.quote);
  assert.equal(endpoint.calls[1][0], "transition_commerce_order");
  assert.equal(endpoint.calls[1][1].p_state, "expired");
});

test("an ambiguous creation attempt keeps the original reservation and request key", async () => {
  const endpoint = checkoutEndpoint({ ...order, expires_at: new Date(Date.now() + 25 * 60000).toISOString() });
  const result = await (await endpoint.post()).json();
  assert.equal(result.code, "checkout_pending");
  assert.equal(endpoint.calls.length, 1);
  assert.equal(endpoint.calls[0][1].p_request_id, orderId);
  assert.equal(endpoint.calls[0][0], "reserve_event_commerce_attendees");
  assert.equal(endpoint.calls[0][1].p_privacy_version, attendee.ATTENDEE_PRIVACY_VERSION);
  assert.equal(endpoint.calls[0][1].p_attendees[0].email, contact.email);
  assert.equal(endpoint.calls[0][1].p_participants[0].email, undefined);
  assert.equal(endpoint.calls[0][1].p_participants[0].documentNumber, undefined);
});

test("guest commerce requires matching attendee contacts and accepts an unchecked marketing choice", async () => {
  const endpoint = checkoutEndpoint({ ...order, stripe_session_id: sessionId });
  assert.equal((await endpoint.post(8500, { locale: "es" })).status, 200);
  assert.equal(endpoint.calls[0][1].p_locale, "es");
  assert.equal(endpoint.calls[0][1].p_attendees[0].marketingConsent, false);
  for (const attendees of [undefined, [], [{ ...contact, firstName: "Other" }], [{ ...contact, email: "other@example.test" }], [{ ...contact, documentNumber: "RSSMRA80A01H501A" }]]) {
    assert.equal((await endpoint.post(8500, { attendees })).status, 400);
  }
  assert.equal(endpoint.calls.length, 1);
});

test("an existing verified pass upgrades without re-entering or exposing private identity data", async () => {
  const endpoint = checkoutEndpoint({ ...order, stripe_session_id: sessionId });
  const response = await endpoint.post(8500, { attendees: undefined, upgradePassId: eventId, upgradeToken: "secure-upgrade-token" });
  assert.equal(response.status, 200);
  assert.equal(endpoint.calls[0][0], "reserve_event_commerce");
  assert.equal(endpoint.calls[0][1].p_upgrade_pass_id, eventId);
  assert.equal(endpoint.calls[0][1].p_attendees, undefined);
});

test("an attached session is reused even when its remaining lifetime is under thirty minutes", async () => {
  const endpoint = checkoutEndpoint({ ...order, stripe_session_id: sessionId, expires_at: new Date(Date.now() + 1000).toISOString() });
  const response = await endpoint.post();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).url, "https://checkout.stripe.com/existing");
});

test("a held email lease stays retryable instead of silently losing delivery", async () => {
  const mod = load("src/lib/stripe/commerce.ts", { ...baseMocks, "./client": {}, "@/lib/commerce/server": { commerceClient: () => ({ rpc: async () => ({ data: false }) }) } });
  await assert.rejects(mod.deliverCommerceOrder(order), /retry later/);
});

function deliveryFixture(contacts) {
  const calls = [], deliveries = [], selected = [], marketingCalls = [];
  const db = {
    rpc: async (name, args) => { calls.push([name,args]); return { data: name === "claim_commerce_email" ? true : null, error: null }; },
    from: table => {
      const filters = {};
      return {
        select(columns) { selected.push([table,columns]); return this; },
        eq(column,value) { filters[column]=value; return this; },
        order(column,options) { assert.equal(column,"created_at");assert.equal(options.ascending,false);return this; },
        limit(number) { assert.equal(number,1);return this; },
        single: async () => ({ data: { titolo:{it:"Meraki Day"},data_inizio:"2027-08-01T10:00:00Z",location:"Merano",indirizzo:null } }),
        in: async () => ({ data:[{activity_name:filters.pass_id === "pass-luca" ? "Masterclass" : "Workshop"}],error:null }),
        maybeSingle: async () => ({ data:contacts[filters.pass_id] || null,error:null }),
      };
    },
  };
  const mod = load("src/lib/stripe/commerce.ts", {
    ...baseMocks,"./client":{},
    "@/lib/commerce/server":{commerceClient:()=>db,missingCommerceMigration:()=>false},
    "@/lib/resend/client":{sendTicketConfirmation:async(...args)=>{deliveries.push(args);return {success:true};}},
    "@/lib/email/marketing":{prepareMarketingEmailLinks:async(...args)=>{marketingCalls.push(args);return args[1]===0 ? {confirmUrl:"https://meraki.example/it/profilo/preferenze?token=opaque",unsubscribeUrl:"https://meraki.example/it/profilo/preferenze?token=revoke"}:undefined;}},
  });
  return {mod,calls,deliveries,selected,marketingCalls};
}

test("group ticket delivery uses each verified private recipient even when pass order differs from participant order", async () => {
  const privateDetails={document_number:contact.documentNumber,phone:contact.phone};
  const fixture=deliveryFixture({
    "pass-luca":{...privateDetails,email:"luca@example.test",order_id:orderId,participant_index:1},
    "pass-ada":{...privateDetails,email:contact.email,order_id:orderId,participant_index:0},
  });
  const passes=[{id:"pass-luca",qr_code:"qr-luca",first_name:"Luca",last_name:"Bianchi",participant_index:1},{id:"pass-ada",qr_code:"qr-ada",first_name:"Ada",last_name:"Rossi",participant_index:0}];
  await fixture.mod.deliverCommerceOrder({...order,attendees:[contact,{...contact,firstName:"Luca",lastName:"Bianchi",email:"luca@example.test"}]},passes);
  assert.deepEqual(plain(fixture.deliveries.map(args=>[args[0].buyer_email,args[0].qr_code])),[["luca@example.test","qr-luca"],[contact.email,"qr-ada"]]);
  assert.deepEqual(plain(fixture.deliveries.map(args=>args[3].accessNames)),[["Masterclass"],["Workshop"]]);
  assert.equal(fixture.deliveries[0][3].marketing,undefined);
  assert.match(fixture.deliveries[1][3].marketing.confirmUrl,/token=opaque$/);
  assert.deepEqual(plain(fixture.marketingCalls),[[orderId,1,"it"],[orderId,0,"it"]]);
  assert.equal(JSON.stringify(fixture.deliveries).includes(contact.documentNumber),false);
  assert.equal(JSON.stringify(fixture.deliveries).includes(contact.phone),false);
  assert.ok(fixture.selected.filter(([table])=>table==="commerce_attendee_contacts").every(([,columns])=>columns==="email,order_id,participant_index"));
  assert.equal(fixture.calls.at(-1)[0],"complete_commerce_email");
  assert.equal(fixture.calls.at(-1)[1].p_success,true);
});

test("a new guest order with missing recipient contact retries delivery instead of sending the wrong person a ticket", async () => {
  const fixture=deliveryFixture({});
  await assert.rejects(fixture.mod.deliverCommerceOrder({...order,attendees:[contact]},[{id:"pass-ada",qr_code:"qr-ada",first_name:"Ada",last_name:"Rossi",participant_index:0}]),/contact|recipient|delivery|missing/i);
  assert.equal(fixture.deliveries.length,0);
  assert.equal(fixture.calls.at(-1)[0],"complete_commerce_email");
  assert.equal(fixture.calls.at(-1)[1].p_success,false);
});

test("historical orders without attendee contacts retain buyer email delivery", async () => {
  const fixture=deliveryFixture({});
  await fixture.mod.deliverCommerceOrder(order,[{id:"old-pass",qr_code:"old-qr",first_name:"Ada",last_name:"Rossi"}]);
  assert.equal(fixture.deliveries[0][0].buyer_email,order.buyer_email);
  assert.equal(fixture.deliveries[0][0].qr_code,"old-qr");
  assert.equal(fixture.calls.at(-1)[1].p_success,true);
});

test("existing event editor cannot bypass transactional commerce configuration or counters", async () => {
  let saved;
  const actions = load("src/app/api/admin/eventi/actions.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/commerce/admin-auth": { requireCommerceStaff: async () => ({ from: () => ({ upsert: data => { saved = data; return { select: () => ({ single: async () => ({ data: { id: eventId } }) }) }; } }) }) },
  });
  const result = await actions.upsertEvent({ id: eventId, titolo: { it: "Evento" }, tipo: "evento", data_inizio: "2027-01-01T12:00:00Z", capacity: 50,
    commerce_config: { enabled: true }, posti_venduti: -500, stripe_price_id: "fake" });
  assert.equal(result.success, true);
  assert.equal(saved.commerce_config, undefined);
  assert.equal(saved.posti_venduti, undefined);
  assert.equal(saved.stripe_price_id, undefined);
  const unauthorized = load("src/app/api/admin/eventi/actions.ts", { "next/cache": {}, "@/lib/commerce/admin-auth": { requireCommerceStaff: async () => { throw Error("Unauthorized"); } } });
  await assert.rejects(unauthorized.upsertEvent({}), /Unauthorized/);
});
