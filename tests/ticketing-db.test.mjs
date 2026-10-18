import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import pg from "pg";

const exec = promisify(execFile);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const binaries = process.env.MERAKI_PG_BIN || "/opt/homebrew/bin";
const bin = (name) => path.join(binaries, name);
const supported = ["initdb", "pg_ctl"].every((name) => existsSync(bin(name)));

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

// This suite never accepts a database URL: it creates and removes its own local
// cluster and applies the tracked migrations, without touching Supabase data.
test("ticketing integration with an isolated PostgreSQL cluster", {
  skip: supported ? false : "Set MERAKI_PG_BIN to the directory containing initdb and pg_ctl",
  timeout: 60_000,
}, async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "meraki-pg-test-"));
  const dataDirectory = path.join(directory, "data");
  const port = await availablePort();
  const connection = { host: "127.0.0.1", port, user: "postgres", database: "postgres" };
  const clients = new Set();
  let started = false;

  async function connect(role, applicationName) {
    const client = new pg.Client({ ...connection, application_name: applicationName });
    await client.connect();
    clients.add(client);
    if (role) await client.query(`set role ${role}`);
    return client;
  }

  t.after(async () => {
    await Promise.allSettled([...clients].map((client) => client.end()));
    if (started) await exec(bin("pg_ctl"), ["-D", dataDirectory, "-m", "immediate", "-w", "stop"]);
    await rm(directory, { recursive: true, force: true });
  });

  await exec(bin("initdb"), ["-D", dataDirectory, "-U", "postgres", "-A", "trust", "--no-instructions"]);
  await exec(bin("pg_ctl"), [
    "-D", dataDirectory, "-l", path.join(directory, "postgres.log"),
    "-o", `-h 127.0.0.1 -p ${port} -k ${directory}`, "-w", "start",
  ]);
  started = true;
  const db = await connect();

  // Minimal Supabase platform scaffolding; application schemas/functions below
  // come unchanged from the repository migrations.
  await db.query(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create schema storage;
    create schema extensions;
    create table auth.users (id uuid primary key);
    create table storage.buckets (id text primary key, name text, public boolean);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `);
  const migrationsDirectory = path.join(projectRoot, "supabase/migrations");
  const migrations = (await readdir(migrationsDirectory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  for (const migration of migrations) {
    try {
      await db.query(await readFile(path.join(migrationsDirectory, migration), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${migration} failed: ${error.message}`, { cause: error });
    }
  }

  const service = await connect("service_role");
  async function event(capacity = 1) {
    const id = randomUUID();
    await db.query(`insert into public.events(id, slug, titolo, data_inizio, prezzo_cents, capacity)
      values ($1, $2, '{"it":"Evento di prova"}', now() + interval '1 day', 2500, $3)`, [id, `test-${id}`, capacity]);
    return id;
  }
  async function reserve(eventId, id = randomUUID(), email = "buyer@example.test", client = service) {
    const result = await client.query("select public.reserve_event_ticket($1,$2,$3,'Ada','Rossi','it') as result", [id, eventId, email]);
    return result.rows[0].result;
  }
  async function fulfill(hold, sessionId, amount = 2500, client = service) {
    const result = await client.query("select public.fulfill_event_ticket($1,$2,$3,$4,$5,$6) as result", [
      hold.id, hold.event_id, sessionId, `pi_${sessionId}`, hold.buyer_email, amount,
    ]);
    return result.rows[0].result;
  }

  // Hold the target row until both independent clients are waiting on a real
  // PostgreSQL lock. This verifies overlap instead of merely firing two calls.
  async function concurrent(lockQuery, lockParameters, operation, firstMustBlock = false) {
    const applicationName = `meraki-race-${randomUUID()}`;
    const [blocker, first, second] = await Promise.all([
      connect(), connect("service_role", applicationName), connect("service_role", applicationName),
    ]);
    await blocker.query("begin");
    await blocker.query(lockQuery, lockParameters);
    const pending = [operation(first, 0)];
    if (firstMustBlock) {
      pending[0].catch(() => {});
      const deadline = Date.now() + 5_000;
      let waiting = 0;
      while (waiting < 1 && Date.now() < deadline) {
        const result = await db.query("select count(*)::int as count from pg_stat_activity where application_name=$1 and wait_event_type='Lock'", [applicationName]);
        waiting = result.rows[0].count;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(waiting, 1, "first operation must hold its payment lock before starting the refund");
    }
    pending.push(operation(second, 1));
    // Observe rejections immediately while checking that both clients blocked.
    pending.forEach((promise) => promise.catch(() => {}));
    try {
      const deadline = Date.now() + 5_000;
      let waiting = 0;
      while (waiting < 2 && Date.now() < deadline) {
        const result = await db.query("select count(*)::int as count from pg_stat_activity where application_name=$1 and wait_event_type='Lock'", [applicationName]);
        waiting = result.rows[0].count;
        if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(waiting, 2, "both operations must overlap while waiting for the row lock");
    } finally {
      await blocker.query("rollback");
    }
    return Promise.all(pending);
  }

  await t.test("the complete migration history applies to an empty database", () => {
    assert.ok(migrations.includes("20261018120000_ticket_payments.sql"));
  });

  await t.test("two concurrent buyers competing for the last seat create exactly one hold", async () => {
    const eventId = await event();
    const results = await concurrent("select id from public.events where id=$1 for update", [eventId],
      (client) => reserve(eventId, randomUUID(), "buyer@example.test", client));
    assert.equal(results.filter((result) => result.reservation).length, 1);
    assert.equal(results.filter((result) => result.error === "sold_out").length, 1);
    const { rows } = await db.query("select count(*)::int as count from public.ticket_reservations where event_id=$1", [eventId]);
    assert.equal(rows[0].count, 1);
  });

  await t.test("retrying a checkout request preserves its reservation without consuming another seat", async () => {
    const eventId = await event();
    const requestId = randomUUID();
    const first = await reserve(eventId, requestId);
    const second = await reserve(eventId, requestId);
    assert.equal(first.reservation.id, second.reservation.id);
    assert.equal((await reserve(eventId)).error, "sold_out");
    assert.equal((await reserve(eventId, requestId, "other@example.test")).error, "invalid_request");
  });

  await t.test("duplicate concurrent paid webhooks issue one QR ticket and increment sales once", async () => {
    const eventId = await event();
    const { reservation } = await reserve(eventId);
    const results = await concurrent("select id from public.events where id=$1 for update", [eventId],
      (client) => fulfill(reservation, `cs_${eventId}`, 2500, client));
    assert.deepEqual(results.map((result) => result.outcome), ["fulfilled", "fulfilled"]);
    assert.equal(results[0].ticket.id, results[1].ticket.id);
    assert.equal(results[0].ticket.status, "paid");
    assert.match(results[0].ticket.qr_code, /^[a-f0-9-]{36}$/);
    const { rows } = await db.query(`select e.posti_venduti, count(t.id)::int as tickets
      from public.events e left join public.tickets t on t.event_id=e.id where e.id=$1 group by e.id`, [eventId]);
    assert.deepEqual(rows[0], { posti_venduti: 1, tickets: 1 });
  });

  await t.test("expired and failed checkouts release capacity without reviving stale reservations", async () => {
    const eventId = await event();
    const { reservation } = await reserve(eventId);
    await service.query("select public.transition_ticket_reservation($1,'cs_expired','expired')", [reservation.id]);
    await service.query("select public.transition_ticket_reservation($1,'cs_expired','awaiting_payment')", [reservation.id]);
    const state = await db.query("select state from public.ticket_reservations where id=$1", [reservation.id]);
    assert.equal(state.rows[0].state, "expired");
    const replacement = await reserve(eventId);
    assert.ok(replacement.reservation);
    await service.query("select public.transition_ticket_reservation($1,'cs_failed','payment_failed')", [replacement.reservation.id]);
    assert.ok((await reserve(eventId)).reservation);
  });

  await t.test("expired unconfirmed holds stop consuming seats while asynchronous payments keep theirs", async () => {
    const eventId = await event();
    const first = await reserve(eventId);
    await db.query("update public.ticket_reservations set expires_at=now()-interval '1 minute' where id=$1", [first.reservation.id]);
    const second = await reserve(eventId);
    assert.ok(second.reservation);
    await service.query("select public.transition_ticket_reservation($1,'cs_async','awaiting_payment')", [second.reservation.id]);
    await db.query("update public.ticket_reservations set expires_at=now()-interval '1 minute' where id=$1", [second.reservation.id]);
    await service.query("select public.transition_ticket_reservation($1,'cs_async','expired')", [second.reservation.id]);
    assert.equal((await reserve(eventId)).error, "sold_out");
  });

  await t.test("late payment after another buyer holds the seat requires refund and never issues a ticket", async () => {
    const eventId = await event();
    const first = await reserve(eventId);
    await service.query("select public.transition_ticket_reservation($1,'cs_late','expired')", [first.reservation.id]);
    const replacement = await reserve(eventId);
    const result = await fulfill(first.reservation, "cs_late");
    assert.equal(result.outcome, "refund_required");
    let { rows } = await db.query(`select state, failure_reason,
      (select count(*)::int from public.tickets where event_id=$2) as tickets
      from public.ticket_reservations where id=$1`, [first.reservation.id, eventId]);
    assert.deepEqual(rows[0], { state: "refund_required", failure_reason: "capacity_unavailable", tickets: 0 });
    for (const state of ["refund_pending", "refunded"]) {
      await service.query("update public.ticket_reservations set state=$2, refund_id='re_test' where id=$1", [first.reservation.id, state]);
      assert.equal((await fulfill(first.reservation, "cs_late")).outcome, state);
    }
    assert.equal((await fulfill(replacement.reservation, "cs_replacement")).outcome, "fulfilled");
    ({ rows } = await db.query("select posti_venduti from public.events where id=$1", [eventId]));
    assert.equal(rows[0].posti_venduti, 1);
  });

  await t.test("amount mismatch requires refund instead of fulfilling a cheaper payment", async () => {
    const eventId = await event();
    const { reservation } = await reserve(eventId);
    assert.equal((await fulfill(reservation, "cs_wrong_amount", 1)).outcome, "refund_required");
    const { rows } = await db.query("select failure_reason from public.ticket_reservations where id=$1", [reservation.id]);
    assert.equal(rows[0].failure_reason, "amount_mismatch");
  });

  await t.test("refund arriving before paid Checkout prevents QR issuance, including duplicate refund delivery", async () => {
    const eventId = await event();
    const { reservation } = await reserve(eventId);
    const sessionId = `cs_refund_first_${eventId}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      await service.query("select public.revoke_event_ticket($1)", [`pi_${sessionId}`]);
    }
    const result = await fulfill(reservation, sessionId);
    assert.equal(result.outcome, "refunded");
    assert.equal(result.ticket, undefined);
    const { rows } = await db.query(`select r.state, e.posti_venduti,
      (select count(*)::int from public.tickets where event_id=$2) as tickets,
      (select count(*)::int from public.ticket_payment_refunds where payment_intent=$3) as refunds
      from public.ticket_reservations r join public.events e on e.id=r.event_id where r.id=$1`,
    [reservation.id, eventId, `pi_${sessionId}`]);
    assert.deepEqual(rows[0], { state: "refunded", posti_venduti: 0, tickets: 0, refunds: 1 });
  });

  await t.test("a refund overlapping paid fulfillment leaves the issued ticket and reservation refunded", async () => {
    const eventId = await event();
    const { reservation } = await reserve(eventId);
    const sessionId = `cs_refund_race_${eventId}`;
    const results = await concurrent("select id from public.events where id=$1 for update", [eventId],
      (client, index) => index === 0 ? fulfill(reservation, sessionId, 2500, client)
        : client.query("select public.revoke_event_ticket($1)", [`pi_${sessionId}`]), true);
    assert.equal(results[0].outcome, "fulfilled");
    const { rows } = await db.query(`select t.status, r.state from public.tickets t
      join public.ticket_reservations r on r.stripe_session_id=t.stripe_session_id
      where t.stripe_payment_intent=$1`, [`pi_${sessionId}`]);
    assert.deepEqual(rows, [{ status: "refunded", state: "refunded" }]);
    assert.equal((await fulfill(reservation, sessionId)).ticket.status, "refunded");
  });

  await t.test("public and signed-in visitors cannot call inventory/payment RPCs or read buyer reservations", async () => {
    const eventId = await event();
    for (const role of ["anon", "authenticated"]) {
      const visitor = await connect(role);
      await assert.rejects(reserve(eventId, randomUUID(), "visitor@example.test", visitor), { code: "42501" });
      await assert.rejects(visitor.query("select public.fulfill_event_ticket(null,$1,'cs_forbidden',null,'visitor@example.test',2500)", [eventId]), { code: "42501" });
      await assert.rejects(visitor.query("select public.transition_ticket_reservation($1,null,'expired')", [randomUUID()]), { code: "42501" });
      await assert.rejects(visitor.query("select public.claim_ticket_email($1)", [randomUUID()]), { code: "42501" });
      await assert.rejects(visitor.query("select public.revoke_event_ticket('pi_forbidden')"), { code: "42501" });
      await assert.rejects(visitor.query("select public.increment_ticket_count($1)", [eventId]), { code: "42501" });
      await assert.rejects(visitor.query("select public.decrement_stock($1,1)", [randomUUID()]), { code: "42501" });
      await assert.rejects(visitor.query("select * from public.ticket_reservations"), { code: "42501" });
      await assert.rejects(visitor.query("select * from public.ticket_payment_refunds"), { code: "42501" });
    }
  });

  await t.test("two concurrent scanners admit exactly once, including under PostgreSQL row locking", async () => {
    const eventId = await event();
    const { reservation } = await reserve(eventId);
    const { ticket } = await fulfill(reservation, `cs_checkin_${eventId}`);
    const staffId = randomUUID();
    await db.query("insert into auth.users(id) values ($1)", [staffId]);
    await db.query("insert into public.profiles(id,email,role) values ($1,$2,'editor')", [staffId, `${staffId}@example.test`]);
    const results = await concurrent("select id from public.tickets where id=$1 for update", [ticket.id],
      async (client) => {
        await client.query("set role authenticated");
        await client.query("select set_config('request.jwt.claim.sub',$1,false)", [staffId]);
        return client.query(`update public.tickets set status='used', used_at=now()
          where qr_code=$1 and event_id=$2 and status='paid' returning id,status,used_at`, [ticket.qr_code, eventId]);
      });
    assert.deepEqual(results.map((result) => result.rowCount).sort(), [0, 1]);
    const admitted = results.find((result) => result.rowCount === 1).rows[0];
    assert.equal(admitted.status, "used");
    assert.ok(admitted.used_at instanceof Date);
  });

  await t.test("ordinary authenticated visitors cannot read buyer tickets or perform check-in through RLS", async () => {
    const eventId = await event();
    const { reservation } = await reserve(eventId);
    const { ticket } = await fulfill(reservation, `cs_rls_${eventId}`);
    const viewerId = randomUUID();
    await db.query("insert into auth.users(id) values ($1)", [viewerId]);
    await db.query("insert into public.profiles(id,email,role) values ($1,$2,'viewer')", [viewerId, `${viewerId}@example.test`]);
    const viewer = await connect("authenticated");
    await viewer.query("select set_config('request.jwt.claim.sub',$1,false)", [viewerId]);
    assert.equal((await viewer.query("select * from public.tickets where id=$1", [ticket.id])).rowCount, 0);
    assert.equal((await viewer.query("update public.tickets set status='used' where id=$1 returning id", [ticket.id])).rowCount, 0);
    assert.equal((await db.query("select status from public.tickets where id=$1", [ticket.id])).rows[0].status, "paid");
  });

  await t.test("email delivery claims are exclusive and become retryable only after the lease expires", async () => {
    const eventId = await event();
    const { reservation } = await reserve(eventId);
    const { ticket } = await fulfill(reservation, `cs_email_${eventId}`);
    const results = await concurrent("select id from public.tickets where id=$1 for update", [ticket.id],
      (client) => client.query("select public.claim_ticket_email($1) as claimed", [ticket.id]));
    assert.deepEqual(results.map((result) => result.rows[0].claimed).sort(), [false, true]);
    await db.query("update public.tickets set email_claimed_at=now()-interval '6 minutes' where id=$1", [ticket.id]);
    assert.equal((await service.query("select public.claim_ticket_email($1) as claimed", [ticket.id])).rows[0].claimed, true);
    await db.query("update public.tickets set email_sent_at=now() where id=$1", [ticket.id]);
    assert.equal((await service.query("select public.claim_ticket_email($1) as claimed", [ticket.id])).rows[0].claimed, false);
  });
});
