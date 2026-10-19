import assert from "node:assert/strict";
import { execFile } from "node:child_process";
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
const bin = (name) => path.join(binaries, name);
const supported = ["initdb", "pg_ctl"].every((name) => existsSync(bin(name)));

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

// Never accepts DATABASE_URL: this creates and removes its own loopback cluster.
test("the optional logistics migration is idempotent and rejects non-object or unsupported versions", {
  skip: supported ? false : "Set MERAKI_PG_BIN to the directory containing initdb and pg_ctl",
  timeout: 30_000,
}, async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), "meraki-logistics-pg-"));
  const dataDirectory = path.join(directory, "data");
  let started = false; let db;
  context.after(async () => {
    if (db) await db.end();
    if (started) await exec(bin("pg_ctl"), ["-D", dataDirectory, "-m", "immediate", "-w", "stop"]);
    await rm(directory, { recursive: true, force: true });
  });
  const port = await availablePort();
  await exec(bin("initdb"), ["-D", dataDirectory, "-U", "postgres", "-A", "trust", "--no-instructions"]);
  await exec(bin("pg_ctl"), ["-D", dataDirectory, "-l", path.join(directory, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -k ${directory}`, "-w", "start"]);
  started = true;
  db = new pg.Client({ host: "127.0.0.1", port, user: "postgres", database: "postgres" });
  await db.connect();
  await db.query("create table public.events (id integer primary key, titolo text); insert into public.events values (1, 'Evento precedente');");
  const migration = await readFile(new URL("../supabase/migrations/20261019170000_event_logistics.sql", import.meta.url), "utf8");
  await db.query(migration); await db.query(migration);
  assert.deepEqual((await db.query("select titolo, logistics from public.events where id=1")).rows[0], { titolo: "Evento precedente", logistics: null });
  assert.equal((await db.query("select count(*)::int as count from pg_constraint where conrelid='public.events'::regclass and conname='events_logistics_v1_object'")).rows[0].count, 1);
  assert.equal((await db.query("select attnotnull from pg_attribute where attrelid='public.events'::regclass and attname='logistics'")).rows[0].attnotnull, false);
  await db.query("update public.events set logistics=$1 where id=1", [JSON.stringify({ version: 1 })]);
  for (const value of [null, [], "text", 1, {}, { version: null }, { version: "1" }, { version: 2 }]) {
    await assert.rejects(db.query("update public.events set logistics=$1 where id=1", [JSON.stringify(value)]), (error) => error.code === "23514" && error.constraint === "events_logistics_v1_object");
  }
  await db.query("update public.events set logistics=null where id=1");
  assert.equal((await db.query("select logistics from public.events where id=1")).rows[0].logistics, null);
});
