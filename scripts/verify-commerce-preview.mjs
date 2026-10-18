/** Isolated local browser fixture. Never accepts or uses a remote database URL.
 * Run: node scripts/verify-commerce-preview.mjs. Ctrl+C removes its temp cluster.
 */
import { execFile, spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import pg from "pg";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const binaries = process.env.MERAKI_PG_BIN || "/opt/homebrew/bin";
const bin = (name) => path.join(binaries, name);
if (!["initdb", "pg_ctl"].every((name) => existsSync(bin(name)))) throw new Error("Local PostgreSQL binaries are required.");
const directory = await mkdtemp(path.join(tmpdir(), "meraki-commerce-preview-"));
const dataDirectory = path.join(directory, "data");
let started = false; let db; let bridge; let next; let cleaning = false;
async function cleanup() {
  if (cleaning) return; cleaning = true;
  next?.kill("SIGTERM");
  await new Promise((resolve) => { if (!bridge) return resolve(); bridge.close(resolve); bridge.closeAllConnections(); });
  await db?.end().catch(() => {});
  if (started) await exec(bin("pg_ctl"), ["-D", dataDirectory, "-m", "immediate", "-w", "stop"]).catch(() => {});
  await rm(directory, { recursive: true, force: true });
}
process.stdin.on("data", (chunk) => { if (chunk.includes(3)) void cleanup().finally(() => process.exit(0)); });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { void cleanup().finally(() => process.exit(0)); });
const portServer = createNetServer();
await new Promise((resolve, reject) => { portServer.once("error", reject); portServer.listen(0, "127.0.0.1", resolve); });
const pgPort = portServer.address().port;
await new Promise((resolve) => portServer.close(resolve));

