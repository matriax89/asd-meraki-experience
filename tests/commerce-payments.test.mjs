import { richText, eventDescription } from "./helpers/rich-text-modules.mjs";
import { youtubeModule } from "./helpers/youtube-modules.mjs";
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
  vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, require: name => name in mocks ? mocks[name] : name === "@/lib/events/youtube" ? youtubeModule : name === "@/lib/rich-text" ? richText : name === "@/components/public/event-description" ? eventDescription : name === "@/lib/events/affiliates" ? load("src/lib/events/affiliates.ts") : name === "@/lib/events/activity-timing" ? load("src/lib/events/activity-timing.ts") : require(name), console: { error() {} }, URL, Request, Response, process: { env }, Map, Date }, { filename });
  return compiledModule.exports;
}
const localization = load("src/lib/commerce/localization.ts");
const config = load("src/lib/commerce/config.ts");
const logistics = load("src/lib/events/logistics.ts");
const attendee = load("src/lib/commerce/attendee.ts");
const http = load("src/lib/commerce/http.ts", { "./config": config });
const eventId = "12345678-1111-4111-8111-123456789abc";
const orderId = "12345678-2222-4222-8222-123456789abc";
const sessionId = "cs_test_commerce000000001";
const person = { firstName: "Ada", lastName: "Rossi", packageId: "full", addonIds: ["dinner"], menuChoices: { dinner: "Vegetariano" } };
const contact = { firstName: "Ada", lastName: "Rossi", email: "buyer@example.test", phone: "+393331234567", documentType: "codice_fiscale", documentCountry: "IT", documentNumber: "RSSMRA80A01H501U", marketingConsent: false };
const order = { event_snapshot: {}, id: orderId, event_id: eventId, buyer_email: "buyer@example.test", locale: "it", amount_cents: 8500, quote: { lines: [
  { label: "WS + MC · Standard", quantity: 1, unitAmountCents: 6000, totalCents: 6000, kind: "package" },
  { label: "Cena", quantity: 1, unitAmountCents: 2500, totalCents: 2500, kind: "addon" },
] }, expires_at: new Date(Date.now() + 35 * 60000).toISOString(), stripe_session_id: null, state: "reserved" };
const paid = { id: sessionId, mode: "payment", currency: "eur", payment_status: "paid", amount_total: 8500, payment_intent: "pi_commerce_1", metadata: { flow_type: "event_commerce", commerce_order_id: orderId, event_id: eventId } };
const baseMocks = { "@/lib/commerce/localization": localization, "@/lib/commerce/server": {}, "@/lib/resend/client": {}, "@/lib/email/marketing": { prepareMarketingEmailLinks: async () => undefined }, "./ticket-status": { ticketUrl: pass => `/it/biglietto/${pass.id}?token=${pass.qr_code}` } };

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
  const server = load("src/lib/commerce/server.ts", { "@supabase/supabase-js": { createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ error: { code: "42703" } }) }) }) }) }) }, "@/lib/i18n-utils": {}, "./config": config, "./localization": load("src/lib/commerce/localization.ts"), "@/lib/tickets/wallet": {} });
  assert.deepEqual(plain(await server.getCommerceCatalog(eventId)), { config: null });
});

