import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(relativePath, mocks = {}) {
  const filename = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  const source = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, require: (name) => name in mocks ? mocks[name] : require(name), URL, Request, Response }, { filename });
  return compiledModule.exports;
}
const wallet = load("src/lib/tickets/wallet.ts");
const id = "12345678-1111-4111-8111-123456789abc";
const otherId = "12345678-2222-4222-8222-123456789abc";
const ticket = { id, token: "private-token-one", title: "Serata Meraki", date: "2026-11-18T19:00:00Z", location: "Bolzano", status: "paid" };
const json = (value) => JSON.parse(JSON.stringify(value));
function storage(initial = null) {
  let saved = initial;
  return { getItem: (key) => { assert.equal(key, wallet.WALLET_KEY); return saved; }, setItem: (key, value) => { assert.equal(key, wallet.WALLET_KEY); saved = value; }, value: () => saved };
}

test("wallet imports only known Meraki ticket paths on an allowed origin", () => {
  const good = `https://meraki.example/it/biglietto/${id}?token=${ticket.token}`;
  assert.deepEqual(json(wallet.parseTicketLink(good, "https://meraki.example")), { id, token: ticket.token });
  assert.ok(wallet.parseTicketLink(good, "http://localhost:3003", "https://meraki.example"));
  assert.ok(wallet.parseTicketLink(`http://localhost:3001/de/biglietto/${id}?token=${ticket.token}`, "https://meraki.example"));
  assert.ok(wallet.parseTicketLink(`/es/biglietto/${id}?token=${ticket.token}`, "https://meraki.example"));
  assert.equal(wallet.walletTicketUrl(ticket, "es"), `/es/biglietto/${id}?token=${ticket.token}`);
  assert.deepEqual(json(wallet.parseTicketLink(`/en/biglietto/${id}?token=${ticket.token}`, "https://meraki.example")), { id, token: ticket.token });
  const bad = [
    good.replace("meraki.example", "malicious.example"),
    good.replace("meraki.example", "meraki.example.malicious.example"),
    good.replace("https://", "https://person:password@"),
    good.replace("/biglietto/", "/admin/biglietti/"),
    good.replace(id, "not-a-ticket"),
    good.replace("?token=", "?email="),
    `${good}&token=another-token`, `${good}#extra`,
    `javascript:alert(1)`, `data:text/plain,${good}`,
    good.replace(ticket.token, "%3Cscript%3E"),
    good.replace("https://", "http://"),
  ];
  for (const link of bad) assert.equal(wallet.parseTicketLink(link, "https://meraki.example"), null, link);
});

test("wallet storage is versioned, bounded and explicitly discards buyer PII and QR images", () => {
  const device = storage();
  const incoming = { ...ticket, buyer_email: "private@example.test", buyer_nome: "Private Person", qr: "data:image/png;base64,sensitive" };
  assert.equal(wallet.saveVerifiedTicket(device, incoming), true);
  assert.deepEqual(JSON.parse(device.value()), [ticket]);
  assert.equal(device.value().includes("private@example"), false);
  assert.equal(device.value().includes("data:image"), false);
  const many = Array.from({ length: 70 }, (_, index) => ({ ...ticket, id: `${String(index).padStart(8, "0")}-1111-4111-8111-123456789abc` }));
  assert.equal(wallet.writeWallet(device, many), true);
  assert.equal(JSON.parse(device.value()).length, 50);
  assert.equal(wallet.WALLET_KEY, "meraki_ticket_wallet_v1");
});

test("verified updates replace one saved ticket and invalid or blocked storage fails safely", () => {
  const device = storage(JSON.stringify([ticket, { ...ticket, id: otherId }]));
  assert.equal(wallet.saveVerifiedTicket(device, { ...ticket, status: "used" }), true);
  assert.deepEqual(JSON.parse(device.value()).map(({ id, status }) => ({ id, status })), [{ id, status: "used" }, { id: otherId, status: "paid" }]);
  assert.equal(wallet.saveVerifiedTicket(device, { ...ticket, token: "<invalid>" }), false);
  assert.deepEqual(json(wallet.readWallet(storage("not json"))), { tickets: [], available: true });
  const corrupt = storage("not json");
  assert.equal(wallet.saveVerifiedTicket(corrupt, ticket), true);
  assert.deepEqual(json(wallet.readWallet(storage("x".repeat(100_001)))).tickets, []);
  const blocked = { getItem() { throw Error("permission"); }, setItem() { throw Error("quota"); } };
  assert.equal(wallet.readWallet(blocked).available, false);
  assert.equal(wallet.saveVerifiedTicket(blocked, ticket), false);
  assert.equal(wallet.writeWallet(blocked, [ticket]), false);
});

