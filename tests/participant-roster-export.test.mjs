import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiled = { exports: {} };
  vm.runInNewContext(source, { module: compiled, exports: compiled.exports, require: name => name in mocks ? mocks[name] : require(name), Response, Request, URL, Intl, Date });
  return compiled.exports;
}
const csv = load("lib/admin/participant-roster-csv.ts");
const eventId = "30da43c2-3ee7-4e7d-97b4-28c789e366de";
const affiliateId = "3cdc55e8-e72d-4e42-9c59-bbc611a4101e";
const person = (extra = {}) => ({ id: "person-1", source: "commerce", firstName: "Giulia", lastName: "Prova", email: "giulia@example.test", buyerEmail: "buyer@example.test", phone: "+393331234567", documentType: "foreign_id", documentCountry: "DE", documentNumber: "00123456", maskedDocument: "••••3456", packageName: "Workshop + Masterclass", status: "paid", valid: true, checkedIn: true, checkedInAt: "2026-12-19T11:00:00Z", createdAt: "2026-11-02T11:54:00Z", affiliateId, affiliateName: "Scuola Esempio", contactAvailable: true, privacyVersion: "2026-10-18-v1", contactCreatedAt: "2026-11-02T11:54:00Z", marketingConsent: false, activities: [{ id: "ws", name: "Workshop", kind: "workshop", status: "used", checkedInAt: "2026-12-19T11:00:00Z", menuChoice: null }, { id: "mc", name: "Masterclass", kind: "masterclass", status: "valid", checkedInAt: null, menuChoice: null }, { id: "dinner", name: "Cena", kind: "dinner", status: "valid", checkedInAt: null, menuChoice: 'Pizza; "vegetariana"\nAcqua' }], ...extra });
const roster = (participants = [person()]) => ({ event: { id: eventId, title: "Vibra · Prova", startsAt: "2026-12-19T11:30:00Z", canceled: false }, affiliate: { id: affiliateId, name: "Scuola Esempio" }, participants });
function parseCsv(value) {
  const result = []; let row = []; let cell = ""; let quoted = false;
  const text = value.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (c === ";" && !quoted) { row.push(cell); cell = ""; }
    else if (c === "\r" && text[i + 1] === "\n" && !quoted) { row.push(cell); result.push(row); row = []; cell = ""; i++; }
    else cell += c;
  }
  assert.equal(quoted, false); return result;
}
const records = value => { const [headers, ...rows] = parseCsv(value); return rows.map(row => Object.fromEntries(headers.map((header, i) => [header, row[i]]))); };

test("complete participant export contains contacts, current formula, separate dinner and every activity without repeating the person", () => {
  const output = csv.participantRosterCsv(roster());
  assert.ok(output.startsWith("\uFEFF"));
  const rows = parseCsv(output); assert.equal(rows.length, 2); assert.equal(rows[0].length, rows[1].length);
  const [row] = records(output);
  assert.equal(row["Nome"], "Giulia"); assert.equal(row["Cognome"], "Prova");
  assert.equal(row["Email partecipante"], "giulia@example.test"); assert.equal(row["Email acquirente"], "buyer@example.test");
  assert.equal(row["Telefono"], "'+393331234567"); assert.equal(row["Codice fiscale / numero documento"], "'00123456");
  assert.equal(row["Formula attuale"], "Workshop + Masterclass");
  assert.equal(row["Cena"], "Cena: Da utilizzare"); assert.equal(row["Menù cena"], 'Cena: Pizza; "vegetariana"\nAcqua');
  assert.equal(row["Workshop"], "Workshop: Check-in registrato");
  assert.equal(row["Primo check-in (ora italiana)"], "19/12/2026, 12:00");
  assert.equal(row["Consenso marketing all’iscrizione"], "No"); assert.equal(row["Versione informativa privacy"], "2026-10-18-v1");
});

test("refunds, cancellation, revoked activities and unknown consent stay explicit; untrusted spreadsheet text is neutralized", () => {
  const data = roster([person({ firstName: "=SUM(1;2)", lastName: "\t@payload", affiliateName: "\n+school", status: "refunded", valid: false, checkedIn: false, checkedInAt: null, marketingConsent: null, activities: [{ id: "mc", name: "-Masterclass", kind: "masterclass", status: "refunded", checkedInAt: null, menuChoice: null }] }), person({ id: "person-2", source: "legacy", status: "canceled", documentNumber: "", maskedDocument: "", contactAvailable: false, email: "", phone: "", activities: [] })]);
  const result = records(csv.participantRosterCsv(data));
  assert.equal(result[0]["Nome"], "'=SUM(1;2)"); assert.equal(result[0]["Cognome"], "'\t@payload"); assert.equal(result[0]["Affiliato"], "'\n+school");
  assert.equal(result[0]["Stato iscrizione"], "Rimborsato"); assert.equal(result[0]["Iscrizione valida"], "No");
  assert.equal(result[0]["Attività attive"], ""); assert.ok(result[0]["Dettaglio attività e stati"].includes("Rimborsato"));
  assert.equal(result[0]["Consenso marketing all’iscrizione"], "Non disponibile");
  assert.equal(result[1]["Stato iscrizione"], "Annullato"); assert.equal(result[1]["Contatto partecipante disponibile"], "No"); assert.equal(result[1]["Email partecipante"], "");
});

