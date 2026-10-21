import { dateFormatModule } from "./helpers/date-format-modules.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { JSDOM } from "jsdom";

const require = createRequire(import.meta.url);
function load(path, mocks = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, require: name => name in mocks ? mocks[name] : name === "@/lib/events/date-format" ? dateFormatModule : require(name), process: { env: { NEXT_PUBLIC_SITE_URL: "https://meraki.example" } }, URL, Buffer, console: { error() {} } });
  return compiledModule.exports;
}
const baseTemplate = load("src/lib/email/meraki-template.ts");
const template = load("src/lib/email/refund-template.ts", { "./meraki-template": baseTemplate });
const refund = { to: "buyer@example.test", locale: "it", deliveryId: "018a0000-0000-4000-a000-000000000001", eventTitle: 'Vibra <Workshop> & "Masterclass"', status: "succeeded", amountCents: 1750, refundReference: "re_123example", fullRefund: false, reason: '<script>alert("unsafe")</script>\nCambio programma & dettagli', revokedAccessNames: ["Workshop <test>"], remainingAccessNames: ["Cena & amici"] };
const cancellation = { to: "buyer@example.test", locale: "it", deliveryId: "018a0000-0000-4000-a000-000000000002", eventTitle: refund.eventTitle, reason: refund.reason, refundExpected: true };

function inspect(message, locale) {
  const dom = new JSDOM(message.html); const document = dom.window.document;
  assert.equal(document.documentElement.lang, locale);
  assert.equal(document.querySelector('img[alt="Meraki Experience"]').src, "https://meraki.example/images/logo-meraki-email.png");
  assert.equal(document.querySelectorAll("script,iframe,form").length, 0);
  assert.equal(document.querySelectorAll('img[alt="QR"]').length, 0);
  assert.ok(document.body.textContent.includes(refund.eventTitle));
  assert.ok(document.body.textContent.includes(refund.reason.split("\n")[0]));
  assert.ok(message.text.includes(refund.reason));
  assert.ok(message.text.trim());
  assert.ok(!message.subject.includes("\n"));
  for (const link of document.querySelectorAll("a")) assert.equal(new URL(link.href).origin, "https://meraki.example");
  for (const color of ["#18251f", "#c2a36b", "#f5f4f0"]) assert.ok(message.html.includes(color));
  dom.window.close();
}

for (const locale of ["it", "en", "de", "es"]) {
  test(`${locale}: refund confirmation uses the original brand, real amount and explicit revoked/remaining rights`, () => {
    const message = template.renderMerakiRefundConfirmation({ ...refund, locale });
    inspect(message, locale);
    for (const value of ["17,50", refund.refundReference, ...refund.revokedAccessNames, ...refund.remainingAccessNames]) assert.ok(message.text.includes(value));
    const expected = { it: "Rimborso parziale confermato", en: "Partial refund confirmed", de: "Teilerstattung bestätigt", es: "Reembolso parcial confirmado" }[locale];
    assert.ok(message.subject.includes(expected));
    assert.equal(message.deliveryId, `refund-${refund.deliveryId}`);
  });
  test(`${locale}: full refund and event cancellation do not claim a usable ticket`, () => {
    const message = template.renderMerakiRefundConfirmation({ ...refund, locale, fullRefund: true, eventCanceled: true, allAccessRevoked: true });
    inspect(message, locale);
    assert.ok(!message.text.includes(refund.remainingAccessNames[0]));
    const expected = { it: "nessun biglietto", en: "no ticket", de: "Kein Ticket", es: "ninguna entrada" }[locale];
    assert.ok(message.text.includes(expected));
  });
  test(`${locale}: cancellation notice states refund processing separately from confirmation`, () => {
    const message = template.renderMerakiCancellationNotice({ ...cancellation, locale });
    inspect(message, locale);
    const expected = { it: "quando sarà confermato", en: "once the refund is confirmed", de: "Sobald sie bestätigt ist", es: "cuando se confirme" }[locale];
    assert.ok(message.text.includes(expected));
    assert.equal(message.deliveryId, `cancel-${cancellation.deliveryId}`);
    assert.ok(!message.text.includes(refund.refundReference));
    assert.ok(!message.text.includes("17,50"));
  });
}