test("a malformed or unrelated refresh cannot overwrite previously saved tickets", () => {
  for (const response of [{}, { tickets: {} }, { tickets: [{ ...ticket, token: "unexpected" }] }, { tickets: [{ ...ticket, status: "invalid" }] }, { tickets: [ticket, ticket] }, { tickets: Array(51).fill(ticket) }]) {
    assert.equal(wallet.walletResponseTickets(response, [ticket]), null);
  }
  assert.deepEqual(json(wallet.walletResponseTickets({ tickets: [ticket] }, [ticket])), [ticket]);
  assert.deepEqual(json(wallet.walletResponseTickets({ tickets: [] }, [ticket])), []);
});

function endpoint(rows = [], dbError = null) {
  const filters = [];
  const selections = [];
  let databaseReads = 0;
  const route = load("src/app/api/tickets/wallet/route.ts", {
    "@/lib/commerce/server": { getCommerceWalletTickets: async () => [] },
    "@/lib/tickets/wallet": wallet,
    "@/lib/i18n-utils": { getLocalizedText: (text, locale) => text[locale] || text.it },
    "@/lib/supabase/server": { createAdminClient: () => {
      databaseReads++;
      const query = { select: (text) => { selections.push(text); return query; },
        in: (key, value) => { filters.push([key, value]); return query; },
        then: (resolve) => resolve({ data: rows, error: dbError }),
      };
      return { from: (table) => { assert.equal(table, "tickets"); return query; } };
    } },
  });
  return { filters, selections, reads: () => databaseReads,
    post: (body, origin = "https://meraki.example") => route.POST(new Request("https://meraki.example/api/tickets/wallet", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body),
    })),
  };
}
const row = { id, qr_code: ticket.token, status: "paid", buyer_email: "private@example.test", buyer_nome: "Private Person", event: {
  titolo: { it: "Serata Meraki", en: "Meraki evening" }, data_inizio: ticket.date, location: ticket.location, indirizzo: null,
} };

test("wallet endpoint returns minimal data only for exact id AND token pairs, localized and privately uncached", async () => {
  const api = endpoint([row]);
  const response = await api.post({ locale: "en", tickets: [{ id, token: ticket.token }] });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  const body = await response.json();
  assert.deepEqual(body, { tickets: [{ ...ticket, title: "Meraki evening" }] });
  assert.deepEqual(json(api.filters), [["id", [id]], ["qr_code", [ticket.token]]]);
  assert.equal(api.selections[0].includes("buyer_"), false);
  assert.equal(JSON.stringify(body).includes("private@example"), false);
});

test("batch IN cross-product cannot expose tickets with mismatched id/token pairs", async () => {
  const api = endpoint([row, { ...row, id: otherId, qr_code: "private-token-two" }]);
  const response = await api.post({ tickets: [{ id, token: "private-token-two" }, { id: otherId, token: ticket.token }] });
  assert.deepEqual(await response.json(), { tickets: [] });
  const single = endpoint([row]);
  assert.deepEqual(await (await single.post({ tickets: [{ id, token: "wrong-token" }] })).json(), { tickets: [] });
});

test("malformed wallet requests never reach the service-role database, and failures stay retryable", async () => {
  const api = endpoint([row]);
  for (const body of [null, { buyer_email: "private@example.test" }, { tickets: [{ id }] }, { tickets: [{ id, token: "<bad>" }] }, { tickets: [], locale: ["it"] }, { tickets: Array(51).fill({ id, token: ticket.token }) }]) {
    assert.equal((await api.post(body)).status, 400);
  }
  assert.equal((await api.post({ tickets: [{ id, token: ticket.token }] }, "https://malicious.example")).status, 403);
  assert.equal(api.reads(), 0);
  const offline = endpoint(null, { message: "private database failure" });
  const response = await offline.post({ tickets: [{ id, token: ticket.token }] });
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes("private database failure"), false);
});


test("Spanish wallet requests retain their locale instead of silently falling back to Italian", () => {
  const request = wallet.parseWalletRequest({ locale: "es", tickets: [{ id, token: ticket.token }] });
  assert.equal(request.locale, "es");
});
