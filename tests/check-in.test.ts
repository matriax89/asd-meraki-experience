import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import type { CheckInResult } from "../src/lib/tickets/check-in-types";

type Row = Record<string, unknown>;
type Action = (code: string, eventId: string, activityId?: string) => Promise<CheckInResult>;
type Actions = { checkInQrCode: Action; checkInTicket: Action };

const eventId = "e60752c4-b104-46bf-ad41-105dc7a05d40";
const otherEventId = "f0c59975-552a-4471-bc3b-fb1940bc81ab";
const ticketId = "0f23f119-7b2c-4238-bb3f-c69b76ad1533";
const userId = "499188a0-883a-4930-b53c-dc098a362c7f";
const qrCode = "ticket_test_opaque_code";
const source = readFileSync(new URL("../src/app/api/admin/biglietti/actions.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function paidTicket(overrides: Row = {}): Row {
  return {
    id: ticketId,
    event_id: eventId,
    qr_code: qrCode,
    buyer_nome: "Ada",
    buyer_cognome: "Rossi",
    buyer_email: "private@example.test",
    status: "paid",
    used_at: null,
    ...overrides,
  };
}

function harness(rows: Row[] = [paidTicket()], options: {
  user?: boolean;
  authError?: boolean;
  role?: "admin" | "editor" | "viewer" | null;
  updateError?: boolean;
  synchronizeUpdates?: boolean;
  returnUpdatedRow?: boolean;
  commerceOutcome?: string;
  commerceError?: string;
} = {}) {
  const tickets = rows.map((row) => ({ ...row }));
  const revalidations: unknown[][] = [];
  let ticketOperations = 0;
  const commerceCalls: Record<string, unknown>[] = [];
  let updateCount = 0;
  let releaseUpdates: (() => void) | undefined;
  const updatesReady = new Promise<void>((resolve) => { releaseUpdates = resolve; });
  let arrivingUpdates = 0;

  // Small PostgREST adapter with ordinary predicates and projection. It models
  // one atomic conditional UPDATE, without encoding any check-in outcomes.
  class Query {
    private fields = "*";
    private filters: [string, unknown][] = [];
    private patch: Row | undefined;
    private table: string;
    private serviceRole: boolean;
    constructor(table: string, serviceRole: boolean) {
      this.table = table;
      this.serviceRole = serviceRole;
    }
    select(fields: string) { this.fields = fields; return this; }
    eq(field: string, value: unknown) { this.filters.push([field, value]); return this; }
    update(patch: Row) { this.patch = patch; return this; }
    single() { return this.execute(); }
    maybeSingle() { return this.execute(); }
    private async execute(): Promise<{ data: Row | null; error: Row | null }> {
      await Promise.resolve();
      if (this.table === "profiles") {
        const role = options.role === undefined ? "admin" : options.role;
        const profile = this.serviceRole && role ? { id: userId, role } : null;
        return { data: profile, error: null };
      }
      if (this.patch) {
        if (options.updateError) return { data: null, error: { code: "08006" } };
        if (options.synchronizeUpdates) {
          arrivingUpdates += 1;
          if (arrivingUpdates === 2) releaseUpdates?.();
          await updatesReady;
        }
      }
      const row = tickets.find((candidate) => this.filters.every(([field, value]) => candidate[field] === value));
      if (!row) return { data: null, error: null };
      if (this.patch) {
        Object.assign(row, this.patch);
        updateCount += 1;
        if (options.returnUpdatedRow === false) return { data: null, error: null };
      }
      const selected = this.fields === "*" ? { ...row }
        : Object.fromEntries(this.fields.split(",").map((field) => [field, row[field]]));
      return { data: selected, error: null };
    }
  }

  const client = (serviceRole: boolean) => ({
    auth: {
      getUser: async () => ({
        data: { user: options.user === false ? null : { id: userId } },
        error: options.authError ? { message: "Invalid JWT" } : null,
      }),
      // An unverified cookie session must never grant permission to check in.
      getSession: async () => ({ data: { session: { user: { id: userId } } }, error: null }),
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      assert.equal(name, "check_in_commerce_pass");
      assert.equal(serviceRole, true);
      commerceCalls.push(args);
      if (options.commerceError) return { data: null, error: { code: options.commerceError } };
      const outcome = options.commerceOutcome || "not_found";
      return { data: { outcome, message: "Commerce check-in", ...(outcome !== "not_found" ? {
        pass: { id: ticketId, event_id: eventId, first_name: "Ada", last_name: "Rossi", status: "paid" },
        entitlements: [
          { activity_id: "workshop", activity_name: "Workshop", status: "used", checked_in_at: "2026-10-18T10:00:00Z", menu_choice: null },
          { activity_id: "cena", activity_name: "Cena", status: "valid", checked_in_at: null, menu_choice: "Vegetariano" },
        ],
      } : {}) }, error: null };
    },
    from: (table: string) => {
      assert.ok(table === "profiles" || table === "tickets", `Unexpected table: ${table}`);
      if (table === "tickets") ticketOperations += 1;
      return new Query(table, serviceRole);
    },
  });
  const exports: Partial<Actions> = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (name === "@/lib/supabase/server") return { createClient: async () => client(false), createAdminClient: () => client(true) };
      if (name === "next/cache") return { revalidatePath: (...args: unknown[]) => revalidations.push(args) };
      throw new Error(`Unexpected import in action test: ${name}`);
    },
    console: { error: () => undefined },
  });
  return {
    actions: exports as Actions,
    tickets,
    commerceCalls,
    revalidations,
    ticketOperations: () => ticketOperations,
    updateCount: () => updateCount,
  };
}