try {
  await exec(bin("initdb"), ["-D", dataDirectory, "-U", "postgres", "-A", "trust", "--no-instructions"]);
  await exec(bin("pg_ctl"), ["-D", dataDirectory, "-l", path.join(directory, "postgres.log"), "-o", `-h 127.0.0.1 -p ${pgPort} -k ${directory}`, "-w", "start"]); started = true;
  db = new pg.Pool({ host: "127.0.0.1", port: pgPort, user: "postgres", database: "postgres", max: 8 });
  await db.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create schema storage; create schema extensions; create table auth.users(id uuid primary key);
    create table storage.buckets(id text primary key,name text,public boolean);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;`);
  const migrations = path.join(root, "supabase/migrations");
  for (const name of (await readdir(migrations)).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) await db.query(await readFile(path.join(migrations, name), "utf8"));
  const eventId = randomUUID(); const soldOutId = randomUUID();
  const starts = new Date(Date.now() + 30 * 86400000).toISOString();
  const boundary = new Date(Date.now() + 23 * 86400000).toISOString();
  const pastBoundary = new Date(Date.now() - 86400000).toISOString();
  const price = (current) => [{ id: "early", label: "Early Bird", amountCents: current - 500, startsAt: null, endsAt: pastBoundary }, { id: "standard", label: "Standard", amountCents: current, startsAt: pastBoundary, endsAt: boundary }, { id: "last-minute", label: "Last Minute", amountCents: current + 500, startsAt: boundary, endsAt: starts }];
  const config = (capacity) => ({ version: 1, enabled: true, waitlistEnabled: true, upgradesEnabled: true, activities: [
    { id: "ws", name: "Workshop", kind: "workshop", capacity, startsAt: starts, salesEnd: starts, menuOptions: [] },
    { id: "mc", name: "Masterclass", kind: "masterclass", capacity, startsAt: starts, salesEnd: starts, menuOptions: [] },
    { id: "dinner", name: "Cena", kind: "dinner", capacity, startsAt: starts, salesEnd: starts, menuOptions: ["Classico", "Vegetariano"] },
  ], packages: [
    { id: "ws", name: "Solo Workshop", description: "Un incontro dedicato alla pratica.", activityIds: ["ws"], prices: price(3000) },
    { id: "mc", name: "Solo Masterclass", description: "Approfondisci con la masterclass.", activityIds: ["mc"], prices: price(4000) },
    { id: "bundle", name: "Workshop + Masterclass", description: "Le due attività in un’unica esperienza.", activityIds: ["ws", "mc"], prices: price(6000) },
  ], addons: [{ id: "cena", name: "Aggiungi la cena", activityId: "dinner", amountCents: 2500 }] });
  for (const [id, slug, title, cap] of [[eventId, "meraki-evento-di-prova", "Meraki · Evento di prova", 25], [soldOutId, "meraki-evento-esaurito-di-prova", "Meraki · Evento esaurito di prova", 0]]) {
    await db.query(`insert into public.events(id,slug,titolo,sottotitolo,descrizione,copertina_url,data_inizio,data_fine,location,indirizzo,prezzo_cents,capacity,commerce_config) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,3000,100,$11)`, [id, slug, JSON.stringify({ it: title, en: "Meraki · Local test event", de: "Meraki · Lokale Testveranstaltung", es: "Meraki · Evento de prueba local" }), JSON.stringify({ it: "Workshop, masterclass e una cena da condividere.", en: "Workshop, masterclass and a dinner together.", de: "Workshop, Masterclass und ein gemeinsames Abendessen.", es: "Workshop, masterclass y una cena para compartir." }), JSON.stringify({ it: "<p>Evento fittizio per la verifica locale delle formule, dei prezzi e dei biglietti. Nessun acquisto o pagamento reale.</p>", en: "<p>A fictional event for local package, price and ticket checks. No real purchase or payment.</p>", de: "<p>Fiktives Event zur lokalen Prüfung von Paketen, Preisen und Tickets. Kein echter Kauf und keine echte Zahlung.</p>", es: "<p>Evento ficticio para comprobar los paquetes, precios y entradas en local. No hay compras ni pagos reales.</p>" }), "/images/v2/community-outdoor.png", starts, new Date(Date.parse(starts) + 6 * 3600000).toISOString(), "Spazio di prova Meraki", "Indirizzo fittizio · Bolzano", JSON.stringify(config(cap))]);
  }
  const person = [{ firstName: "Ada", lastName: "Prova", packageId: "ws", addonIds: [], menuChoices: {} }];
  // Synthetic contacts only: .test is a reserved domain and no mail transport is enabled.
  const attendees = [{ firstName: "Ada", lastName: "Prova", email: "ada.fixture@example.test", phone: "+390000000000", documentType: "foreign_id", documentCountry: "ES", documentNumber: "ES-TEST-12345", marketingConsent: true }];
  const reserved = (await db.query("select public.reserve_event_commerce_attendees($1,$2,'fixture@example.test','es',$3,null,null,$4,'2026-10-18-v1') result", [eventId, randomUUID(), JSON.stringify(person), JSON.stringify(attendees)])).rows[0].result;
  if (!reserved.order) throw new Error(`Fixture reservation failed: ${JSON.stringify(reserved)}`);
  const fulfilled = (await db.query("select public.fulfill_event_commerce($1,'cs_test_fixture','pi_fixture',$2,'fixture@example.test') result", [reserved.order.id, reserved.order.amount_cents])).rows[0].result;
  const fixturePass = fulfilled.passes?.[0]; if (!fixturePass) throw new Error("Fixture pass was not generated.");
  const confirmToken = randomBytes(32).toString("hex");
  const revokeToken = randomBytes(32).toString("hex");
  const consent = (await db.query("select public.prepare_marketing_consent($1,0,$2,$3) result", [reserved.order.id, confirmToken, revokeToken])).rows[0].result;
  if (consent.status !== "pending") throw new Error("Fixture consent must start pending, without subscribing anyone.");


  const tables = new Set(["events", "site_settings", "tickets", "commerce_passes", "commerce_entitlements", "commerce_orders", "commerce_waitlist"]);
  const columns = new Map();
  for (const table of tables) columns.set(table, new Set((await db.query("select column_name from information_schema.columns where table_schema='public' and table_name=$1", [table])).rows.map((row) => row.column_name)));
  const identifier = (table, name) => { if (!columns.get(table)?.has(name)) throw new Error("Unsupported fixture column"); return `"${name}"`; };
  const splitSelect = (value) => { let depth = 0; let start = 0; const items = []; for (let i = 0; i < value.length; i++) { if (value[i] === "(") depth++; if (value[i] === ")") depth--; if (value[i] === "," && depth === 0) { items.push(value.slice(start, i)); start = i + 1; } } items.push(value.slice(start)); return items; };
  const relations = { events: { table: "events", foreign: "event_id", key: "id", many: false }, commerce_orders: { table: "commerce_orders", foreign: "order_id", key: "id", many: false }, commerce_entitlements: { table: "commerce_entitlements", foreign: "id", key: "pass_id", many: true } };
  async function project(table, row, selection) {
    const result = {};
    for (const part of splitSelect(selection || "*")) {
      if (part === "*") { Object.assign(result, row); continue; }
      const relation = part.match(/^(?:(\w+):)?(events|commerce_orders|commerce_entitlements)\((.*)\)$/);
      if (relation) {
        const [, alias, relationName, nested] = relation; const spec = relations[relationName];
        if (!columns.get(table)?.has(spec.foreign)) throw new Error("Unsupported fixture relation");
        const related = (await db.query(`select * from public.${spec.table} where ${identifier(spec.table, spec.key)}=$1`, [row[spec.foreign]])).rows;
        const projected = await Promise.all(related.map((item) => project(spec.table, item, nested)));
        result[alias || relationName] = spec.many ? projected : projected[0] || null;
      } else { identifier(table, part); result[part] = row[part]; }
    }
    return result;
  }
  const rpcArguments = {
    commerce_availability: ["p_event_id", "p_exclude_order_id"],
    quote_event_commerce: ["p_event_id", "p_participants", "p_upgrade_pass_id", "p_upgrade_token"],
    // These capabilities operate only on this temporary local cluster. They never send mail.
    lookup_marketing_preference: ["p_token"],
    confirm_marketing_consent: ["p_token"],
    unsubscribe_marketing_consent: ["p_token"],
  };
  bridge = createServer(async (request, response) => {
    const send = (status, body, headers = {}) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers }); response.end(request.method === "HEAD" ? undefined : JSON.stringify(body)); };
    try {
      const url = new URL(request.url, "http://127.0.0.1:3011");
      if (url.pathname.startsWith("/auth/")) return send(401, { message: "No session in isolated browser fixture", code: "bad_jwt" });
      if (!url.pathname.startsWith("/rest/v1/")) return send(404, { message: "Fixture path not supported" });
      let body = ""; for await (const chunk of request) { body += chunk; if (body.length > 100000) throw new Error("Fixture body too large"); }
      const payload = body ? JSON.parse(body) : null;
      const route = url.pathname.slice("/rest/v1/".length);
      if (route.startsWith("rpc/")) {
        const fn = route.slice(4); const names = rpcArguments[fn]; if (!names || request.method !== "POST") return send(403, { message: "Fixture RPC not allowed" });
        const args = names.map((name) => payload?.[name] ?? null); const parameters = args.map((_, index) => `$${index + 1}`).join(",");
        const result = (await db.query(`select public.${fn}(${parameters}) result`, args.map((value) => typeof value === "object" && value !== null ? JSON.stringify(value) : value))).rows[0].result;
        return send(200, result);
      }
      if (!tables.has(route)) return send(403, { message: "Fixture table not allowed" });
      if (request.method === "POST" && route === "commerce_waitlist") {
        const allowed = ["event_id", "email", "first_name", "last_name", "package_id", "activity_ids", "status"];
        if (!payload || Object.keys(payload).some((key) => !allowed.includes(key))) return send(400, { message: "Invalid fixture waitlist payload" });
        await db.query("insert into public.commerce_waitlist(event_id,email,first_name,last_name,package_id,activity_ids,status) values($1,$2,$3,$4,$5,$6,$7)", allowed.map((key) => payload[key]));
        return send(201, null);
      }
      if (!["GET", "HEAD"].includes(request.method)) return send(403, { message: "Fixture mutation not allowed" });
      const values = []; const filters = [];
      for (const [column, filter] of url.searchParams) {
        if (["select", "order", "limit", "offset"].includes(column)) continue;
        const name = identifier(route, column); const match = filter.match(/^(eq|neq|gt|gte|lt|lte|in|is)\.(.*)$/); if (!match) throw new Error("Unsupported fixture filter");
        const [, operator, value] = match;
        if (operator === "is" && value === "null") { filters.push(`${name} is null`); continue; }
        if (operator === "in") { const items = value.replace(/^\(|\)$/g, "").split(",").map((item) => item.replace(/^"|"$/g, "")); values.push(items); filters.push(`${name}=any($${values.length})`); continue; }
        const sqlOperator = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[operator]; if (!sqlOperator) throw new Error("Unsupported fixture comparison");
        values.push(value); filters.push(`${name}${sqlOperator}$${values.length}`);
      }
      const order = url.searchParams.get("order"); let ordering = "";
      if (order) ordering = " order by " + order.split(",").map((item) => { const [column, direction] = item.split("."); if (!["asc", "desc", undefined].includes(direction)) throw new Error("Unsupported fixture ordering"); return `${identifier(route, column)} ${direction || "asc"}`; }).join(",");
      const limit = Math.min(1000, Math.max(0, Number(url.searchParams.get("limit") || 1000))); const offset = Math.max(0, Number(url.searchParams.get("offset") || 0)); if (!Number.isInteger(limit) || !Number.isInteger(offset)) throw new Error("Invalid fixture paging");
      const rows = route === "site_settings" ? [] : (await db.query(`select * from public.${route}${filters.length ? " where " + filters.join(" and ") : ""}${ordering} limit ${limit} offset ${offset}`, values)).rows;
      const result = await Promise.all(rows.map((row) => project(route, row, url.searchParams.get("select"))));
      if (request.headers.accept?.includes("vnd.pgrst.object")) return result.length === 1 ? send(200, result[0]) : send(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${result.length} rows` });
      return send(200, result, { "Content-Range": `0-${Math.max(0, result.length - 1)}/${result.length}` });
    } catch (error) { console.error("Fixture bridge:", error.message); send(400, { code: error.code || "FIXTURE_ERROR", message: error.message }); }
  });
  await new Promise((resolve, reject) => { bridge.once("error", reject); bridge.listen(3011, "127.0.0.1", resolve); });
  const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3011", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test", SUPABASE_SERVICE_ROLE_KEY: "test", NEXT_PUBLIC_SITE_URL: "http://localhost:3012", STRIPE_SECRET_KEY: "", STRIPE_EXPECTED_ACCOUNT_ID: "", STRIPE_WEBHOOK_SECRET: "", RESEND_API_KEY: "", SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: "" };
  next = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "-p", "3012"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  next.stdout.on("data", (chunk) => process.stdout.write(chunk)); next.stderr.on("data", (chunk) => process.stderr.write(chunk));
  next.once("exit", (code) => { if (!cleaning) { console.error(`Fixture Next process exited: ${code}`); void cleanup().finally(() => process.exit(code || 1)); } });
  console.log(`Fixture supervisor PID ${process.pid}`);
  console.log("Isolated fixture only — no real payments, emails, or customer data.");
  console.log(`EVENT http://localhost:3012/it/eventi/meraki-evento-di-prova (${eventId})`);
  console.log(`SOLD_OUT http://localhost:3012/it/eventi/meraki-evento-esaurito-di-prova (${soldOutId})`);
  console.log(`TICKET http://localhost:3012/it/biglietto/${fixturePass.id}?token=${fixturePass.qr_code}`);
  console.log(`TICKET_ES http://localhost:3012/es/biglietto/${fixturePass.id}?token=${fixturePass.qr_code}`);
  console.log(`MARKETING_CONFIRM http://localhost:3012/es/profilo/preferenze?token=${confirmToken}`);
  console.log(`MARKETING_REVOKE http://localhost:3012/es/profilo/preferenze?token=${revokeToken}`);
  console.log("Ctrl+C stops Next, bridge, and the temporary Postgres cluster.");
} catch (error) { await cleanup(); throw error; }