test("masked exports never substitute a buyer for an attendee or leak unsupported payment and QR fields", () => {
  const data = roster([person({ email: "", documentNumber: "", qr_code: "secret-qr", stripe_session_id: "secret-session", orderSnapshot: { documentNumber: "unapproved-doc" } })]);
  const output = csv.participantRosterCsv(data); const [row] = records(output);
  assert.equal(row["Codice fiscale / numero documento"], "••••3456"); assert.equal(row["Email partecipante"], ""); assert.equal(row["Email acquirente"], "buyer@example.test");
  for (const secret of ["secret-qr", "secret-session", "unapproved-doc"]) assert.equal(output.includes(secret), false);
  assert.equal(/undefined|NaN/.test(output), false);
});

test("long numeric identity documents remain text instead of losing spreadsheet precision", () => {
  for (const documentNumber of ["12345678901234567890", "1E20", "01-02-03", "RSSMRA80A01H501U"]) {
    const [row] = records(csv.participantRosterCsv(roster([person({ documentNumber })])));
    assert.equal(row["Codice fiscale / numero documento"], `'${documentNumber}`);
  }
});

test("empty event CSV keeps column headers and safe filenames cannot inject response headers", () => {
  assert.equal(parseCsv(csv.participantRosterCsv(roster([]))).length, 1);
  const data = roster([]); data.event.title = 'Èvento\r\n";filename=other'; data.affiliate.name = "../Affiliato;=x";
  const name = csv.participantRosterFilename(data, true);
  assert.match(name, /^meraki-partecipanti-[a-z0-9-]+-validi\.csv$/);
  assert.equal(/[\r\n"/]/.test(name), false);
});

class RosterError extends Error { constructor(status) { super("PRIVATE provider details"); this.status = status; } }
function routeFixture({ data = roster(), error } = {}) {
  const calls = [];
  const route = load("app/api/admin/participants/export/route.ts", { "@/lib/admin/participant-roster": { ParticipantRosterError: RosterError, loadParticipantRoster: async input => { calls.push(input); if (error) throw error; return data; } }, "@/lib/admin/participant-roster-csv": csv });
  return { calls, get: query => route.GET(new Request(`https://meraki.test/api/admin/participants/export?${query}`)) };
}

test("staff export route carries exact event/affiliate scope, requests full documents explicitly and uses a non-cacheable attachment", async () => {
  const api = routeFixture(); const response = await api.get(`event=${eventId}&affiliate=${affiliateId}&documents=1`);
  assert.equal(response.status, 200); assert.equal(api.calls[0].eventId, eventId); assert.equal(api.calls[0].affiliateId, affiliateId); assert.equal(api.calls[0].includeDocuments, true);
  assert.match(response.headers.get("content-type"), /^text\/csv; charset=utf-8$/); assert.match(response.headers.get("content-disposition"), /^attachment; filename="meraki-partecipanti-/);
  assert.ok(response.headers.get("cache-control").includes("no-store")); assert.ok(response.headers.get("cache-control").includes("private"));
  assert.equal(response.headers.get("referrer-policy"), "no-referrer"); assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  const bytes = new Uint8Array(await response.arrayBuffer()); assert.deepEqual([...bytes.slice(0, 3)], [239,187,191]);
});

test("direct and complete-event exports do not inherit another affiliate; active-only filtering retains no refunded rows", async () => {
  const api = routeFixture({ data: roster([person(), person({ id: "refund", status: "refunded", valid: false })]) });
  const response = await api.get(`event=${eventId}&affiliate=direct&status=valid`);
  assert.equal(api.calls[0].affiliateId, "direct"); assert.equal(api.calls[0].includeDocuments, false);
  assert.equal(records(await response.text()).length, 1); assert.match(response.headers.get("content-disposition"), /-validi\.csv/);
  await api.get(`event=${eventId}`); assert.equal(api.calls[1].affiliateId, undefined);
});

for (const query of ["status=unknown", "documents=yes", "event=x&event=y", "affiliate=direct&affiliate=all", "status=valid&status=all", "documents=0&documents=1"]) {
  test(`ambiguous or unsupported export parameters are rejected: ${query}`, async () => {
    const api = routeFixture(); const response = await api.get(query);
    assert.equal(response.status, 400); assert.equal(api.calls.length, 0); assert.equal(response.headers.get("content-disposition"), null);
  });
}
for (const status of [400,403,404,503]) {
  test(`failed roster reads return a safe ${status} response without exporting a partial list`, async () => {
    const api = routeFixture({ error: new RosterError(status) }); const response = await api.get(`event=${eventId}`);
    assert.equal(response.status, status); assert.equal(response.headers.get("content-disposition"), null);
    assert.equal((await response.text()).includes("PRIVATE"), false); assert.ok(response.headers.get("cache-control").includes("no-store"));
  });
}
test("unexpected provider failure is sanitized and never converted into an empty successful export", async () => {
  const api = routeFixture({ error: new Error("PRIVATE credentials and query") });
  const response = await api.get(`event=${eventId}`); assert.equal(response.status, 503); assert.equal(response.headers.get("content-disposition"), null); assert.equal((await response.text()).includes("PRIVATE"), false);
});
