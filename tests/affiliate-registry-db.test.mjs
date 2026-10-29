import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import pg from "pg";

const exec = promisify(execFile);
const binaries = process.env.MERAKI_PG_BIN || "/opt/homebrew/bin";
const bin = name => path.join(binaries, name);
test("affiliate registry backfill preserves identities and private atomic creation rejects concurrent duplicate names", {
  skip: !["initdb", "pg_ctl"].every(name => existsSync(bin(name))), timeout: 60_000,
}, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "meraki-registry-pg-"));
  const dataDirectory = path.join(directory, "data");
  const listener = createServer();
  await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const clients = new Set(); let started = false;
  async function connect(role) {
    const client = new pg.Client({ host: "127.0.0.1", port, user: "postgres", database: "postgres" });
    await client.connect(); clients.add(client); if (role) await client.query(`set role ${role}`); return client;
  }
  t.after(async () => {
    await Promise.allSettled([...clients].map(client => client.end()));
    if (started) await exec(bin("pg_ctl"), ["-D", dataDirectory, "-m", "immediate", "-w", "stop"]);
    await rm(directory, { recursive: true, force: true });
  });
  await exec(bin("initdb"), ["-D", dataDirectory, "-U", "postgres", "-A", "trust", "--no-instructions"]);
  await exec(bin("pg_ctl"), ["-D", dataDirectory, "-l", path.join(directory, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -k ${directory}`, "-w", "start"]); started = true;
  const db = await connect();
  await db.query(`set timezone='UTC';
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon,authenticated,service_role;
    create table public.events(affiliates jsonb,created_at timestamptz,updated_at timestamptz);
    create table public.tickets(affiliate_id uuid,affiliate_name text,created_at timestamptz);
    create table public.commerce_passes(affiliate_id uuid,affiliate_name text,created_at timestamptz);
    create table public.ticket_reservations(affiliate_id uuid,affiliate_name text,created_at timestamptz);
    create table public.commerce_orders(affiliate_id uuid,affiliate_name text,created_at timestamptz);`);
  const first = randomUUID(); const sameName = randomUUID(); const historical = randomUUID();
  await db.query("insert into public.events values($1,'2025-01-01','2025-01-01'),($2,'2026-01-01','2026-01-01')", [
    JSON.stringify([{ id: first, name: "Vecchio nome", active: true }, { id: sameName, name: "Scuola Aurora", active: false }]),
    JSON.stringify([{ id: first, name: "Scuola Aurora", active: true }]),
  ]);
  await db.query("insert into public.tickets values($1,'Nome biglietto','2024-01-01'),($2,'Affiliato storico','2023-01-01')", [first, historical]);
  const before = (await db.query("select * from public.events order by created_at")).rows;
  await db.query(await readFile(new URL("../supabase/migrations/20261026143000_affiliate_registry.sql", import.meta.url), "utf8"));
  const registry = (await db.query("select * from public.affiliates")).rows;
  assert.equal(registry.length, 3);
  assert.equal(registry.find(row => row.id === first).name, "Scuola Aurora");
  assert.equal(registry.find(row => row.id === first).created_at.toISOString(), "2024-01-01T00:00:00.000Z");
  assert.equal(registry.filter(row => row.name === "Scuola Aurora").length, 2, "historical equal names keep different identities");
  assert.deepEqual((await db.query("select * from public.events order by created_at")).rows, before);
  for (const role of ["anon", "authenticated"]) {
    const browser = await connect(role);
    await assert.rejects(browser.query("select * from public.affiliates"), /permission denied/);
    await assert.rejects(browser.query("select public.create_affiliate('Private')"), /permission denied/);
  }
  const service = await connect("service_role");
  assert.equal((await service.query("select count(*)::int count from public.affiliates")).rows[0].count, 3);
  await assert.rejects(service.query("insert into public.affiliates(name) values('Bypass')"), /permission denied/);
  await assert.rejects(service.query("select public.create_affiliate('  scuola   AURORA  ')"), { code: "23505" });
  for (const invalid of [null, " ", "A\nB", "A".repeat(121)]) await assert.rejects(service.query("select public.create_affiliate($1)", [invalid]), { code: "22023" });
  const other = await connect("service_role");
  const results = await Promise.allSettled([service.query("select public.create_affiliate(' Nuova   scuola ') affiliate"), other.query("select public.create_affiliate('NUOVA SCUOLA') affiliate")]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.find(result => result.status === "rejected").reason.code, "23505");
  const created = results.find(result => result.status === "fulfilled").value.rows[0].affiliate;
  assert.ok(created.id); assert.ok(created.created_at);
  assert.equal((await db.query("select count(*)::int count from public.affiliates")).rows[0].count, 4);
});
