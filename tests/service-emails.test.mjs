import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { JSDOM } from "jsdom";
const require = createRequire(import.meta.url);
function load(path, mocks = {}, env = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, require: name => name in mocks ? mocks[name] : name === "@/lib/events/activity-timing" ? load("src/lib/events/activity-timing.ts") : require(name), process: { env }, URL, Buffer, console: { error() {} } });
  return compiledModule.exports;
}
const template = load("src/lib/email/meraki-template.ts");
function fixture({ provider = "resend", deliveryError, settingsError, integrations = {}, missingKey = false } = {}) {
  const delivered = [];
  const transports = [];
  const settings = { email_provider: provider, admin_email: "organizzazione@example.test", ...integrations };
  const mail = load("src/lib/resend/client.ts", {
    "@/lib/email/meraki-template": template,
    "@/lib/i18n-utils": {}, "@/lib/events/travel-link": {}, qrcode: {},
    "@/lib/supabase/server": { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { value: { integrations: settings } }, error: settingsError }) }) }) }) }) },
    resend: { Resend: class { emails = { send: async value => { delivered.push(value); return { error: deliveryError, data: deliveryError ? null : { id: "local-capture" } }; } }; } },
    nodemailer: { createTransport: options => { transports.push(options); return { sendMail: async value => { delivered.push(value); if (deliveryError) throw new Error("private-provider-error"); return { messageId: "local-capture" }; } }; } },
  }, { RESEND_API_KEY: missingKey ? "" : "local-test-only", NEXT_PUBLIC_SITE_URL: "https://meraki.example" });
  return { mail, delivered, transports };
}
const lead = { nome: '<Ada "Test">', cognome: "Rossi & Verdi", email: "ada@example.test", telefono: "+39000000000", messaggio: 'Prima riga\n<script>alert("no")</script>\nFine & seguito', source: "contact_form" };
const order = { numero_ordine: "MERAKI-123", buyer_nome: '<Ada "Test">', buyer_cognome: "Rossi & Verdi", buyer_email: "buyer@example.test", ship_address_line1: 'Via <Meraki> 1', ship_address_line2: "Interno & 2", ship_city: "Bolzano", ship_postal_code: "39100", ship_state: "BZ", ship_country: "Italia", shipping_cents: 500, total_cents: 4000 };
const items = [{ product_nome: "Maglia <Meraki>", variant_descrizione: 'M & "Nero"', quantita: 2, totale_cents: 4000 }];
function verifyShell(message, locale) {
  assert.ok(message.text?.trim(), "plain-text alternative is mandatory");
  assert.equal(message.to.includes("${"), false);
  assert.equal(message.from.includes("${"), false);
  assert.equal(message.html.includes("${"), false, "no literal template interpolation must reach the recipient");
  assert.equal(message.subject.includes("${"), false);
  assert.equal(message.from, "Meraki Experience <noreply@merakiexperience.org>");
  const dom = new JSDOM(message.html);
  const document = dom.window.document;
  assert.equal(document.documentElement.lang, locale);
  assert.equal(document.querySelector('img[alt="Meraki Experience"]').src, "https://meraki.example/images/logo-meraki-email.png");
  assert.equal(document.querySelectorAll("script,iframe,form").length, 0);
  assert.equal(document.querySelectorAll('a[href*="profilo/preferenze"]').length, 0, "an ordinary service email must never create a promotional consent link");
  for (const anchor of document.querySelectorAll("a")) assert.equal(new URL(anchor.href).origin, "https://meraki.example");
  assert.match(message.html, /#18251f/); assert.match(message.html, /#c2a36b/); assert.match(message.html, /#f5f4f0/);
  return dom;
}
for (const locale of ["it", "en", "de", "es"]) {
  test(`${locale}: contact and trial replies are translated, branded and escape submitted text`, async () => {
    const { mail, delivered } = fixture();
    assert.equal((await mail.sendAutoReply(lead, locale)).success, true);
    const message = delivered[0];
    assert.equal(message.to, lead.email);
    const dom = verifyShell(message, locale);
    assert.ok(dom.window.document.body.textContent.includes(lead.nome));
    const submitted = [...dom.window.document.querySelectorAll("div")].find(element => element.textContent === lead.messaggio.replaceAll("\n", ""));
    assert.ok(submitted); assert.equal(submitted.querySelectorAll("br").length, 2);
    assert.ok(message.text.includes(lead.messaggio));
    const action = [...dom.window.document.querySelectorAll("a")].find(anchor => anchor.textContent !== "");
    assert.equal(action.pathname, `/${locale}/eventi`);
    assert.ok(!message.subject.includes("ASD Meraki Experience"));
    dom.window.close();
    assert.equal((await mail.sendAutoReply({ ...lead, messaggio: null, source: "trial_form" }, locale)).success, true);
    const expected = { it: "Richiesta di prova gratuita", en: "Free trial request", de: "Anfrage für ein kostenloses Probetraining", es: "Solicitud de clase de prueba gratuita" }[locale];
    assert.ok(delivered[1].text.includes(expected));
  });
  test(`${locale}: paid shop receipt has real order details, localized labels and reconciled totals`, async () => {
    const { mail, delivered } = fixture();
    assert.equal((await mail.sendOrderConfirmation(order, items, locale)).success, true);
    const message = delivered[0];
    assert.equal(message.to, order.buyer_email);
    assert.ok(message.subject.includes(order.numero_ordine));
    const dom = verifyShell(message, locale);
    const text = dom.window.document.body.textContent;
    for (const detail of [order.numero_ordine, order.buyer_nome, order.ship_address_line1, order.ship_address_line2, order.ship_postal_code, items[0].product_nome, items[0].variant_descrizione, "× 2", "40,00", "5,00"]) {
      assert.ok(text.includes(detail), `Missing receipt detail ${detail}`);
      assert.ok(message.text.includes(detail), `Missing plaintext receipt detail ${detail}`);
    }
    const labels = { it: ["Spedizione", "Totale pagato", "Sconto applicato"], en: ["Shipping", "Total paid", "Discount applied"], de: ["Versand", "Bezahlter Gesamtbetrag", "Angewandter Rabatt"], es: ["Envío", "Total pagado", "Descuento aplicado"] }[locale];
    for (const label of labels) assert.ok(text.includes(label));
    assert.equal([...dom.window.document.querySelectorAll("a")].find(anchor => anchor.textContent !== "").pathname, `/${locale}/contatti`);
    dom.window.close();
  });
}
test("admin notifications use the configured admin, original logo, real details, safe reply-to and valid dashboard links", async () => {
  const { mail, delivered } = fixture();
  assert.equal((await mail.sendLeadNotification(lead)).success, true);
  assert.equal((await mail.sendOrderNotification(order, items)).success, true);
  for (const message of delivered) {
    assert.equal(message.to, "organizzazione@example.test");
    const dom = verifyShell(message, "it");
    const action = [...dom.window.document.querySelectorAll("a")].find(anchor => anchor.textContent !== "");
    assert.ok(["/it/admin/leads", "/it/admin/ordini"].includes(action.pathname));
    dom.window.close();
  }
  assert.equal(delivered[0].replyTo, lead.email);
  assert.ok(delivered[0].text.includes(lead.messaggio));
  assert.ok(delivered[1].text.includes(order.numero_ordine));
  assert.ok(delivered[1].text.includes("Maglia <Meraki>"));
});
test("all service senders reuse the existing SMTP configuration with real sender and plain text", async () => {
  const { mail, delivered, transports } = fixture({ provider: "smtp", integrations: { smtp_host: "smtp.example.test", smtp_port: "465", smtp_user: "sender@example.test", smtp_pass: "local-fake-only" } });
  for (const send of [() => mail.sendLeadNotification(lead), () => mail.sendAutoReply(lead, "es"), () => mail.sendOrderConfirmation(order, items, "de"), () => mail.sendOrderNotification(order, items)]) assert.equal((await send()).success, true);
  assert.equal(delivered.length, 4);
  for (const message of delivered) {
    assert.equal(message.from, "Meraki Experience <sender@example.test>");
    assert.ok(message.text.trim());
    assert.equal(message.html.includes("${"), false);
  }
  for (const transport of transports) { assert.equal(transport.secure, true); assert.equal(transport.port, 465); assert.equal(transport.auth.user, "sender@example.test"); }
});
test("all service senders report Resend and SMTP failures instead of claiming delivery", async () => {
  for (const provider of ["resend", "smtp"]) {
    const { mail } = fixture({ provider, deliveryError: { message: "private-provider-error" }, integrations: { smtp_host: "smtp.example.test", smtp_user: "sender@example.test", smtp_pass: "local-fake-only" } });
    for (const send of [() => mail.sendLeadNotification(lead), () => mail.sendAutoReply(lead), () => mail.sendOrderConfirmation(order, items), () => mail.sendOrderNotification(order, items)]) assert.equal((await send()).success, false);
  }
});
test("malformed recipients, missing configuration and unavailable settings never initiate delivery", async () => {
  for (const options of [{ missingKey: true }, { settingsError: { message: "db unavailable" } }, { provider: "smtp" }]) {
    const { mail, delivered } = fixture(options);
    assert.equal((await mail.sendAutoReply(lead, "es")).success, false);
    assert.equal(delivered.length, 0);
  }
  const { mail, delivered } = fixture();
  assert.equal((await mail.sendAutoReply({ ...lead, email: "attacker@example.test,extra@example.test" })).success, false);
  assert.equal((await mail.sendLeadNotification({ ...lead, email: 'evil@example.test\r\nBcc: extra@example.test' })).success, false);
  assert.equal(delivered.length, 0);
});
test("unsupported email locale safely falls back to Italian without adding arbitrary HTML attributes", async () => {
  const { mail, delivered } = fixture();
  assert.equal((await mail.sendAutoReply(lead, 'fr" onload="bad')).success, true);
  const dom = verifyShell(delivered[0], "it");
  assert.equal(dom.window.document.documentElement.getAttribute("onload"), null);
  dom.window.close();
});

test("admin notification fallbacks preserve their historical recipient while configured admin_email overrides both", async () => {
  for (const adminEmail of [undefined, "", "organizzatore@example.test"]) {
    const { mail, delivered } = fixture({ integrations: { admin_email: adminEmail } });
    assert.equal((await mail.sendLeadNotification(lead)).success, true);
    assert.equal((await mail.sendOrderNotification(order, items)).success, true);
    assert.equal(delivered[0].to, adminEmail || "info@merakiexperience.org");
    assert.equal(delivered[1].to, adminEmail || "amministrazione.meraki@gmail.com");
  }
});
