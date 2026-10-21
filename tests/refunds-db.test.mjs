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
test("refund ledger and cancellation with an isolated PostgreSQL cluster", {
  skip: supported ? false : "Set MERAKI_PG_BIN to the directory containing initdb and pg_ctl",
  timeout: 90_000,
}, async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "meraki-refund-pg-"));
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
  const historicalEvent=randomUUID();
  for (const migration of migrations) {
    try {
      if(migration==='20261021150000_meraki_refunds.sql') await db.query(`
        insert into public.events(id,slug,titolo,data_inizio) values($1,'historical-refund-fixture','{"it":"Storico"}',now()+interval '1 day');
      `,[historicalEvent]).then(()=>db.query(`insert into public.tickets(event_id,buyer_email,buyer_nome,buyer_cognome,stripe_session_id,stripe_payment_intent,amount_cents,status) values($1,'history@example.test','Ada','Test','cs_historical','pi_historical',1800,'paid')`,[historicalEvent]));
      await db.query(await readFile(path.join(migrationsDirectory, migration), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${migration} failed: ${error.message}`, { cause: error });
    }
  }

  const service = await connect("service_role");
  const actor=randomUUID();
  const config={version:1,enabled:true,waitlistEnabled:true,upgradesEnabled:true,activities:[
    {id:'ws',name:'Workshop',kind:'workshop',capacity:30,startsAt:null,salesEnd:null,menuOptions:[]},
    {id:'mc',name:'Masterclass',kind:'masterclass',capacity:30,startsAt:null,salesEnd:null,menuOptions:[]},
    {id:'dinner',name:'Cena',kind:'dinner',capacity:30,startsAt:null,salesEnd:null,menuOptions:[]},
  ],packages:[
    {id:'ws',name:'Workshop',description:'',activityIds:['ws'],prices:[{id:'standard',label:'Standard',amountCents:3000,startsAt:null,endsAt:null}]},
    {id:'bundle',name:'Combo',description:'',activityIds:['ws','mc'],prices:[{id:'standard',label:'Standard',amountCents:5000,startsAt:null,endsAt:null}]},
  ],addons:[{id:'dinner',name:'Cena',activityId:'dinner',amountCents:2000}]};
  const person=(packageId='bundle',firstName='Ada',addonIds=[])=>({firstName,lastName:'Test',packageId,addonIds,menuChoices:{}});
  const call=async(sql,args=[],client=service)=>(await client.query(sql,args)).rows[0]?.result;
  const event=async()=>{
    const id=randomUUID();
    await db.query(`insert into public.events(id,slug,titolo,data_inizio,prezzo_cents,capacity,commerce_config) values($1,$2,'{"it":"Rimborsi test"}',now()+interval '30 days',2500,100,$3)`,[id,`refund-${id}`,JSON.stringify(config)]);
    return id;
  };
  const reserve=async(id,people=[person()],pass=null)=>call(`select public.reserve_event_commerce($1,$2,'buyer@example.test','it',$3,$4,$5) result`,[id,randomUUID(),JSON.stringify(people),pass?.id??null,pass?.qr_code??null]);
  const fulfill=async(order)=>{
    const pi=`pi_${randomUUID()}`,session=`cs_${randomUUID()}`;
    const result=await call('select public.fulfill_event_commerce($1,$2,$3,$4,$5) result',[order.id,session,pi,order.amount_cents,order.buyer_email]);
    return {order:{...order,stripe_payment_intent:pi,stripe_session_id:session},...result};
  };
  const paid=async(people=[person()])=>{
    const id=await event(); const {order}=await reserve(id,people); const result=await fulfill(order);
    return {event:id,...result};
  };
  const rights=async(orderId)=>(await service.query('select * from public.commerce_entitlements where order_id=$1 order by activity_id',[orderId])).rows;
  const refund=async(order,amount,targets=[],request=randomUUID(),cancellation=null)=>call('select public.reserve_meraki_refund($1,$2,null,$3,$4,$5,$6,$7) result',[request,order.id,amount,'Richiesta cliente',targets,actor,cancellation]);
  const finish=async(r,status='succeeded',stripeId=`re_${randomUUID()}`)=>call('select public.complete_meraki_refund($1,$2,$3,null) result',[r.id,stripeId,status]);
  const count=async(id)=>(await service.query('select posti_venduti from public.events where id=$1',[id])).rows[0].posti_venduti;
  const cancel=async(id)=>call('select public.begin_meraki_event_cancellation($1,$2,$3) result',[id,'Evento annullato per prova',actor]);

  await t.test('pre-reservation historical Stripe tickets are included as refundable source rows',async()=>{
    const rows=(await service.query('select buyer_email,amount_cents,state,stripe_payment_intent from public.ticket_reservations where event_id=$1',[historicalEvent])).rows;
    assert.deepEqual(rows,[{buyer_email:'history@example.test',amount_cents:1800,state:'fulfilled',stripe_payment_intent:'pi_historical'}]);
  });

  await t.test('ledger, cancellation rows and financial RPCs are private',async()=>{
    for(const role of ['anon','authenticated']){
      const c=await connect(role);
      for(const table of ['meraki_refunds','meraki_event_cancellations','meraki_cancellation_emails']) await assert.rejects(c.query(`select * from public.${table}`),/permission denied/);
      await assert.rejects(c.query('select public.begin_meraki_event_cancellation($1,$2,$3)',[randomUUID(),'Test',actor]),/permission denied/);
      await assert.rejects(c.query('select public.reserve_meraki_refund($1,$2,null,1,$3,$4,$5,null)',[randomUUID(),randomUUID(),'Test',[],actor]),/permission denied/);
    }
  });
  await t.test('partial goodwill keeps all admissions; refund email is success-only and claimed once',async()=>{
    const p=await paid(); const r=await refund(p.order,1000);
    assert.equal(await call('select public.claim_meraki_refund_email($1) result',[r.id]),false);
    await finish(r,'pending','re_goodwill');
    assert((await rights(p.order.id)).every(x=>x.status==='valid'));
    await finish(r,'succeeded','re_goodwill');
    assert((await rights(p.order.id)).every(x=>x.status==='valid'));
    assert.equal(await count(p.event),1);
    assert.equal(await call('select public.claim_meraki_refund_email($1) result',[r.id]),true);
    assert.equal(await call('select public.claim_meraki_refund_email($1) result',[r.id]),false);
    await call('select public.complete_meraki_refund_email($1,true) result',[r.id]);
    assert.equal(await call('select public.claim_meraki_refund_email($1) result',[r.id]),false);
  });
  await t.test('partial target revokes only selected participant admission after success; repeat webhook is idempotent',async()=>{
    const p=await paid([person('bundle','Ada'),person('bundle','Luca')]);
    const all=await rights(p.order.id), selected=all.find(x=>x.activity_id==='ws');
    const r=await refund(p.order,1500,[selected.id]);
    await finish(r,'requires_action','re_target');
    assert.equal((await rights(p.order.id)).filter(x=>x.status==='valid').length,4);
    await finish(r,'succeeded','re_target'); await finish(r,'pending','re_target');
    const after=await rights(p.order.id);
    assert.equal(after.filter(x=>x.status==='refunded').length,1);
    assert.equal(after.find(x=>x.id===selected.id).status,'refunded');
    assert.equal(await count(p.event),2);
    const blocked=await reserve(p.event,[person('bundle')],p.passes.find(x=>x.id===selected.pass_id));
    assert.equal(blocked.error,'invalid_upgrade');
  });
  await t.test('refunding the remainder revokes all original payment admissions and releases each pass once',async()=>{
    const p=await paid([person(),person('bundle','Luca')]);
    await finish(await refund(p.order,1000));
    const r=await refund(p.order,9000);
    assert.equal(r.full_remaining,true); assert.equal(r.revoke_entitlement_ids.length,4);
    await finish(r,'succeeded','re_remainder'); await finish(r,'succeeded','re_remainder');
    assert((await rights(p.order.id)).every(x=>x.status==='refunded'));
    assert.equal(await count(p.event),0);
    await assert.rejects(refund(p.order,1),/Payment not refundable|already refunded/);
  });
  await t.test('a separately paid dinner survives an original payment refund',async()=>{
    const p=await paid([person('ws')]);
    const {order:upgrade}=await reserve(p.event,[person('ws','Ada',['dinner'])],p.passes[0]);
    assert.equal(upgrade.amount_cents,2000);
    const u=await fulfill(upgrade); assert.equal(u.outcome,'fulfilled');
    await finish(await refund(p.order,3000));
    assert((await rights(p.order.id)).every(x=>x.status==='refunded'));
    assert((await rights(u.order.id)).every(x=>x.status==='valid'));
    assert.equal(await count(p.event),1);
  });
  await t.test('same request returns original ledger; different payload is rejected and pending blocks double refund',async()=>{
    const p=await paid(),key=randomUUID(); const r=await refund(p.order,1000,[],key);
    assert.equal((await refund(p.order,1000,[],key)).id,r.id);
    await assert.rejects(refund(p.order,1001,[],key),/request mismatch/);
    await assert.rejects(refund(p.order,4500),/in progress/);
    await finish(r,'unknown',null); await assert.rejects(refund(p.order,1000),/in progress/);
    await finish(r,'failed',null);
    assert((await rights(p.order.id)).every(x=>x.status==='valid'));
    assert.equal((await refund(p.order,5000)).full_remaining,true);
  });
  await t.test('concurrent reservations cannot exceed the refundable balance',async()=>{
    const p=await paid(); const c1=await connect('service_role'),c2=await connect('service_role');
    const q=c=>call('select public.reserve_meraki_refund($1,$2,null,4000,$3,$4,$5,null) result',[randomUUID(),p.order.id,'Test',[],actor],c);
    const results=await Promise.allSettled([q(c1),q(c2)]);
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    assert.match(results.find(x=>x.status==='rejected').reason.message,/in progress|exceeds/);
  });
  await t.test('external partial refunds consume balance without guessing revoked admissions',async()=>{
    const p=await paid();
    const external=await call('select public.record_meraki_external_refund($1,$2,500,$3,null) result',[p.order.stripe_payment_intent,'re_external','succeeded']);
    assert.equal(external.created_by,null); assert.equal(external.status,'succeeded');
    assert.equal((await call('select public.record_meraki_external_refund($1,$2,500,$3,null) result',[p.order.stripe_payment_intent,'re_external','pending'])).status,'succeeded');
    await assert.rejects(refund(p.order,5000),/exceeds/);
    assert((await rights(p.order.id)).every(x=>x.status==='valid'));
    await finish(await refund(p.order,4500)); assert.equal(await count(p.event),0);
  });
  await t.test('foreign entitlement IDs, missing actor, and invalid amounts cannot reserve money',async()=>{
    const p=await paid(),other=await paid();
    await assert.rejects(refund(p.order,1000,[(await rights(other.order.id))[0].id]),/Invalid refund admissions/);
    await assert.rejects(refund(p.order,0),/Invalid refund request/);
    await assert.rejects(refund(p.order,5001),/exceeds/);
    await assert.rejects(call('select public.reserve_meraki_refund($1,$2,null,100,$3,$4,null,null) result',[randomUUID(),p.order.id,'Test',[]]),/Invalid refund request/);
  });
  await t.test('a canonical identity is required before a refund can revoke admissions',async()=>{
    const p=await paid(),r=await refund(p.order,5000);
    await assert.rejects(finish(r,'succeeded',null),/identity required/);
    await finish(r,'pending','re_bound');
    await assert.rejects(finish(r,'succeeded','re_other'),/identity mismatch/);
    assert((await rights(p.order.id)).every(x=>x.status==='valid'));
    await finish(r,'failed','re_bound'); await finish(r,'pending','re_bound');
    assert.equal((await service.query('select status from public.meraki_refunds where id=$1',[r.id])).rows[0].status,'failed');
  });
  await t.test('the reviewed balance and used-access confirmation are enforced atomically',async()=>{
    const p=await paid(),all=await rights(p.order.id);
    await call('select public.check_in_commerce_pass($1,$2,$3) result',[p.passes[0].qr_code,p.event,'ws']);
    await assert.rejects(refund(p.order,5000),/Confirm used/);
    await assert.rejects(call('select public.reserve_meraki_refund($1,$2,null,5000,$3,$4,$5,null,true,6000) result',[randomUUID(),p.order.id,'Test',[],actor]),/balance changed/);
    const r=await call('select public.reserve_meraki_refund($1,$2,null,5000,$3,$4,$5,null,true,5000) result',[randomUUID(),p.order.id,'Test',[],actor]);
    assert.equal(r.revoke_entitlement_ids.length,all.length);
    await finish(r);
  });
  await t.test('pending selected-admission refunds suspend check-in; failed refunds release that hold',async()=>{
    const p=await paid(),right=(await rights(p.order.id)).find(x=>x.activity_id==='ws');
    const r=await refund(p.order,1000,[right.id]);
    assert.equal((await call('select public.check_in_commerce_pass($1,$2,$3) result',[p.passes[0].qr_code,p.event,'ws'])).outcome,'refunded');
    assert.equal((await call('select public.check_in_commerce_pass($1,$2,$3) result',[p.passes[0].qr_code,p.event,'mc'])).outcome,'success');
    await finish(r,'failed',null);
    assert.equal((await call('select public.check_in_commerce_pass($1,$2,$3) result',[p.passes[0].qr_code,p.event,'ws'])).outcome,'success');
  });
  await t.test('a live upgrade hold blocks refund reservation and a pending goodwill refund blocks upgrades',async()=>{
    const p=await paid([person('ws')]);
    const {order:up}=await reserve(p.event,[person('bundle')],p.passes[0]);
    await assert.rejects(refund(p.order,1000),/upgrade payment is in progress/);
    await service.query("update public.commerce_orders set state='expired' where id=$1",[up.id]);
    const r=await refund(p.order,1000);
    assert.equal((await reserve(p.event,[person('bundle')],p.passes[0])).error,'invalid_upgrade');
    await finish(r,'failed',null);
    assert((await reserve(p.event,[person('bundle')],p.passes[0])).order);
  });
  await t.test('late upgrade fulfillment after an external original-payment refund requests a refund instead of granting access',async()=>{
    const p=await paid([person('ws')]);
    const {order:up}=await reserve(p.event,[person('bundle')],p.passes[0]);
    await call('select public.record_meraki_external_refund($1,$2,500,$3,null) result',[p.order.stripe_payment_intent,'re_external_upgrade','succeeded']);
    const result=await fulfill(up); assert.equal(result.outcome,'refund_required');
    assert.equal((await rights(up.id)).length,0);
    assert.equal((await service.query('select failure_reason from public.commerce_orders where id=$1',[up.id])).rows[0].failure_reason,'refund_conflict');
  });
  await t.test('failed email delivery can be retried without repeating its financial refund',async()=>{
    const p=await paid(),r=await finish(await refund(p.order,1000));
    assert.equal(await call('select public.claim_meraki_refund_email($1) result',[r.id]),true);
    await call('select public.complete_meraki_refund_email($1,false) result',[r.id]);
    assert.equal(await call('select public.claim_meraki_refund_email($1) result',[r.id]),true);
    const totals=(await service.query("select count(*)::int n,sum(amount_cents)::int cents from public.meraki_refunds where payment_intent=$1 and status='succeeded'",[p.order.stripe_payment_intent])).rows[0];
    assert.deepEqual(totals,{n:1,cents:1000});
    assert.equal((await reserve(p.event,[person()],p.passes[0])).error,'invalid_upgrade');
  });
  await t.test('revoking all admissions of one participant releases only that participant seat',async()=>{
    const p=await paid([person(),person('bundle','Luca')]); const all=await rights(p.order.id);
    const target=all.filter(x=>x.pass_id===p.passes[0].id).map(x=>x.id);
    await finish(await refund(p.order,3000,target));
    assert.equal(await count(p.event),1);
    const passes=(await service.query('select id,status from public.commerce_passes where order_id=$1',[p.order.id])).rows;
    assert.equal(passes.find(x=>x.id===p.passes[0].id).status,'refunded');
    assert.equal(passes.find(x=>x.id!==p.passes[0].id).status,'paid');
    await finish(await refund(p.order,7000)); assert.equal(await count(p.event),0);
  });
  await t.test('cancellation immediately blocks QR, hides event, stops new holds and persists deduplicated notices',async()=>{
    const p=await paid(),c=await cancel(p.event);
    assert.equal(c.status,'processing'); assert.equal((await cancel(p.event)).id,c.id);
    const state=(await service.query('select attivo,canceled_at from public.events where id=$1',[p.event])).rows[0];
    assert.equal(state.attivo,false); assert(state.canceled_at);
    assert((await rights(p.order.id)).every(x=>x.status==='canceled'));
    assert.equal(await count(p.event),0);
    const checked=await call('select public.check_in_commerce_pass($1,$2,$3) result',[p.passes[0].qr_code,p.event,'ws']);
    assert.equal(checked.outcome,'refunded');
    assert.equal((await reserve(p.event)).error,'event_unavailable');
    await assert.rejects(db.query('update public.events set attivo=true where id=$1',[p.event]),/cannot be reactivated/);
    const notices=(await service.query('select * from public.meraki_cancellation_emails where cancellation_id=$1',[c.id])).rows;
    assert.equal(notices.length,1); assert.equal(notices[0].email,'buyer@example.test'); assert.equal(notices[0].refund_expected,true);
    await finish(await refund(p.order,5000,[],randomUUID(),c.id));
    assert.equal(await count(p.event),0);
  });
  await t.test('late commerce payment after cancellation issues no QR and requests an automatic refund',async()=>{
    const id=await event(); const {order}=await reserve(id); await cancel(id);
    const result=await fulfill(order);
    assert.equal(result.outcome,'refund_required');
    assert.equal((await rights(order.id)).length,0);
    assert.equal((await service.query('select count(*)::int n from public.commerce_passes where order_id=$1',[order.id])).rows[0].n,0);
  });
  await t.test('canceled fulfilled checkout replay leaves refunds to the panel queue and never starts an automatic refund',async()=>{
    const p=await paid(); await cancel(p.event);
    const result=await call('select public.fulfill_event_commerce($1,$2,$3,$4,$5) result',[p.order.id,p.order.stripe_session_id,p.order.stripe_payment_intent,p.order.amount_cents,p.order.buyer_email]);
    assert.equal(result.outcome,'refund_pending');
    assert.equal((await service.query('select state from public.commerce_orders where id=$1',[p.order.id])).rows[0].state,'fulfilled');
    assert.equal((await service.query('select count(*)::int n from public.meraki_refunds where order_id=$1',[p.order.id])).rows[0].n,0);
    const r=await refund(p.order,p.order.amount_cents); assert.equal(r.full_remaining,true);
  });
  await t.test('cancellation and refund-conflict shortcuts validate frozen amount and purchase identity',async()=>{
    const id=await event(),{order}=await reserve(id); await cancel(id);
    const args=[order.id,'cs_bad_cancel','pi_bad_cancel',order.amount_cents-1,order.buyer_email];
    await assert.rejects(call('select public.fulfill_event_commerce($1,$2,$3,$4,$5) result',args),/Order mismatch/);
    args[3]=order.amount_cents;args[4]='wrong@example.test';
    await assert.rejects(call('select public.fulfill_event_commerce($1,$2,$3,$4,$5) result',args),/Order mismatch/);
    await assert.rejects(call('select public.fulfill_event_commerce($1,$2,$3,5000,$4) result',[randomUUID(),'cs_missing','pi_missing','buyer@example.test']),/Order not found/);
    assert.equal((await service.query('select state from public.commerce_orders where id=$1',[order.id])).rows[0].state,'expired');
    const p=await paid([person('ws')]),{order:up}=await reserve(p.event,[person('bundle')],p.passes[0]);
    await call('select public.record_meraki_external_refund($1,$2,500,$3,null) result',[p.order.stripe_payment_intent,'re_conflict_guard','succeeded']);
    await assert.rejects(call('select public.fulfill_event_commerce($1,$2,$3,$4,$5) result',[up.id,'cs_wrong_upgrade','pi_wrong_upgrade',up.amount_cents-1,up.buyer_email]),/Order mismatch/);
  });
  await t.test('a canceled zero-cost upgrade expires without requiring a nonexistent Stripe payment',async()=>{
    const p=await paid([person('ws')]);
    const {order}=await reserve(p.event,[person('bundle')],p.passes[0]);
    await service.query("update public.commerce_orders set amount_cents=0,stripe_session_id='zero_fixture' where id=$1",[order.id]);
    await cancel(p.event);
    const result=await call('select public.fulfill_event_commerce($1,$2,null,0,$3) result',[order.id,'zero_fixture',order.buyer_email]);
    assert.equal(result.outcome,'refund_required');
    await call("select public.transition_commerce_order($1,'zero_fixture','expired') result",[order.id]);
    assert.equal((await service.query('select state from public.commerce_orders where id=$1',[order.id])).rows[0].state,'expired');
  });
  await t.test('cancellation notices deduplicate buyer and attendee email while preserving language',async()=>{
    const p=await paid([person(),person('bundle','Luca')]);
    await service.query("update public.commerce_orders set locale='de' where id=$1",[p.order.id]);
    for(const [i,pass] of p.passes.entries()) await service.query(`insert into public.commerce_attendee_contacts(order_id,pass_id,participant_index,first_name,last_name,email,phone,document_type,document_country,document_number,privacy_version) values($1,$2,$3,'Ada','Test',$4,'123456789','foreign_id','DE','TESTDOC','test')`,[p.order.id,pass.id,i,i?'other@example.test':'buyer@example.test']);
    const c=await cancel(p.event);
    const notices=(await service.query('select email,locale,refund_expected from public.meraki_cancellation_emails where cancellation_id=$1 order by email',[c.id])).rows;
    assert.deepEqual(notices,[{email:'buyer@example.test',locale:'de',refund_expected:true},{email:'other@example.test',locale:'de',refund_expected:false}]);
  });
  await t.test('legacy partial monetary refunds keep QR; full remainder returns the seat once',async()=>{
    const id=await event(); await db.query('update public.events set commerce_config=null where id=$1',[id]);
    const {reservation}=await call("select public.reserve_event_ticket($1,$2,'buyer@example.test','Ada','Test','it') result",[randomUUID(),id]);
    const session=`cs_${randomUUID()}`,pi=`pi_${session}`;
    await call('select public.fulfill_event_ticket($1,$2,$3,$4,$5,2500) result',[reservation.id,id,session,pi,reservation.buyer_email]);
    const reserveLegacy=amount=>call('select public.reserve_meraki_refund($1,null,$2,$3,$4,$5,$6,null) result',[randomUUID(),reservation.id,amount,'Test',[],actor]);
    await finish(await reserveLegacy(500)); assert.equal(await count(id),1);
    const r=await reserveLegacy(2000); await finish(r,'succeeded','re_legacy'); await finish(r,'succeeded','re_legacy');
    assert.equal(await count(id),0);
    assert.equal((await service.query('select status from public.tickets where stripe_payment_intent=$1',[pi])).rows[0].status,'refunded');
    await call('select public.revoke_event_ticket($1) result',[pi]); assert.equal(await count(id),0);
  });
  await t.test('legacy cancellation blocks manual check-in and late payment receives refund_required',async()=>{
    const id=await event(); await db.query('update public.events set commerce_config=null where id=$1',[id]);
    const {reservation}=await call("select public.reserve_event_ticket($1,$2,'buyer@example.test','Ada','Test','it') result",[randomUUID(),id]);
    const {reservation:late}=await call("select public.reserve_event_ticket($1,$2,'other@example.test','Ada','Test','it') result",[randomUUID(),id]);
    await call('select public.fulfill_event_ticket($1,$2,$3,$4,$5,2500) result',[reservation.id,id,'cs_legacy_cancel','pi_legacy_cancel',reservation.buyer_email]);
    await cancel(id);
    await assert.rejects(service.query("update public.tickets set status='used' where stripe_payment_intent='pi_legacy_cancel'"),/Event canceled/);
    const result=await call('select public.fulfill_event_ticket($1,$2,$3,$4,$5,2500) result',[late.id,id,'cs_legacy_late','pi_legacy_late',late.buyer_email]);
    assert.equal(result.outcome,'refund_required');
    assert.equal((await service.query('select stripe_payment_intent from public.ticket_reservations where id=$1',[late.id])).rows[0].stripe_payment_intent,'pi_legacy_late');
  });
  await t.test('pending legacy full refunds suspend manual check-in until a failed result releases it',async()=>{
    const id=await event(); await db.query('update public.events set commerce_config=null where id=$1',[id]);
    const {reservation}=await call("select public.reserve_event_ticket($1,$2,'buyer@example.test','Ada','Test','it') result",[randomUUID(),id]);
    await call('select public.fulfill_event_ticket($1,$2,$3,$4,$5,2500) result',[reservation.id,id,'cs_legacy_pending','pi_legacy_pending',reservation.buyer_email]);
    const r=await call('select public.reserve_meraki_refund($1,null,$2,2500,$3,$4,$5,null) result',[randomUUID(),reservation.id,'Test',[],actor]);
    await assert.rejects(service.query("update public.tickets set status='used' where stripe_payment_intent='pi_legacy_pending'"),/Refund in progress/);
    await finish(r,'failed',null);
    await service.query("update public.tickets set status='used' where stripe_payment_intent='pi_legacy_pending'");
    await assert.rejects(call('select public.reserve_meraki_refund($1,null,$2,2500,$3,$4,$5,null) result',[randomUUID(),reservation.id,'Test',[],actor]),/Confirm used/);
  });
  await t.test('legacy canceled checkout replay keeps the panel queue authoritative and rejects foreign events and wrong amounts',async()=>{
    const id=await event(),other=await event();
    await db.query('update public.events set commerce_config=null where id=any($1)',[[id,other]]);
    const {reservation}=await call("select public.reserve_event_ticket($1,$2,'buyer@example.test','Ada','Test','it') result",[randomUUID(),id]);
    await call('select public.fulfill_event_ticket($1,$2,$3,$4,$5,2500) result',[reservation.id,id,'cs_replay_legacy','pi_replay_legacy',reservation.buyer_email]);
    await cancel(id);await cancel(other);
    assert.equal((await call('select public.fulfill_event_ticket($1,$2,$3,$4,$5,2500) result',[reservation.id,id,'cs_replay_legacy','pi_replay_legacy',reservation.buyer_email])).outcome,'refund_pending');
    assert.equal((await service.query('select state from public.ticket_reservations where id=$1',[reservation.id])).rows[0].state,'fulfilled');
    await assert.rejects(call('select public.fulfill_event_ticket($1,$2,$3,$4,$5,2400) result',[reservation.id,id,'cs_replay_legacy','pi_replay_legacy',reservation.buyer_email]),/Reservation mismatch/);
    await assert.rejects(call('select public.fulfill_event_ticket($1,$2,$3,$4,$5,2500) result',[reservation.id,other,'cs_replay_legacy','pi_replay_legacy',reservation.buyer_email]),/Reservation mismatch/);
    await assert.rejects(call('select public.fulfill_event_ticket(null,$1,$2,$3,$4,2500) result',[other,'cs_replay_legacy','pi_replay_legacy',reservation.buyer_email]),/Reservation mismatch/);
  });
});
