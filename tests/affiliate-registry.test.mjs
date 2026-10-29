import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const affiliateId = "aaaaaaaa-1111-4111-8111-111111111111";
const row = { id: affiliateId, name: "Scuola Aurora", created_at: "2026-10-26T10:00:00Z" };
const plain = value => JSON.parse(JSON.stringify(value));
function load(file, mocks = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const compiledModule = { exports: {} };
  vm.runInNewContext(source, { module: compiledModule, exports: compiledModule.exports, require: name => name in mocks ? mocks[name] : name === "server-only" ? {} : name === "./affiliate-commissions" ? commissionDomain : require(name) });
  return compiledModule.exports;
}
const commissionDomain = load("lib/events/affiliate-commissions.ts");
const profiles = load("lib/events/affiliate-profile-schema.ts");
const enriched = value => ({ id: value.id, name: value.name, createdAt: value.created_at, contactName: value.contact_name || "", email: value.email || "", phone: value.phone || "", notes: value.notes || "", defaultCommissionType: value.default_commission_type || "eur", defaultCommissionCents: value.default_commission_cents || 0, defaultCommissionCredits: value.default_commission_credits || 0, deletedAt: value.deleted_at || null });
function fixture({ denied = false, rows = [row], readError = false, rpcError = null, rpcData = row } = {}) {
  let authorized = false;
  const calls = []; const revalidated = [];
  const db = {
    from(table) {
      assert.ok(authorized);
      const call = { table, order: [] }; calls.push(call);
      return {
        select(fields) { call.fields = fields; return this; },
        is(key,value) { call.filter = [key,value]; return this; },
        order(key) { call.order.push(key); return this; },
        async range(from, to) { call.range = [from, to]; return { data: readError ? null : rows.filter(row => !call.filter || row.deleted_at == null).slice(from, to + 1), error: readError ? { message: "PRIVATE" } : null }; },
      };
    },
    async rpc(name, args) { assert.ok(authorized); calls.push({ rpc: name, args }); return { data: rpcData, error: rpcError }; },
  };
  const auth = { requireCommerceStaff: async () => { if (denied) throw Error("Accesso negato"); authorized = true; return db; } };
  const registry = load("lib/events/affiliate-registry.ts", { "@/lib/commerce/admin-auth": auth, "./affiliate-profile-schema": profiles });
  const actions = load("app/api/admin/affiliati/actions.ts", {
    "@/lib/commerce/admin-auth": auth, "@/lib/events/affiliate-registry": registry, "@/lib/events/affiliate-profile-schema": profiles,
    "next/cache": { revalidatePath: (...args) => revalidated.push(args) },
  });
  return { ...registry, ...actions, calls, revalidated };
}

test("the private affiliate registry requires staff before reads and creations", async () => {
  const api = fixture({ denied: true });
  await assert.rejects(api.loadAffiliateRegistry(), /Accesso negato/);
  await assert.rejects(api.createAffiliate({ name: "" }), /Accesso negato/);
  assert.equal(api.calls.length, 0);
});

test("the registry reads every stable page and exposes only anagrafica fields", async () => {
  const rows = Array.from({ length: 501 }, (_, index) => ({ ...row, name: `Scuola ${String(index).padStart(3, "0")}` }));
  const api = fixture({ rows }); const result = await api.loadAffiliateRegistry();
  assert.equal(result.length, 501);
  assert.deepEqual(plain(result[0]), enriched({ ...row, name: "Scuola 000" }));
  assert.deepEqual(plain(api.calls.map(call => call.range)), [[0, 499], [500, 999]]);
  assert.ok(api.calls.every(call => call.table === "affiliates" && call.fields === "id,name,created_at,contact_name,email,phone,notes,default_commission_type,default_commission_cents,default_commission_credits,deleted_at" && call.order.join() === "name,id"));
  await assert.rejects(fixture({ readError: true }).loadAffiliateRegistry(), /Impossibile caricare/);
  await assert.rejects(fixture({ rows: [{ ...row, id: "bad" }] }).loadAffiliateRegistry(), /non valido/);
});

