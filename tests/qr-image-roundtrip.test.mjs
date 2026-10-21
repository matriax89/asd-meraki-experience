import { richText, eventDescription } from "./helpers/rich-text-modules.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { decodeQrPng } from "./helpers/decode-qr-png.mjs";

const require = createRequire(import.meta.url);
const token = "f150b5c6-0c50-4be6-8567-2b95e780400a";
const ticketId = "f150b5c6-0c50-4be6-8567-2b95e780400b";

function load(file, overrides = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(source, {
    module: compiledModule, exports: compiledModule.exports, Buffer, URL, console,
    process: { env: { RESEND_API_KEY: "synthetic-test-only", NEXT_PUBLIC_SITE_URL: "https://meraki.example.test" } },
    require: (name) => name in overrides ? overrides[name] : name === "@/lib/rich-text" ? richText : name === "@/components/public/event-description" ? eventDescription : name === "@/lib/events/activity-timing" ? load("lib/events/activity-timing.ts") : require(name),
  });
  return compiledModule.exports;
}

const template = load("lib/email/meraki-template.ts");
const i18n = load("lib/i18n-utils.ts");

test("actual ticket email PNGs decode with the scanner library for both transports and every language", async () => {
  for (const provider of ["smtp", "resend"]) {
    for (const locale of ["it", "en", "de", "es"]) {
      let delivered;
      const settings = { integrations: provider === "smtp" ? {
        email_provider: "smtp", smtp_host: "smtp.example.test", smtp_port: "587",
        smtp_user: "tickets@example.test", smtp_pass: "synthetic-test-only",
      } : { email_provider: "resend" } };
      const mail = load("lib/resend/client.ts", {
        "@/lib/email/meraki-template": template,
        "@/lib/events/travel-link": load("lib/events/travel-link.ts", { "@/lib/events/logistics": load("lib/events/logistics.ts") }),
        "@/lib/i18n-utils": i18n,
        "@/lib/supabase/server": { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { value: settings } }) }) }) }) }) },
        nodemailer: { createTransport: () => ({ sendMail: async (value) => { delivered = value; return { accepted: [value.to] }; } }) },
        resend: { Resend: class { emails = { send: async (value) => { delivered = value; return { error: null }; } }; } },
        // qrcode intentionally uses the installed encoder, without a mock.
      });
      const result = await mail.sendTicketConfirmation({
        id: ticketId, qr_code: token, buyer_email: "participant@example.test", buyer_nome: "Ada", buyer_cognome: "Prova",
      }, {
        titolo: { it: "Meraki test", en: "Meraki test", de: "Meraki Test", es: "Meraki prueba" },
        data_inizio: "2026-12-01T18:00:00+01:00", location: "Luogo sintetico", indirizzo: null,
      }, locale, { deliveryId: `${provider}-${locale}`, accessNames: ["Workshop", "Masterclass", "Cena"] });
      assert.equal(result.success, true, `${provider}/${locale}`);
      const attachment = delivered.attachments[0];
      assert.equal(attachment.filename, "biglietto-meraki.png");
      assert.ok(Buffer.isBuffer(attachment.content));
      const decoded = decodeQrPng(attachment.content);
      assert.equal(decoded, token, `${provider}/${locale}: actual pixels must preserve the admission credential`);
      assert.match(decoded, /^[a-z0-9_-]{1,256}$/i, "the decoded payload must match the server check-in format");
      assert.equal(delivered.to, "participant@example.test");
      assert.ok(delivered.text.includes(`/${locale}/biglietto/${ticketId}?token=${decoded}`));
      assert.ok(!delivered.html.includes('/profilo/preferenze'), 'a ticket without marketing opt-in links must not add a consent action');
      assert.ok(!decoded.includes("https://"), "the camera payload is the opaque admission code, not the private ticket URL");
    }
  }
});
