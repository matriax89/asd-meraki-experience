import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const compiled = ts.transpileModule(readFileSync(new URL("../src/lib/events/activity-timing.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const loaded = { exports: {} };
vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports });
const timing = loaded.exports;
const plain = value => JSON.parse(JSON.stringify(value));

test("current organizer timing takes precedence while deleted activities retain snapshot timing", () => {
  const snapshot = { activities: [{ id: "mc", startsAt: "2026-12-19T14:00:00Z" }, { id: "old", startsAt: "2026-12-19T18:00:00Z" }] };
  const current = { activities: [{ id: "mc", checkInStartsAt: "2026-12-19T15:00:00Z", startsAt: "2026-12-19T15:30:00Z", endsAt: "2026-12-19T17:00:00Z" }] };
  assert.deepEqual(plain(timing.resolveActivityTiming(current,snapshot,"mc")), {checkInStartsAt:current.activities[0].checkInStartsAt,startsAt:current.activities[0].startsAt,endsAt:current.activities[0].endsAt});
  assert.deepEqual(plain(timing.resolveActivityTiming(current,snapshot,"old")), {startsAt:snapshot.activities[1].startsAt});
  assert.deepEqual(plain(timing.resolveActivityTiming({activities:[{id:"mc",startsAt:null}]},snapshot,"mc")), {}, "an organizer may explicitly clear an unconfirmed schedule");
  assert.deepEqual(plain(timing.resolveActivityTiming(null,snapshot,"unknown")), {});
});

test("activity schedule uses Italian dates, 24-hour clocks and Europe/Rome in winter and summer", () => {
  assert.equal(timing.activityTimingRows({startsAt:"2026-12-19T15:30:00Z"},"en")[0].value,"19/12/2026, 16:30");
  assert.equal(timing.activityTimingRows({startsAt:"2027-08-01T10:30:00Z"},"en")[0].value,"01/08/2027, 12:30");
  assert.equal(timing.activityTimingCopy("unknown").start,"Inizio attività");
  assert.equal(timing.hasActivityTiming({startsAt:"invalid",endsAt:null}),false);
  assert.deepEqual(plain(timing.activityTimingRows({startsAt:"invalid",endsAt:null},"it")),[]);
});