test("affiliate creation normalizes whitespace, uses the private atomic RPC and refreshes all locale directories", async () => {
  const api = fixture(); const result = await api.createAffiliate({ name: "  Scuola   Aurora  " });
  assert.deepEqual(plain(result), { success: true, affiliate: enriched(row) });
  assert.deepEqual(plain(api.calls), [{ rpc: "save_affiliate_profile", args: { p_id: null, p_input: { name: "Scuola Aurora",contactName:"",email:"",phone:"",notes:"",defaultCommissionType:"eur",defaultCommissionCents:0,defaultCommissionCredits:0 } } }]);
  assert.ok(api.revalidated.some(([path, kind]) => path === "/it/admin/affiliati" && kind === "layout"));
  assert.ok(api.revalidated.some(([path, kind]) => path === "/es/admin/eventi" && kind === "layout"));
});

test("invalid names and duplicate names produce actionable errors without leaking database details", async () => {
  for (const name of ["", " ", "A\nB", "A".repeat(121), 123]) {
    const api = fixture(); assert.equal((await api.createAffiliate({ name })).success, false); assert.equal(api.calls.length, 0);
  }
  for (const [code, expected] of [["23505", /Esiste già/], ["08006", /Non è stato possibile/]]) {
    const api = fixture({ rpcError: { code, message: "PRIVATE DATABASE CONTENT" } });
    const result = await api.createAffiliate({ name: row.name });
    assert.equal(result.success, false); assert.match(result.error, expected); assert.doesNotMatch(result.error, /PRIVATE/);
    assert.equal(api.revalidated.length, 0);
  }
});


test("private contacts are validated and deletion remains reversible through authenticated RPCs", async () => {
  const api=fixture();
  const updated=await api.updateAffiliate(affiliateId,{name:row.name,contactName:"Ada",email:"ada@example.test",phone:"+39 3331234567",notes:"Nota",defaultCommissionCents:500,assignments:[]});
  assert.equal(updated.success,true);
  assert.equal(api.calls[0].rpc,"save_affiliate_profile");
  assert.equal(api.calls[0].args.p_id,affiliateId);
  assert.equal(api.calls[0].args.p_input.assignments.length,0);
  assert.equal((await api.deleteAffiliate(affiliateId)).success,true);
  assert.equal(api.calls[1].rpc,"set_affiliate_deleted");assert.equal(api.calls[1].args.p_deleted,true);
  assert.equal((await api.restoreAffiliate(affiliateId)).success,true);assert.equal(api.calls[2].args.p_deleted,false);
  for(const fn of ['updateAffiliate','deleteAffiliate','restoreAffiliate']) {
    const denied=fixture({denied:true});await assert.rejects(denied[fn](affiliateId,{name:row.name}),/Accesso negato/);assert.equal(denied.calls.length,0);
  }
  for(const input of [{name:row.name,email:'invalid'},{name:row.name,phone:'abc'},{name:row.name,defaultCommissionCents:-1},{name:row.name,notes:'x'.repeat(2001)},{name:row.name,assignments:[{eventId:affiliateId,commissionCents:1},{eventId:affiliateId,commissionCents:2}]}]) {
    const rejected=fixture();assert.equal((await rejected.createAffiliate(input)).success,false);assert.equal(rejected.calls.length,0);
  }
});

test("the active registry excludes the trash and explicit includeDeleted supports restoration",async()=>{
 const deleted={...row,id:'aaaaaaaa-1111-4111-8111-222222222222',deleted_at:'2026-10-26T12:00:00Z'};
 const api=fixture({rows:[row,deleted]});assert.equal((await api.loadAffiliateRegistry()).length,1);
 const all=await api.loadAffiliateRegistry({includeDeleted:true});assert.equal(all.length,2);assert.ok(all.find(item=>item.id===deleted.id).deletedAt);
});