test("a trusted operator admits a paid ticket and returns only check-in data", async () => {
  const fixture = harness();
  const result = await fixture.actions.checkInQrCode(qrCode, eventId);
  assert.equal(result.outcome, "admitted");
  assert.equal(fixture.tickets[0].status, "used");
  assert.ok(Number.isFinite(Date.parse(String(fixture.tickets[0].used_at))));
  assert.deepEqual(Object.keys(result.ticket || {}).sort(), ["buyer_cognome", "buyer_nome", "event_id", "id", "status", "used_at"]);
  assert.equal(fixture.revalidations.length, 1);
});

test("two simultaneous operators scanning the same ticket admit exactly one", { timeout: 2000 }, async () => {
  const fixture = harness([paidTicket()], { synchronizeUpdates: true });
  const results = await Promise.all([
    fixture.actions.checkInQrCode(qrCode, eventId),
    fixture.actions.checkInQrCode(qrCode, eventId),
  ]);
  assert.deepEqual(results.map((result) => result.outcome).sort(), ["admitted", "already_used"]);
  assert.equal(fixture.updateCount(), 1);
  assert.equal(fixture.revalidations.length, 1);
});

test("a zero-row update never becomes an admission", async () => {
  const fixture = harness([paidTicket()], { returnUpdatedRow: false });
  const result = await fixture.actions.checkInQrCode(qrCode, eventId);
  assert.equal(result.outcome, "already_used");
  assert.equal(fixture.revalidations.length, 0);
});

test("a ticket for a different event remains unused", async () => {
  const fixture = harness();
  const result = await fixture.actions.checkInQrCode(qrCode, otherEventId);
  assert.equal(result.outcome, "wrong_event");
  assert.equal(fixture.tickets[0].status, "paid");
  assert.equal(fixture.tickets[0].used_at, null);
  assert.equal(fixture.updateCount(), 0);
});

for (const [status, expected] of [["pending", "unpaid"], ["refunded", "refunded"], ["used", "already_used"]]) {
  test(`${status} tickets are rejected without altering their state`, async () => {
    const fixture = harness([paidTicket({ status, used_at: status === "used" ? "2026-10-18T10:00:00Z" : null })]);
    const before = { ...fixture.tickets[0] };
    const result = await fixture.actions.checkInQrCode(qrCode, eventId);
    assert.equal(result.outcome, expected);
    assert.deepEqual(fixture.tickets[0], before);
    assert.equal(fixture.updateCount(), 0);
  });
}

test("an unknown QR code cannot admit a participant", async () => {
  const fixture = harness();
  const result = await fixture.actions.checkInQrCode("ticket_unknown", eventId);
  assert.equal(result.outcome, "invalid");
  assert.equal(fixture.updateCount(), 0);
});

test("an unverified cookie session cannot substitute for getUser authentication", async () => {
  const fixture = harness([paidTicket()], { user: false });
  const result = await fixture.actions.checkInQrCode(qrCode, eventId);
  assert.equal(result.outcome, "error");
  assert.equal(fixture.ticketOperations(), 0);
});