test("refund confirmation cannot be rendered for pending/failed, invalid amounts or invalid references", () => {
  for (const status of ["preparing", "pending", "requires_action", "failed", "canceled", "unknown", undefined]) assert.throws(() => template.renderMerakiRefundConfirmation({ ...refund, status }), /confirmed Stripe refund/);
  for (const amountCents of [0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => template.renderMerakiRefundConfirmation({ ...refund, amountCents }), /confirmed Stripe refund/);
  for (const refundReference of ["pi_123", "re_<script>", "re_abc\nBcc: attacker"]) assert.throws(() => template.renderMerakiRefundConfirmation({ ...refund, refundReference }), /confirmed Stripe refund/);
});
test("goodwill refunds explicitly preserve ticket rights and no-balance cancellation avoids a refund promise", () => {
  const message = template.renderMerakiRefundConfirmation({ ...refund, revokedAccessNames: [], remainingAccessNames: [] });
  assert.ok(message.text.includes("non modifica gli accessi"));
  const cancellationMessage = template.renderMerakiCancellationNotice({ ...cancellation, refundExpected: false });
  assert.ok(!cancellationMessage.text.includes("rimborso del saldo"));
  assert.ok(cancellationMessage.text.includes("contatta il team Meraki"));
});
test("service mail validates delivery identifiers and falls back to Italian for unsupported locales", () => {
  for (const deliveryId of ["", "bad\r\nBcc: extra@example.test", "<script>", "x".repeat(161)]) assert.throws(() => template.renderMerakiRefundConfirmation({ ...refund, deliveryId }), /Invalid service email/);
  const message = template.renderMerakiRefundConfirmation({ ...refund, locale: 'fr" onload="bad' });
  assert.ok(message.html.includes('<html lang="it">'));
});

function fixture(provider = "smtp", failing = false) {
  const delivered = []; const options = [];
  const settings = { email_provider: provider, smtp_host: "smtp.example.test", smtp_port: "465", smtp_user: "sender@example.test", smtp_pass: "fake-test-only", resend_api_key: "fake-test-only" };
  const service = load("src/lib/resend/client.ts", {
    "@/lib/email/meraki-template": baseTemplate, "@/lib/i18n-utils": {}, "@/lib/events/travel-link": {}, "@/lib/events/activity-timing": {}, qrcode: {},
    "@/lib/supabase/server": { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { value: { integrations: settings } } }) }) }) }) }) },
    resend: { Resend: class { emails = { send: async (message, option) => { delivered.push(message); options.push(option); return { error: failing ? { message: "fake-provider-error" } : null }; } }; } },
    nodemailer: { createTransport: () => ({ sendMail: async message => { delivered.push(message); if (failing) throw new Error("fake-provider-error"); return { messageId: message.messageId }; } }) },
  });
  const sender = load("src/lib/email/refund-emails.ts", { "@/lib/resend/client": service, "./refund-template": template });
  return { sender, delivered, options };
}
for (const provider of ["smtp", "resend"]) {
  test(`${provider}: senders reuse configured provider and stable delivery identifiers without actual network calls`, async () => {
    const { sender, delivered, options } = fixture(provider);
    assert.equal((await sender.sendMerakiRefundConfirmation(refund)).success, true);
    assert.equal((await sender.sendMerakiCancellationNotice(cancellation)).success, true);
    assert.equal(delivered.length, 2);
    assert.equal(delivered[0].to, refund.to);
    assert.equal(delivered[1].to, cancellation.to);
    if (provider === "smtp") {
      assert.equal(delivered[0].messageId, `<meraki-service-refund-${refund.deliveryId}@merakiexperience.org>`);
      assert.equal(delivered[0].from, "Meraki Experience <sender@example.test>");
      assert.equal(delivered[1].messageId, `<meraki-service-cancel-${cancellation.deliveryId}@merakiexperience.org>`);
    } else {
      assert.equal(options[0].idempotencyKey, `meraki-service-refund-${refund.deliveryId}`);
      assert.equal(options[1].idempotencyKey, `meraki-service-cancel-${cancellation.deliveryId}`);
    }
  });
  test(`${provider}: failure is reported for outbox retry and invalid state never initiates delivery`, async () => {
    const { sender, delivered } = fixture(provider, true);
    assert.equal((await sender.sendMerakiRefundConfirmation(refund)).success, false);
    assert.equal((await sender.sendMerakiCancellationNotice(cancellation)).success, false);
    const before = delivered.length;
    assert.equal((await sender.sendMerakiRefundConfirmation({ ...refund, status: "pending" })).success, false);
    assert.equal((await sender.sendMerakiRefundConfirmation({ ...refund, to: "buyer@example.test,other@example.test" })).success, false);
    assert.equal(delivered.length, before);
  });
}