function checkoutEndpoint(savedOrder) {
  const calls = [];
  const route = load("src/app/api/commerce/checkout/route.ts", {
    "@/lib/commerce/http": http,
    "@/lib/commerce/attendee": attendee,
    "@/lib/commerce/server": { commerceClient: () => ({ rpc: async (name, args) => { calls.push([name, args]); return { data: name === "reserve_event_commerce_affiliate" ? { order: savedOrder } : null }; } }) },
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
  assert.equal(endpoint.calls[0][0], "reserve_event_commerce_affiliate");
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

test("commerce sends only an affiliate identifier to the authoritative reservation and defaults to direct purchase", async () => {
  const affiliateId = "20000000-0000-4000-8000-000000000001";
  const endpoint = checkoutEndpoint({ ...order, stripe_session_id: sessionId });
  assert.equal((await endpoint.post(8500, { affiliateId, affiliateName: "Untrusted name" })).status, 200);
  assert.equal(endpoint.calls[0][1].p_affiliate_id, affiliateId);
  assert.equal(endpoint.calls[0][1].affiliateName, undefined);
  assert.equal(endpoint.calls[0][1].p_discount_code, null);
  assert.equal((await endpoint.post()).status, 200);
  assert.equal(endpoint.calls[1][1].p_affiliate_id, null);
  assert.equal((await endpoint.post(8500, { affiliateId: "not-an-id" })).status, 400);
  assert.equal(endpoint.calls.length, 2);
});

test("an existing verified pass upgrades without re-entering or exposing private identity data", async () => {
  const endpoint = checkoutEndpoint({ ...order, stripe_session_id: sessionId });
  const response = await endpoint.post(8500, { attendees: undefined, upgradePassId: eventId, upgradeToken: "secure-upgrade-token", affiliateId: "20000000-0000-4000-8000-000000000001" });
  assert.equal(response.status, 200);
  assert.equal(endpoint.calls[0][0], "reserve_event_commerce_affiliate");
  assert.equal(endpoint.calls[0][1].p_upgrade_pass_id, eventId);
  assert.equal(endpoint.calls[0][1].p_attendees, null);
  assert.equal(endpoint.calls[0][1].p_affiliate_id, null, "Upgrades inherit attribution from the original verified pass");
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

function deliveryFixture(contacts, { eventConfig, rights: customRights } = {}) {
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
        single: async () => ({ data: { titolo:{it:"Meraki Day"},data_inizio:"2027-08-01T10:00:00Z",location:"Merano",indirizzo:null, commerce_config:eventConfig } }),
        in: async () => ({ data:customRights || (filters.pass_id === "pass-luca" ? [{activity_name:"Masterclass",menu_choice:null}] : [{activity_name:"Workshop",menu_choice:null},{activity_name:"Cena",menu_choice:"Vegetariano"}]),error:null }),
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
  const passes=[{id:"pass-luca",qr_code:"qr-luca",first_name:"Luca",last_name:"Bianchi",participant_index:1,package_name:"Solo Masterclass"},{id:"pass-ada",qr_code:"qr-ada",first_name:"Ada",last_name:"Rossi",participant_index:0,package_name:"Workshop + Cena"}];
  await fixture.mod.deliverCommerceOrder({...order,attendees:[contact,{...contact,firstName:"Luca",lastName:"Bianchi",email:"luca@example.test"}]},passes);
  assert.deepEqual(plain(fixture.deliveries.map(args=>[args[0].buyer_email,args[0].qr_code])),[["luca@example.test","qr-luca"],[contact.email,"qr-ada"]]);
  assert.deepEqual(plain(fixture.deliveries.map(args=>args[3].accessNames)),[["Masterclass"],["Workshop","Cena"]]);
  assert.deepEqual(plain(fixture.deliveries.map(args=>args[3].packageName)),["Solo Masterclass","Workshop + Cena"]);
  assert.deepEqual(plain(fixture.deliveries.map(args=>args[3].accessDetails)),[[{name:"Masterclass",menuChoice:null}],[{name:"Workshop",menuChoice:null},{name:"Cena",menuChoice:"Vegetariano"}]]);
  assert.equal(fixture.deliveries[0][3].marketing,undefined);
  assert.match(fixture.deliveries[1][3].marketing.confirmUrl,/token=opaque$/);
  assert.deepEqual(plain(fixture.marketingCalls),[[orderId,1,"it"],[orderId,0,"it"]]);
  assert.equal(JSON.stringify(fixture.deliveries).includes(contact.documentNumber),false);
  assert.equal(JSON.stringify(fixture.deliveries).includes(contact.phone),false);
  assert.ok(fixture.selected.filter(([table])=>table==="commerce_attendee_contacts").every(([,columns])=>columns==="email,order_id,participant_index"));
  assert.ok(fixture.selected.filter(([table])=>table==="commerce_entitlements").every(([,columns])=>columns.split(",").map(column=>column.trim()).sort().join(",")==="activity_id,activity_name,menu_choice,order_id"));
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

test("commerce delivery attaches only purchased activity times from the current organizer schedule and keeps snapshot names", async () => {
  const masterclass = { id:"mc", name:"Masterclass rinominata", checkInStartsAt:"2026-12-19T15:00:00Z", startsAt:"2026-12-19T15:30:00Z", endsAt:"2026-12-19T17:00:00Z" };
  const snapshot = { activities:[{id:"mc", name:"Masterclass originale", startsAt:"2026-12-19T14:00:00Z"}], packages:[] };
  for (const current of [true, false]) {
    const fixture = deliveryFixture({}, { eventConfig:current ? {activities:[{id:"ws",startsAt:"2026-12-19T11:30:00Z"},masterclass]} : null, rights:[{activity_id:"mc",activity_name:"Masterclass originale",menu_choice:null,order_id:orderId}] });
    await fixture.mod.deliverCommerceOrder({...order,event_snapshot:{commerce_config:snapshot}},[{id:"old-pass",qr_code:"old-qr",first_name:"Ada",last_name:"Rossi"}]);
    const access = plain(fixture.deliveries[0][3].accessDetails);
    assert.deepEqual(access, [{name:"Masterclass originale",menuChoice:null,...(current ? {checkInStartsAt:masterclass.checkInStartsAt,startsAt:masterclass.startsAt,endsAt:masterclass.endsAt} : {startsAt:snapshot.activities[0].startsAt})}]);
    assert.equal(access.some(item => item.startsAt === "2026-12-19T11:30:00Z"),false);
    assert.ok(fixture.selected.find(([table,fields])=>table === "events" && fields.includes("commerce_config")));
  }
});

test("existing event editor cannot bypass transactional commerce configuration or counters", async () => {
  let saved;
  const actions = load("src/app/api/admin/eventi/actions.ts", {
    "next/cache": { revalidatePath() {} },
    "@/lib/commerce/config": config,
    "@/lib/events/logistics": logistics,
    "@/lib/commerce/admin-auth": { requireCommerceStaff: async () => ({ from: () => ({ upsert: data => { saved = data; return { select: () => ({ single: async () => ({ data: { id: eventId } }) }) }; } }) }) },
  });
  const result = await actions.upsertEvent({ id: eventId, titolo: { it: "Evento" }, tipo: "evento", data_inizio: "2027-01-01T12:00:00Z", capacity: 50,
    commerce_config: { enabled: true }, posti_venduti: -500, stripe_price_id: "fake" });
  assert.equal(result.success, true);
  assert.equal(saved.commerce_config, undefined);
  assert.equal(saved.posti_venduti, undefined);
  assert.equal(saved.stripe_price_id, undefined);
  const unauthorized = load("src/app/api/admin/eventi/actions.ts", { "next/cache": {}, "@/lib/commerce/config": config, "@/lib/events/logistics": logistics, "@/lib/commerce/admin-auth": { requireCommerceStaff: async () => { throw Error("Unauthorized"); } } });
  await assert.rejects(unauthorized.upsertEvent({}), /Unauthorized/);
});

test("discounted commerce quote forwards only the normalized code and server selection", async () => {
  let name, args;
  const route = load("src/app/api/commerce/quote/route.ts", { "@/lib/commerce/http": http, "@/lib/commerce/server": { commerceClient: () => ({ rpc: async (rpc, input) => { name = rpc; args = input; return { data: { quote: { subtotalCents: 8500, discountCents: 1200, totalCents: 7300 } } }; } }) } });
  const response = await route.POST(new Request("https://meraki.example/api/commerce/quote", { method: "POST", body: JSON.stringify({ eventId, participants: [person], discountCode: "  ws20  ", discountCents: 8500, totalCents: 0 }) }));
  assert.equal(response.status, 200);
  assert.equal(name, "quote_event_commerce_discount");
  assert.equal(args.p_discount_code, "WS20");
  assert.equal(args.discountCents, undefined);
  assert.equal((await response.json()).quote.totalCents, 7300);
});

test("discount cannot be applied to an upgrade or start a payment without guest contact data", async () => {
  const endpoint = checkoutEndpoint(order);
  const result = await endpoint.post(8500, { discountCode: "WS20", upgradePassId: eventId, upgradeToken: "secure-upgrade-token", attendees: undefined });
  assert.equal(result.status, 409);
  assert.equal((await result.json()).code, "discount_upgrade_unsupported");
  assert.equal(endpoint.calls.length, 0);
});

test("discount checkout atomically reserves private contacts and compares the net price before Stripe", async () => {
  const calls = [];
  const net = { ...order, amount_cents: 7300, quote: { subtotalCents: 8500, discountCents: 1200, totalCents: 7300, lines: [] } };
  const route = load("src/app/api/commerce/checkout/route.ts", {
    "@/lib/commerce/http": http, "@/lib/commerce/attendee": attendee,
    "@/lib/commerce/server": { commerceClient: () => ({ rpc: async (name, args) => { calls.push([name, args]); return { data: name === "reserve_event_commerce_affiliate" ? { order: net } : null }; } }) },
    "@/lib/stripe/client": { PaymentConfigurationError: class extends Error {}, getVerifiedStripe: async () => ({}) },
    "@/lib/stripe/commerce": { createCommerceSession: async () => { throw Error("Price changed: no Stripe session"); } },
  });
  const response = await route.POST(new Request("https://meraki.example/api/commerce/checkout", { method: "POST", body: JSON.stringify({ eventId, participants: [person], attendees: [contact], buyerEmail: contact.email, locale: "es", checkoutAttemptId: orderId, expectedTotalCents: 7200, discountCode: "ws20" }) }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "price_changed");
  assert.equal(calls[0][0], "reserve_event_commerce_affiliate");
  assert.equal(calls[0][1].p_discount_code, "WS20");
  assert.equal(calls[0][1].p_locale, "es");
  assert.equal(calls[0][1].p_attendees[0].email, contact.email);
  assert.equal(calls[1][0], "transition_commerce_order");
});

test("Stripe displays frozen translated products and receives the exact net amount", async () => {
  let params;
  const mod = load("src/lib/stripe/commerce.ts", { ...baseMocks, "./client": { getVerifiedStripe: async () => ({ checkout: { sessions: { create: async p => { params = p; return {}; } } } }) } });
  await mod.createCommerceSession({ ...order, locale: "es", amount_cents: 5500, event_snapshot: { commerce_config: { packages: [{ id: "bundle", name: "WS + MC", nameTranslations: { es: "Taller + clase magistral" }, prices: [{ id: "standard", label: "Standard", labelTranslations: { es: "General" } }] }], addons: [] } }, quote: { subtotalCents: 6000, discountCents: 500, lines: [{ label: "WS + MC · Standard", packageId: "bundle", tierId: "standard", kind: "package", quantity: 1, unitAmountCents: 5500, totalCents: 5500 }] } }, "https://meraki.example");
  assert.equal(params.locale, "es");
  assert.equal(params.line_items[0].price_data.product_data.name, "Taller + clase magistral · General");
  assert.equal(params.line_items[0].price_data.unit_amount, 5500);
  assert.equal(params.allow_promotion_codes, undefined);
  assert.equal(params.discounts, undefined);
});

test("single-ticket quote is private, rejects cross-origin requests and forwards no client money", async () => {
  const calls = [];
  const route = load("src/app/api/checkout/ticket/quote/route.ts", { "@/lib/commerce/http": http, "@/lib/commerce/server": { commerceClient: () => ({ rpc: async (name, args) => { calls.push([name, args]); return { data: { quote: { subtotalCents: 3000, discountCents: 600, totalCents: 2400 } } }; } }) } });
  const request = origin => new Request("https://meraki.example/api/checkout/ticket/quote", { method: "POST", headers: { Origin: origin }, body: JSON.stringify({ eventId, discountCode: " single20 ", totalCents: 0 }) });
  assert.equal((await route.POST(request("https://other.example"))).status, 403);
  assert.equal(calls.length, 0);
  const response = await route.POST(request("https://meraki.example"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(plain(calls[0]), ["quote_event_ticket_discount", { p_event_id: eventId, p_discount_code: "SINGLE20" }]);
  assert.equal((await response.json()).quote.totalCents, 2400);
});

test("group confirmation translates package names from the frozen order", async () => {
  const saved = { ...order, state: "fulfilled", event_snapshot: { commerce_config: { packages: [{ id: "bundle", name: "Workshop e Masterclass", nameTranslations: { de: "Workshop und Masterclass" } }] } } };
  const db = { from: table => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: saved }), then(resolve) { return Promise.resolve({ data: [{ id: "pass-1", package_id: "bundle", package_name: "Workshop e Masterclass", first_name: "Ada", last_name: "Prova", status: "paid" }] }).then(resolve); } }) };
  const mod = load("src/lib/stripe/commerce.ts", { ...baseMocks, "./client": {}, "@/lib/commerce/server": { commerceClient: () => db } });
  const status = await mod.getCommerceCheckoutStatus(paid, "de");
  assert.equal(status.status, "ready");
  assert.equal(status.tickets[0].title, "Workshop und Masterclass");
});