test("an invalid authentication response blocks all ticket access", async () => {
  const fixture = harness([paidTicket()], { authError: true });
  assert.equal((await fixture.actions.checkInQrCode(qrCode, eventId)).outcome, "error");
  assert.equal(fixture.ticketOperations(), 0);
});

for (const role of ["viewer", null] as const) {
  test(`${role || "missing"} profile cannot check in tickets`, async () => {
    const fixture = harness([paidTicket()], { role });
    assert.equal((await fixture.actions.checkInQrCode(qrCode, eventId)).outcome, "error");
    assert.equal(fixture.ticketOperations(), 0);
  });
}

test("editors can register a manual check-in using the same admission rules", async () => {
  const fixture = harness([paidTicket()], { role: "editor" });
  assert.equal((await fixture.actions.checkInTicket(ticketId, eventId)).outcome, "admitted");
  assert.equal((await fixture.actions.checkInTicket(ticketId, eventId)).outcome, "already_used");
  assert.equal(fixture.updateCount(), 1);
});

test("database failure is an explicit error and cannot show admission", async () => {
  const fixture = harness([paidTicket()], { updateError: true });
  assert.equal((await fixture.actions.checkInQrCode(qrCode, eventId)).outcome, "error");
  assert.equal(fixture.tickets[0].status, "paid");
  assert.equal(fixture.revalidations.length, 0);
});

test("invalid QR payloads and event identifiers fail before ticket access", async () => {
  const fixture = harness();
  for (const [code, selectedEvent] of [["https://example.test/unrelated", eventId], ["x".repeat(257), eventId], [qrCode, "invalid-event"], ["", eventId]]) {
    assert.equal((await fixture.actions.checkInQrCode(code, selectedEvent)).outcome, "invalid");
  }
  assert.equal(fixture.ticketOperations(), 0);
});


test("commerce admission consumes only the selected activity and leaves dinner available", async () => {
  const fixture = harness([], { commerceOutcome: "success" });
  const result = await fixture.actions.checkInQrCode(qrCode, eventId, "workshop");
  assert.equal(result.outcome, "admitted");
  assert.equal(result.ticket?.status, "paid");
  assert.equal(result.ticket?.entitlements?.find((entry) => entry.activity_id === "cena")?.status, "valid");
  assert.equal(fixture.commerceCalls[0].p_activity_id, "workshop");
  assert.equal(fixture.ticketOperations(), 0);
  assert.equal(fixture.revalidations.length, 1);
});

for (const [outcome, expected] of [["invalid_activity", "invalid_activity"], ["already_used", "already_used"], ["refunded", "refunded"], ["invalid_event", "wrong_event"]]) {
  test(`commerce ${outcome} never falls back to legacy admission`, async () => {
    const fixture = harness([paidTicket()], { commerceOutcome: outcome });
    const result = await fixture.actions.checkInQrCode(qrCode, eventId, "cena");
    assert.equal(result.outcome, expected);
    assert.equal(fixture.ticketOperations(), 0);
    assert.equal(fixture.updateCount(), 0);
  });
}

test("commerce database errors reject admission without querying legacy tickets", async () => {
  const fixture = harness([paidTicket()], { commerceError: "08006" });
  assert.equal((await fixture.actions.checkInQrCode(qrCode, eventId, "workshop")).outcome, "error");
  assert.equal(fixture.ticketOperations(), 0);
});

test("unauthenticated operators cannot invoke the service-only commerce check-in", async () => {
  const fixture = harness([], { user: false, commerceOutcome: "success" });
  assert.equal((await fixture.actions.checkInQrCode(qrCode, eventId, "workshop")).outcome, "error");
  assert.equal(fixture.commerceCalls.length, 0);
});

test("a legacy general-entry ticket cannot grant a workshop, masterclass, or dinner entitlement", async () => {
  const fixture = harness([paidTicket()]);
  assert.equal((await fixture.actions.checkInQrCode(qrCode, eventId, "cena")).outcome, "invalid_activity");
  assert.equal(fixture.ticketOperations(), 0);
  assert.equal(fixture.updateCount(), 0);
  assert.equal(fixture.tickets[0].status, "paid");
  assert.equal((await fixture.actions.checkInQrCode(qrCode, eventId, "__legacy_event")).outcome, "admitted");
  assert.equal(fixture.commerceCalls[1].p_activity_id, null);
  assert.equal(fixture.updateCount(), 1);
});
