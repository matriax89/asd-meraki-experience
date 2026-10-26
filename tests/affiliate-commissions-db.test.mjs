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
// This test creates its own loopback cluster and never accepts DATABASE_URL.
test("affiliate compensation is private, scoped and updated atomically in isolated PostgreSQL", { skip: !["initdb", "pg_ctl"].every(name => existsSync(bin(name))), timeout: 30000 }, async context => {
  const directory = await mkdtemp(path.join(tmpdir(), "meraki-affiliate-commissions-pg-"));
  const dataDirectory = path.join(directory, "data");
  const listener = createServer();
  await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const clients = []; let started = false;
  const connect = async role => { const client = new pg.Client({ host: "127.0.0.1", port, user: "postgres", database: "postgres" }); await client.connect(); clients.push(client); if (role) await client.query(`set role ${role}`); return client; };
  context.after(async () => { await Promise.allSettled(clients.map(client => client.end())); if (started) await exec(bin("pg_ctl"), ["-D", dataDirectory, "-m", "immediate", "-w", "stop"]); await rm(directory, { recursive: true, force: true }); });
  await exec(bin("initdb"), ["-D", dataDirectory, "-U", "postgres", "-A", "trust", "--no-instructions"]);
  await exec(bin("pg_ctl"), ["-D", dataDirectory, "-l", path.join(directory, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -k ${directory}`, "-w", "start"]); started = true;
  const db = await connect();
  await db.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    create table public.events(id uuid primary key, affiliates jsonb not null, title text);`);
  await db.query(await readFile(new URL("../supabase/migrations/20261026120000_event_affiliate_commissions.sql", import.meta.url), "utf8"));
  const service = await connect("service_role");
  const eventId = randomUUID(); const eventB = randomUUID(); const affiliateId = randomUUID(); const otherId = randomUUID();
  const affiliates = [{ id: affiliateId, name: "Scuola Uno", active: true }, { id: otherId, name: "Scuola Due", active: false }];
  await db.query("insert into public.events values($1,$2,'Original event'),($3,$2,'Other event')", [eventId, JSON.stringify(affiliates), eventB]);
  const save = (event, rates, client = service) => client.query("select public.set_event_affiliate_commissions($1,$2)", [event, JSON.stringify(rates)]);
  const rates = async event => (await service.query("select affiliate_id,commission_cents from public.event_affiliate_commissions where event_id=$1 order by affiliate_id", [event])).rows;
  await save(eventId, { [affiliateId]: 500, [otherId]: 0 });
  await save(eventB, { [affiliateId]: 900 });
  assert.deepEqual((await rates(eventId)).find(row => row.affiliate_id === affiliateId), { affiliate_id: affiliateId, commission_cents: 500 });
  assert.deepEqual((await rates(eventId)).find(row => row.affiliate_id === otherId), { affiliate_id: otherId, commission_cents: 0 });
  await save(eventId, { [otherId]: 250 });
  assert.equal((await rates(eventId)).find(row => row.affiliate_id === affiliateId).commission_cents, 500, "omitted rates stay unchanged");
  assert.equal((await rates(eventB))[0].commission_cents, 900, "events retain independent compensation");
  assert.deepEqual((await db.query("select affiliates,title from public.events where id=$1", [eventId])).rows[0], { affiliates, title: "Original event" }, "public affiliate data is untouched");
  for (const invalid of [null, [], { [affiliateId]: -1 }, { [affiliateId]: 1.5 }, { [affiliateId]: "500" }, { [affiliateId]: 10000001 }, { [affiliateId]: 600, [randomUUID()]: 700 }, { "invalid-id": 500 }]) {
    await assert.rejects(save(eventId, invalid));
    assert.equal((await rates(eventId)).find(row => row.affiliate_id === affiliateId).commission_cents, 500, "invalid submissions roll back all compensation changes");
  }
  await assert.rejects(save(randomUUID(), { [affiliateId]: 500 }));
  for (const role of ["anon", "authenticated"]) {
    const visitor = await connect(role);
    await assert.rejects(visitor.query("select * from public.event_affiliate_commissions"), error => error.code === "42501");
    await assert.rejects(save(eventId, { [affiliateId]: 0 }, visitor), error => error.code === "42501");
    await assert.rejects(visitor.query("insert into public.event_affiliate_commissions(event_id,affiliate_id,commission_cents) values($1,$2,0)", [eventId, randomUUID()]), error => error.code === "42501");
  }
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.event_affiliate_commissions'::regclass")).rows[0].relrowsecurity, true);
  await db.query("delete from public.events where id=$1", [eventB]);
  assert.equal((await rates(eventB)).length, 0, "deleting an event removes only its compensation configuration");
});
