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
test("commerce integration with an isolated PostgreSQL cluster", {
  skip: supported ? false : "Set MERAKI_PG_BIN to the directory containing initdb and pg_ctl",
  timeout: 90_000,
}, async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "meraki-commerce-pg-"));
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
  const config = (capacity=1) => ({version:1,enabled:true,waitlistEnabled:true,upgradesEnabled:true,activities:[
    {id:'ws',name:'Workshop',kind:'workshop',capacity,startsAt:null,salesEnd:null,menuOptions:[]},
    {id:'mc',name:'Masterclass',kind:'masterclass',capacity,startsAt:null,salesEnd:null,menuOptions:[]},
    {id:'dinner',name:'Cena',kind:'dinner',capacity,startsAt:null,salesEnd:null,menuOptions:['Classico','Vegetariano']},
  ], packages:[
    {id:'ws',name:'Solo WS',description:'',activityIds:['ws'],prices:[{id:'early',label:'Early Bird',amountCents:2500,startsAt:null,endsAt:null}]},
    {id:'mc',name:'Solo MC',description:'',activityIds:['mc'],prices:[{id:'std',label:'Standard',amountCents:3500,startsAt:null,endsAt:null}]},
    {id:'bundle',name:'WS + MC',description:'',activityIds:['ws','mc'],prices:[{id:'std',label:'Standard',amountCents:5000,startsAt:null,endsAt:null}]},
  ],addons:[{id:'cena',name:'Cena',activityId:'dinner',amountCents:2500}]});
  const person=(packageId='ws', addonIds=[],menuChoices={}, firstName='Ada')=>({firstName,lastName:'Rossi',packageId,addonIds,menuChoices});
  const json=JSON.stringify;
  async function event(activityCapacity=1, totalCapacity=20) {
    const id=randomUUID();
    await db.query(`insert into public.events(id,slug,titolo,data_inizio,prezzo_cents,capacity,commerce_config) values($1,$2,'{"it":"Evento test"}',now()+interval '2 days',2500,$3,$4)`,[id,`commerce-${id}`,totalCapacity,json(config(activityCapacity))]);
    return id;
  }
  async function quote(id,people=[person()],pass=null,client=service) {
    return (await client.query('select public.quote_event_commerce($1,$2,$3,$4) result',[id,json(people),pass?.id??null,pass?.qr_code??null])).rows[0].result;
  }
  async function reserve(id,people=[person()],request=randomUUID(),pass=null,client=service,email='buyer@example.test') {
    return (await client.query("select public.reserve_event_commerce($1,$2,$3,'it',$4,$5,$6) result",[id,request,email,json(people),pass?.id??null,pass?.qr_code??null])).rows[0].result;
  }
  async function fulfill(order,session=`cs_${randomUUID()}`,amount=order.amount_cents,client=service) {
    return (await client.query('select public.fulfill_event_commerce($1,$2,$3,$4,$5) result',[order.id,session,`pi_${session}`,amount,order.buyer_email])).rows[0].result;
  }
  async function refund(order) {
    await service.query('select public.revoke_commerce_payment($1,$2,$3)',[order.stripe_payment_intent??`pi_cs_${order.id}`,`re_${randomUUID()}`,'succeeded']);
  }
  async function check(pass,eventId,activity,client=service) {
    return (await client.query('select public.check_in_commerce_pass($1,$2,$3) result',[pass.qr_code,eventId,activity])).rows[0].result;
  }
  async function race(id,operation) {
    const app=`commerce-race-${randomUUID()}`;
    const blocker=await connect();
    const [first,second]=await Promise.all([connect('service_role',app),connect('service_role',app)]);
    await blocker.query('begin');await blocker.query('select id from public.events where id=$1 for update',[id]);
    const promises=[operation(first,0),operation(second,1)];promises.forEach(p=>p.catch(()=>{}));
    try {
      const deadline=Date.now()+5000;let blocked=0;
      while(blocked<2 && Date.now()<deadline) {
        blocked=(await db.query("select count(*)::int count from pg_stat_activity where application_name=$1 and wait_event_type='Lock'",[app])).rows[0].count;
        if(blocked<2) await new Promise(resolve=>setTimeout(resolve,10));
      }
      assert.equal(blocked,2,'both independent database transactions must actually overlap on the event lock');
    } finally {await blocker.query('rollback');}
    return Promise.all(promises);
  }
  await t.test('all commerce tables and RPCs are private to service role',async()=>{
    const anon=await connect('anon');const authenticated=await connect('authenticated');
    for (const client of [anon,authenticated]) {
      for(const table of ['commerce_orders','commerce_passes','commerce_entitlements','commerce_waitlist','commerce_payment_refunds']) await assert.rejects(client.query(`select * from public.${table}`),/permission denied/);
      await assert.rejects(client.query('select public.commerce_availability($1)',[randomUUID()]),/permission denied/);
      await assert.rejects(client.query('select public.quote_event_commerce($1,$2)',[randomUUID(),'[]']),/permission denied/);
    }
  });
  await t.test('bundles and solo purchases share activity seats with real concurrent transactions',async()=>{
    const id=await event();
    const results=await race(id,(client,i)=>reserve(id,[person(i?'bundle':'ws')],randomUUID(),null,client));
    assert.equal(results.filter(r=>r.order).length,1);assert.equal(results.filter(r=>r.error==='sold_out').length,1);
    const available=(await service.query('select public.commerce_availability($1) result',[id])).rows[0].result;
    assert.equal(available.ws,0);
  });
  await t.test('multi-person orders reserve each activity and overall event capacity',async()=>{
    let id=await event(5,1);
    assert.equal((await reserve(id,[person(),person('ws',[],{},'Luca')])).error,'sold_out');
    id=await event(2,5);
    const {order}=await reserve(id,[person(),person('bundle',[],{},'Luca')]);
    assert.equal(order.amount_cents,7500);assert.equal(order.demand.ws,2);assert.equal(order.demand.mc,1);
    assert.equal((await reserve(id)).error,'sold_out');
    const result=await fulfill(order);assert.equal(result.passes.length,2);assert.notEqual(result.passes[0].qr_code,result.passes[1].qr_code);
  });
  await t.test('quotes ignore client money, validate menus, deadlines, duplicate add-ons and dates',async()=>{
    const id=await event(10);
    assert.equal((await quote(id,[person('ws',['cena'])])).error,'invalid_menu');
    assert.equal((await quote(id,[person('ws',['cena','cena'],{dinner:'Classico'})])).error,'invalid_addon');
    assert.equal((await quote(id,[person('ws',['cena'],{dinner:'Vegan'})])).error,'invalid_menu');
    const q=await quote(id,[{...person('ws',['cena'],{dinner:'Vegetariano'}),totalCents:1}]);assert.equal(q.quote.totalCents,5000);
    const c=config(10);c.activities[2].salesEnd=new Date(Date.now()-1000).toISOString();
    assert.equal((await service.query('select public.save_commerce_config($1,$2) result',[id,json(c)])).rows[0].result.saved,true);
    assert.equal((await quote(id,[person('ws',['cena'],{dinner:'Classico'})])).error,'sales_closed');
  });
  await t.test('tier boundaries and frozen price survive retries and subsequent price edits',async()=>{
    const id=await event(10);const c=config(10);
    const boundary=new Date(Date.now()-60_000).toISOString();
    c.packages[0].prices=[{id:'early',label:'Early',amountCents:2000,startsAt:null,endsAt:boundary},{id:'regular',label:'Regular',amountCents:3000,startsAt:boundary,endsAt:null}];
    await service.query('select public.save_commerce_config($1,$2)',[id,json(c)]);
    assert.equal((await quote(id)).quote.totalCents,3000);
    const request=randomUUID();const first=await reserve(id,[person()],request);
    c.packages[0].prices[1].amountCents=4500;await service.query('select public.save_commerce_config($1,$2)',[id,json(c)]);
    const retry=await reserve(id,[person()],request);assert.equal(first.order.id,retry.order.id);assert.equal(retry.order.amount_cents,3000);
    assert.equal((await reserve(id,[person('mc')],request)).error,'invalid_request');
    const done=await fulfill(first.order);assert.equal(done.outcome,'fulfilled');assert.equal(done.passes[0].package_paid_cents,3000);
  });
  await t.test('idempotent paid webhook generates one pass; scan consumes only its selected admission',async()=>{
    const id=await event();const {order}=await reserve(id,[person('bundle',['cena'],{dinner:'Classico'})]);
    const session=`cs_${randomUUID()}`;const results=await race(id,client=>fulfill(order,session,7500,client));
    assert.deepEqual(results.map(r=>r.outcome),['fulfilled','fulfilled']);assert.equal(results[0].passes[0].id,results[1].passes[0].id);
    const pass=results[0].passes[0];const checks=await race(id,client=>check(pass,id,'ws',client));
    assert.deepEqual(checks.map(r=>r.outcome).sort(),['already_used','success']);
    assert.equal((await check(pass,id,'mc')).outcome,'success');assert.equal((await check(pass,id,'dinner')).outcome,'success');
    assert.equal((await check(pass,id,'missing')).outcome,'invalid_activity');
  });
  await t.test('late paid checkout reacquires seats or requires a refund without a pass',async()=>{
    const id=await event();const first=await reserve(id);
    await db.query("update public.commerce_orders set expires_at=now()-interval '1 minute' where id=$1",[first.order.id]);
    assert.ok((await reserve(id)).order);
    const result=await fulfill(first.order);assert.equal(result.outcome,'refund_required');assert.equal(result.passes.length,0);
    const id2=await event();const second=await reserve(id2);
    await db.query("update public.commerce_orders set expires_at=now()-interval '1 minute' where id=$1",[second.order.id]);
    assert.equal((await fulfill(second.order)).outcome,'fulfilled');
  });
  await t.test('upgrade charges the package difference, preserves its QR and only reserves missing admissions',async()=>{
    const id=await event();const {order}=await reserve(id);
    const paid=await fulfill(order);const pass=paid.passes[0];
    const q=await quote(id,[person('bundle',['cena'],{dinner:'Vegetariano'})],pass);
    assert.equal(q.quote.totalCents,5000);assert.equal(q.demand._passes,0);assert.equal(q.demand.ws,undefined);assert.equal(q.demand.mc,1);
    assert.equal((await quote(id,[person('mc')],pass)).error,'invalid_upgrade');
    const upgrade=await reserve(id,[person('bundle',['cena'],{dinner:'Vegetariano'})],randomUUID(),pass);
    assert.ok(upgrade.order);assert.equal((await reserve(id,[person('bundle')],randomUUID(),pass)).error,'upgrade_pending');
    const upgraded=await fulfill(upgrade.order);assert.equal(upgraded.passes[0].id,pass.id);assert.equal(upgraded.passes[0].qr_code,pass.qr_code);assert.equal(upgraded.passes[0].package_paid_cents,5000);
    const counter=(await db.query('select posti_venduti from public.events where id=$1',[id])).rows[0];assert.equal(counter.posti_venduti,1);
    const stored=(await db.query('select * from public.commerce_orders where id=$1',[upgrade.order.id])).rows[0];await refund(stored);
    assert.equal((await check(pass,id,'ws')).outcome,'success');assert.equal((await check(pass,id,'mc')).outcome,'invalid_activity');assert.equal((await check(pass,id,'dinner')).outcome,'invalid_activity');
    assert.equal((await db.query('select status,package_id from public.commerce_passes where id=$1',[pass.id])).rows[0].status,'paid');
  });
  await t.test('refund tombstone wins before payment fulfillment and terminal refunds cannot be resurrected',async()=>{
    const id=await event();const {order}=await reserve(id);const session=`cs_${randomUUID()}`;
    await service.query('select public.revoke_commerce_payment($1)',[`pi_${session}`]);
    assert.equal((await fulfill(order,session)).outcome,'refunded');
    assert.equal((await db.query('select count(*)::int count from public.commerce_passes where order_id=$1',[order.id])).rows[0].count,0);
    const next=await reserve(id);const s2=`cs_${randomUUID()}`;const pass=(await fulfill(next.order,s2)).passes[0];
    await service.query('select public.revoke_commerce_payment($1)',[`pi_${s2}`]);
    assert.equal((await fulfill(next.order,s2)).outcome,'refunded');assert.equal((await check(pass,id,'ws')).outcome,'refunded');
    assert.ok((await reserve(id)).order);
  });
  await t.test('admin cannot remove occupied activities or lower capacity under issued seats',async()=>{
    const id=await event();const {order}=await reserve(id);await fulfill(order);
    let c=config();c.activities=c.activities.filter(a=>a.id!=='ws');c.packages=c.packages.filter(p=>p.id==='mc');
    assert.equal((await service.query('select public.save_commerce_config($1,$2) result',[id,json(c)])).rows[0].result.error,'issued_activity_removed');
    c=config();c.activities[0].capacity=0;
    assert.equal((await service.query('select public.save_commerce_config($1,$2) result',[id,json(c)])).rows[0].result.error,'capacity_below_occupancy');
  });
  await t.test('email lease excludes duplicate sends and permits explicit retry after failure',async()=>{
    const id=await event();const {order}=await reserve(id);await fulfill(order);
    const claim=async()=> (await service.query('select public.claim_commerce_email($1) result',[order.id])).rows[0].result;
    assert.equal(await claim(),true);assert.equal(await claim(),false);
    await service.query('select public.complete_commerce_email($1,false)',[order.id]);assert.equal(await claim(),true);
    await service.query('select public.complete_commerce_email($1,true)',[order.id]);assert.equal(await claim(),false);
  });
  await t.test('add-on-only upgrades preserve the paid package price after its tier and workshop have ended',async()=>{
    const id=await event(5);const {order}=await reserve(id);const pass=(await fulfill(order)).passes[0];
    const c=config(5);c.packages[0].prices[0].amountCents=9000;c.packages[0].prices[0].endsAt=new Date(Date.now()-1000).toISOString();
    c.activities[0].startsAt=new Date(Date.now()-1000).toISOString();c.activities[2].startsAt=new Date(Date.now()+86400000).toISOString();
    await db.query("update public.events set data_inizio=now()-interval '1 hour' where id=$1",[id]);
    assert.equal((await service.query('select public.save_commerce_config($1,$2) result',[id,json(c)])).rows[0].result.saved,true);
    const q=await quote(id,[person('ws',['cena'],{dinner:'Classico'})],pass);assert.equal(q.quote.totalCents,2500);
    const upgrade=await reserve(id,[person('ws',['cena'],{dinner:'Classico'})],randomUUID(),pass);assert.ok(upgrade.order);
    const result=await fulfill(upgrade.order);assert.equal(result.passes[0].package_paid_cents,2500);assert.equal((await check(pass,id,'dinner')).outcome,'success');
    assert.equal((await quote(id,[person()],pass)).error,'invalid_upgrade');
  });
  await t.test('free substantive upgrades need the attached Stripe session and cannot replay a foreign email',async()=>{
    const id=await event(3);const {order}=await reserve(id);const pass=(await fulfill(order)).passes[0];
    const c=config(3);c.packages[2].prices[0].amountCents=2000;await service.query('select public.save_commerce_config($1,$2)',[id,json(c)]);
    const bad=await reserve(id,[person('bundle')],randomUUID(),pass,service,'someone@example.test');assert.equal(bad.error,'email_mismatch');
    const upgrade=await reserve(id,[person('bundle')],randomUUID(),pass);assert.equal(upgrade.order.amount_cents,0);
    const session=`cs_free_${randomUUID()}`;
    await assert.rejects(service.query('select public.fulfill_event_commerce($1,$2,null,0,$3)',[upgrade.order.id,session,order.buyer_email]),/Payment identity required/);
    await service.query("select public.transition_commerce_order($1,$2,'awaiting_payment')",[upgrade.order.id,session]);
    const result=(await service.query('select public.fulfill_event_commerce($1,$2,null,0,$3) result',[upgrade.order.id,session,order.buyer_email])).rows[0].result;
    assert.equal(result.outcome,'fulfilled');assert.equal(result.passes[0].id,pass.id);assert.equal(result.passes[0].package_paid_cents,2500);
    assert.equal((await check(pass,id,'mc')).outcome,'success');
  });
  await t.test('expired orders with removed activities refund safely; their frozen selections never mutate',async()=>{
    const id=await event();const {order}=await reserve(id,[person('ws',['cena'],{dinner:'Classico'})]);
    await db.query("update public.commerce_orders set expires_at=now()-interval '1 minute' where id=$1",[order.id]);
    const c=config();c.addons=[];c.activities=c.activities.filter(a=>a.id!=='dinner');
    assert.equal((await service.query('select public.save_commerce_config($1,$2) result',[id,json(c)])).rows[0].result.saved,true);
    assert.equal((await fulfill(order)).outcome,'refund_required');
  });
  await t.test('invalid SQL configuration is rejected and pending/failed refund notifications do not issue duplicate passes',async()=>{
    const id=await event();let c=config();delete c.enabled;
    assert.equal((await service.query('select public.save_commerce_config($1,$2) result',[id,json(c)])).rows[0].result.error,'invalid_config');
    c=config();c.packages[0].prices.push({...c.packages[0].prices[0],id:'overlap'});
    assert.equal((await service.query('select public.save_commerce_config($1,$2) result',[id,json(c)])).rows[0].result.error,'invalid_config');
    const {order}=await reserve(id);const session=`cs_${randomUUID()}`;
    await service.query("select public.revoke_commerce_payment($1,'re_pending','pending')",[`pi_${session}`]);
    assert.equal((await fulfill(order,session)).outcome,'refund_pending');
    await service.query("select public.revoke_commerce_payment($1,'re_pending','failed')",[`pi_${session}`]);
    assert.equal((await fulfill(order,session)).outcome,'fulfilled');
    assert.equal((await db.query('select count(*)::int count from public.commerce_passes where order_id=$1',[order.id])).rows[0].count,1);
  });

  await t.test('legacy checkout cannot bypass configured formulas and late legacy payments respect commerce holds',async()=>{
    const id=await event(5,1);
    assert.equal((await service.query("select public.reserve_event_ticket($1,$2,'buyer@example.test','Ada','Rossi','it') result",[randomUUID(),id])).rows[0].result.error,'advanced_checkout_required');
    await db.query('update public.events set commerce_config=null where id=$1',[id]);
    const legacy=(await service.query("select public.reserve_event_ticket($1,$2,'buyer@example.test','Ada','Rossi','it') result",[randomUUID(),id])).rows[0].result.reservation;
    assert.ok(legacy);
    assert.equal((await service.query('select public.save_commerce_config($1,$2) result',[id,json(config(5))])).rows[0].result.error,'legacy_checkouts_pending');
    await db.query("update public.ticket_reservations set expires_at=now()-interval '1 minute' where id=$1",[legacy.id]);
    assert.equal((await service.query('select public.save_commerce_config($1,$2) result',[id,json(config(5))])).rows[0].result.saved,true);
    assert.ok((await reserve(id)).order);
    const result=(await service.query("select public.fulfill_event_ticket($1,$2,'cs_legacy_late','pi_legacy_late','buyer@example.test',2500) result",[legacy.id,id])).rows[0].result;
    assert.equal(result.outcome,'refund_required');
  });
  await t.test('same request ID cannot silently cross events or changed buyer identities',async()=>{
    const one=await event(10);const two=await event(10);const request=randomUUID();
    assert.ok((await reserve(one,[person()],request)).order);
    assert.equal((await reserve(two,[person()],request)).error,'invalid_request');
    assert.equal((await reserve(one,[person()],request,null,service,'other@example.test')).error,'invalid_request');
  });

  await t.test('refunding an ancestor upgrade never reissues its revoked access through later package or add-on changes',async()=>{
    const id=await event(5);const c=config(5);
    c.activities.push({id:'extra',name:'Extra',kind:'extra',capacity:5,startsAt:null,salesEnd:null,menuOptions:[]});
    c.addons.push({id:'extra',name:'Extra',activityId:'extra',amountCents:500});
    c.packages.push({id:'full',name:'WS + MC + Cena',description:'',activityIds:['ws','mc','dinner'],prices:[{id:'std',label:'Standard',amountCents:7500,startsAt:null,endsAt:null}]});
    await service.query('select public.save_commerce_config($1,$2)',[id,json(c)]);
    const base=await reserve(id);const pass=(await fulfill(base.order)).passes[0];
    const b=await reserve(id,[person('bundle')],randomUUID(),pass);await fulfill(b.order);
    const current=(await db.query('select * from public.commerce_passes where id=$1',[pass.id])).rows[0];
    const cOrder=await reserve(id,[person('full',[],{dinner:'Classico'})],randomUUID(),current);await fulfill(cOrder.order);
    const bStored=(await db.query('select * from public.commerce_orders where id=$1',[b.order.id])).rows[0];await refund(bStored);
    const afterB=(await db.query('select * from public.commerce_passes where id=$1',[pass.id])).rows[0];
    assert.equal((await quote(id,[person('full',['extra'])],afterB)).error,'invalid_upgrade');
    assert.equal((await check(pass,id,'mc')).outcome,'invalid_activity');assert.equal((await check(pass,id,'ws')).outcome,'success');
    const cStored=(await db.query('select * from public.commerce_orders where id=$1',[cOrder.order.id])).rows[0];await refund(cStored);
    const afterC=(await db.query('select * from public.commerce_passes where id=$1',[pass.id])).rows[0];
    assert.equal((await quote(id,[person('bundle',['extra'])],afterC)).error,'invalid_upgrade');
    assert.equal((await check(pass,id,'mc')).outcome,'invalid_activity');assert.equal((await check(pass,id,'dinner')).outcome,'invalid_activity');
    assert.equal(afterC.status,'paid');
  });

  await t.test('refunding the original order preserves separately paid dinner until its own refund',async()=>{
    const id=await event();const base=await reserve(id);const pass=(await fulfill(base.order)).passes[0];
    const dinner=await reserve(id,[person('ws',['cena'],{dinner:'Classico'})],randomUUID(),pass);await fulfill(dinner.order);
    const baseStored=(await db.query('select * from public.commerce_orders where id=$1',[base.order.id])).rows[0];await refund(baseStored);
    assert.equal((await check(pass,id,'ws')).outcome,'invalid_activity');assert.equal((await check(pass,id,'dinner')).outcome,'success');
    let row=(await db.query('select * from public.commerce_passes where id=$1',[pass.id])).rows[0];assert.equal(row.status,'paid');assert.equal(row.package_paid_cents,0);
    assert.equal((await db.query('select posti_venduti from public.events where id=$1',[id])).rows[0].posti_venduti,1);
    const dinnerStored=(await db.query('select * from public.commerce_orders where id=$1',[dinner.order.id])).rows[0];await refund(dinnerStored);
    row=(await db.query('select * from public.commerce_passes where id=$1',[pass.id])).rows[0];assert.equal(row.status,'refunded');
    assert.equal((await db.query('select posti_venduti from public.events where id=$1',[id])).rows[0].posti_venduti,0);
    assert.ok((await reserve(id)).order);
  });
  await t.test('sold package identity stays available while upgrades are enabled',async()=>{
    const id=await event();const {order}=await reserve(id);await fulfill(order);
    const c=config();c.packages=c.packages.filter(p=>p.id!=='ws');
    assert.equal((await service.query('select public.save_commerce_config($1,$2) result',[id,json(c)])).rows[0].result.error,'issued_package_removed');
    c.upgradesEnabled=false;assert.equal((await service.query('select public.save_commerce_config($1,$2) result',[id,json(c)])).rows[0].result.saved,true);
  });

  await t.test('sold package composition is stable while labels, prices and activity order remain editable',async()=>{
    const id=await event(5);const {order}=await reserve(id,[person('bundle')]);await fulfill(order);
    let c=config(5);c.packages[2].activityIds=['ws'];
    assert.equal((await service.query('select public.save_commerce_config($1,$2) result',[id,json(c)])).rows[0].result.error,'issued_package_changed');
    c=config(5);c.packages[2].activityIds=['mc','ws'];c.packages[2].name='Nuovo nome';c.packages[2].prices[0].amountCents=6500;
    assert.equal((await service.query('select public.save_commerce_config($1,$2) result',[id,json(c)])).rows[0].result.saved,true);
    c.packages[2].activityIds=['ws'];c.upgradesEnabled=false;
    assert.equal((await service.query('select public.save_commerce_config($1,$2) result',[id,json(c)])).rows[0].result.saved,true);
  });
  await t.test('event capacity edits count passes and active holds once and serialize with reservations',async()=>{
    const id=await event(5,10);const first=await reserve(id);await fulfill(first.order);
    const second=await reserve(id);assert.ok(second.order);
    await assert.rejects(db.query('update public.events set capacity=1 where id=$1',[id]),/capacity_below_occupancy/);
    await db.query('update public.events set capacity=2 where id=$1',[id]);
    assert.equal((await db.query('select capacity from public.events where id=$1',[id])).rows[0].capacity,2);
    await db.query("update public.commerce_orders set expires_at=now()-interval '1 minute' where id=$1",[second.order.id]);
    await db.query('update public.events set capacity=1 where id=$1',[id]);
    await assert.rejects(db.query('update public.events set capacity=0 where id=$1',[id]),/capacity_below_occupancy/);
    await db.query('update public.events set capacity=null where id=$1',[id]);
    assert.equal((await db.query('select capacity from public.events where id=$1',[id])).rows[0].capacity,null);
    const legacy=await event(5,10);await db.query('update public.events set commerce_config=null where id=$1',[legacy]);
    assert.ok((await service.query("select public.reserve_event_ticket($1,$2,'buyer@example.test','Ada','Rossi','it') result",[randomUUID(),legacy])).rows[0].result.reservation);
    await assert.rejects(db.query('update public.events set capacity=0 where id=$1',[legacy]),/capacity_below_occupancy/);
  });

  const attendee = (email = `guest-${randomUUID()}@example.test`, consent = false) => ({
    firstName:'Ada',lastName:'Rossi',email,phone:'+393331234567',documentType:'codice_fiscale',documentCountry:'IT',documentNumber:'RSSMRA80A01H501U',marketingConsent:consent,
  });
  async function reserveGuests(id, contacts, request = randomUUID(), locale = 'it', pass = null) {
    const people = contacts.map(a => person('ws',[],{},a.firstName));
    return (await service.query('select public.reserve_event_commerce_attendees($1,$2,$3,$4,$5,$6,$7,$8,$9) result', [id,request,contacts[0].email,locale,json(people),pass?.id??null,pass?.qr_code??null,json(contacts),'2026-10-18-v1'])).rows[0].result;
  }
  await t.test('the optional-document migration is repeatable and keeps contact validation private', async () => {
    const migration = await readFile(path.join(migrationsDirectory,'20261026100000_optional_attendee_documents.sql'),'utf8');
    await db.query(migration);await db.query(migration);
    const contact={...attendee(),documentCountry:'',documentNumber:''};
    assert.equal((await service.query('select public.commerce_attendee_valid($1) valid',[json(contact)])).rows[0].valid,true);
    assert.equal((await service.query('select public.commerce_attendee_valid($1) valid',[json(attendee())])).rows[0].valid,true);
    for(const role of ['anon','authenticated']) {
      const client=await connect(role);
      await assert.rejects(client.query('select public.commerce_attendee_valid($1)',[json(contact)]),/permission denied/);
    }
  });
  await t.test('mixed guests with and without documents reserve and fulfill without exposing private contacts', async () => {
    const id=await event(5),request=randomUUID();
    const contacts=[
      {...attendee(),documentCountry:'',documentNumber:''},
      {...attendee(undefined,true),documentType:'foreign_id',documentCountry:'',documentNumber:''},
      attendee(),
      {...attendee(),documentType:'foreign_id',documentCountry:'ES',documentNumber:'DNI12345678Z'},
    ];
    const {order}=await reserveGuests(id,contacts,request);assert.ok(order);
    assert.equal((await reserveGuests(id,contacts,request)).order.id,order.id);
    const session=`cs_nodocument_${randomUUID()}`;
    const result=await fulfill(order,session);assert.equal(result.outcome,'fulfilled');assert.equal(result.passes.length,4);
    const retry=await fulfill(order,session);assert.deepEqual(retry.passes.map(p=>p.id),result.passes.map(p=>p.id));
    const saved=(await service.query('select participant_index,document_type,document_country,document_number,email from public.commerce_attendee_contacts where order_id=$1 order by participant_index',[order.id])).rows;
    assert.equal(saved.length,4);
    assert.deepEqual(saved.map(c=>[c.document_type,c.document_country,c.document_number]),contacts.map(c=>[c.documentType,c.documentCountry,c.documentNumber]));
    assert.deepEqual(saved.map(c=>c.email),contacts.map(c=>c.email));
    for(const pass of result.passes) {
      assert.ok(pass.qr_code);
      for(const field of ['document_number','documentNumber','document_country','email','phone']) assert.equal(pass[field],undefined);
    }
    assert.equal((await service.query('select count(*)::int count from public.marketing_contacts where email=$1',[contacts[0].email])).rows[0].count,0);
    assert.equal((await service.query('select status from public.marketing_contacts where email=$1',[contacts[1].email])).rows[0].status,'pending');
  });
  await t.test('single guest tickets without either document type persist empty values in private contacts', async () => {
    const id=await event(5);await db.query('update public.events set commerce_config=null where id=$1',[id]);
    for(const documentType of ['codice_fiscale','foreign_id']) {
      const contact={...attendee(),documentType,documentCountry:'',documentNumber:''},request=randomUUID();
      const args=[request,id,contact.email,contact.firstName,contact.lastName,'en',json(contact),'2026-10-18-v1'];
      const held=(await service.query('select public.reserve_event_ticket_attendee($1,$2,$3,$4,$5,$6,$7,$8) result',args)).rows[0].result;
      assert.ok(held.reservation);assert.deepEqual(held.reservation.attendee,contact);
      const session=`cs_legacy_nodocument_${randomUUID()}`;
      const result=(await service.query('select public.fulfill_event_ticket($1,$2,$3,$4,$5,$6) result',[request,id,session,`pi_${session}`,contact.email,held.reservation.amount_cents])).rows[0].result;
      assert.equal(result.outcome,'fulfilled');assert.ok(result.ticket.qr_code);
      const saved=(await service.query('select document_type,document_country,document_number,email from public.legacy_ticket_attendee_contacts where ticket_id=$1',[result.ticket.id])).rows[0];
      assert.deepEqual(saved,{document_type:documentType,document_country:'',document_number:'',email:contact.email});
      for(const field of ['document_number','documentNumber','document_country','phone']) assert.equal(result.ticket[field],undefined);
    }
  });
  await t.test('private guest data is immutable by request, supports Spanish and maps identical names by participant index', async () => {
    const id = await event(5); const contacts = [attendee(),attendee()]; const request = randomUUID();
    const {order} = await reserveGuests(id,contacts,request,'es'); assert.ok(order); assert.equal(order.locale,'es');
    assert.equal(order.quote.participants[0].documentNumber,undefined);
    assert.equal((await reserveGuests(id,[{...contacts[0],phone:'+491701234567'},contacts[1]],request,'es')).error,'invalid_request');
    assert.equal((await reserveGuests(id,contacts,request,'es')).order.id,order.id);
    const {passes} = await fulfill(order); assert.deepEqual(passes.map(p=>p.participant_index),[0,1]);
    const saved = (await service.query('select participant_index,email,document_number,pass_id from public.commerce_attendee_contacts where order_id=$1 order by participant_index',[order.id])).rows;
    assert.deepEqual(saved.map(c=>c.email),contacts.map(c=>c.email));
    assert.deepEqual(saved.map(c=>c.pass_id),passes.map(p=>p.id));
    for(const p of passes) { assert.equal(p.document_number,undefined);assert.equal(p.email,undefined);assert.equal(p.phone,undefined); }
    for(const role of ['anon','authenticated']) {
      const client = await connect(role);
      for(const table of ['commerce_attendee_contacts','legacy_ticket_attendee_contacts','marketing_contacts','marketing_consent_events','marketing_consent_tokens']) await assert.rejects(client.query(`select * from public.${table}`),/permission denied/);
      await assert.rejects(client.query('select public.confirm_marketing_consent($1)',['a'.repeat(64)]),/permission denied/);
    }
  });
  await t.test('marketing begins pending only after payment; explicit confirmation and revocation are audited and idempotent', async () => {
    const id = await event(5); const contact = attendee(undefined,true); const {order} = await reserveGuests(id,[contact]);
    assert.equal((await service.query('select count(*)::int count from public.marketing_contacts where email=$1',[contact.email])).rows[0].count,0);
    await fulfill(order);
    let row = (await service.query('select * from public.marketing_contacts where email=$1',[contact.email])).rows[0];assert.equal(row.status,'pending');
    const confirmation='a'.repeat(64),unsubscribe='b'.repeat(64);
    const rpc = async(name,token)=>(await service.query(`select public.${name}($1) result`,[token])).rows[0].result;
    assert.equal((await service.query('select public.prepare_marketing_consent($1,0,$2,$3) result',[order.id,confirmation,unsubscribe])).rows[0].result.status,'pending');
    assert.deepEqual(await rpc('lookup_marketing_preference',confirmation),{status:'pending',locale:'it',can_confirm:true,can_unsubscribe:false});
    assert.equal((await service.query('select status from public.marketing_contacts where id=$1',[row.id])).rows[0].status,'pending');
    assert.equal((await rpc('confirm_marketing_consent',confirmation)).status,'subscribed');
    assert.equal((await rpc('confirm_marketing_consent',confirmation)).status,'subscribed');
    assert.equal((await rpc('unsubscribe_marketing_consent',unsubscribe)).status,'unsubscribed');
    assert.equal((await rpc('unsubscribe_marketing_consent',unsubscribe)).status,'unsubscribed');
    assert.equal((await rpc('confirm_marketing_consent',confirmation)).status,'unsubscribed');
    const events = (await service.query('select action from public.marketing_consent_events where contact_id=$1 order by created_at,id',[row.id])).rows;
    assert.equal(events.filter(e=>e.action==='requested').length,1);assert.equal(events.filter(e=>e.action==='confirmed').length,1);assert.equal(events.filter(e=>e.action==='unsubscribed').length,1);
    assert.equal((await rpc('confirm_marketing_consent','c'.repeat(64))).error,'invalid_token');
    assert.equal((await service.query('select count(*)::int count from public.marketing_consent_tokens where token_hash=$1 or token_hash=$2',[confirmation,unsubscribe])).rows[0].count,0);
    await assert.rejects(service.query('delete from public.marketing_consent_events where contact_id=$1',[row.id]),/permission denied/);
  });
  await t.test('a later consent requires fresh mailbox confirmation and old consent links cannot resubscribe', async () => {
    const id = await event(5); const contact = attendee(undefined,true); const first=(await reserveGuests(id,[contact])).order;await fulfill(first);
    const token='d'.repeat(64),stop='e'.repeat(64);
    await service.query('select public.prepare_marketing_consent($1,0,$2,$3)',[first.id,token,stop]);
    await service.query('select public.unsubscribe_marketing_consent($1)',[stop]);
    const second=(await reserveGuests(id,[contact])).order;await fulfill(second);
    assert.equal((await service.query('select public.confirm_marketing_consent($1) result',[token])).rows[0].result.error,'invalid_token');
    assert.equal((await service.query('select status from public.marketing_contacts where email=$1',[contact.email])).rows[0].status,'pending');
    const newToken='f'.repeat(64);await service.query('select public.prepare_marketing_consent($1,0,$2,$3)',[second.id,newToken,'1'.repeat(64)]);
    assert.equal((await service.query('select public.confirm_marketing_consent($1) result',[newToken])).rows[0].result.status,'subscribed');
    assert.equal((await service.query('select public.unsubscribe_marketing_consent($1) result',[stop])).rows[0].result.status,'unsubscribed');
  });
  await t.test('single guest tickets store private contacts and request optional marketing without registration', async () => {
    const id=await event(5);await db.query('update public.events set commerce_config=null where id=$1',[id]);
    const contact=attendee(undefined,true),request=randomUUID();
    const args=[request,id,contact.email,contact.firstName,contact.lastName,'es',json(contact),'2026-10-18-v1'];
    const held=(await service.query('select public.reserve_event_ticket_attendee($1,$2,$3,$4,$5,$6,$7,$8) result',args)).rows[0].result;
    assert.equal(held.reservation.locale,'es');
    const changed=[...args];changed[6]=json({...contact,marketingConsent:false});
    assert.equal((await service.query('select public.reserve_event_ticket_attendee($1,$2,$3,$4,$5,$6,$7,$8) result',changed)).rows[0].result.error,'invalid_request');
    const session=`cs_legacy_${randomUUID()}`;
    const result=(await service.query('select public.fulfill_event_ticket($1,$2,$3,$4,$5,$6) result',[request,id,session,`pi_${session}`,contact.email,held.reservation.amount_cents])).rows[0].result;
    assert.equal(result.outcome,'fulfilled');assert.equal(result.ticket.documentNumber,undefined);
    const saved=(await service.query('select * from public.legacy_ticket_attendee_contacts where ticket_id=$1',[result.ticket.id])).rows[0];assert.equal(saved.email,contact.email);
    assert.equal((await service.query('select status from public.marketing_contacts where email=$1',[contact.email])).rows[0].status,'pending');
    assert.equal((await service.query('select public.prepare_legacy_marketing_consent($1,$2,$3) result',[request,'2'.repeat(64),'3'.repeat(64)])).rows[0].result.status,'pending');
  });
  await t.test('SQL contact validation rejects malformed personal data before reserving any seats', async () => {
    const id=await event(5),contact=attendee();
    for(const invalid of [
      {...contact,documentNumber:'RSSMRA80A01H501A'},
      {...contact,documentType:'foreign_id',documentCountry:'ES',documentNumber:'??'},
      {...contact,documentType:'foreign_id',documentCountry:'IT',documentNumber:'DNI12345678Z'},
      {...contact,documentType:'foreign_id',documentCountry:'',documentNumber:'DNI12345678Z'},
      {...contact,documentCountry:'ZZ'},
      {...contact,documentCountry:'',documentNumber:'RSSMRA80A01H501U'},
      {...contact,documentCountry:'IT',documentNumber:''},
      {...contact,documentCountry:'',documentNumber:' '},
      {...contact,documentType:'passport',documentCountry:'',documentNumber:''},
      {...contact,documentType:null,documentCountry:'',documentNumber:''},
      {...contact,firstName:'',documentCountry:'',documentNumber:''},
      {...contact,lastName:'',documentCountry:'',documentNumber:''},
      {...contact,phone:'3331234567',documentCountry:'',documentNumber:''},
      {...contact,email:'not-an-email',documentCountry:'',documentNumber:''},
      {...contact,marketingConsent:'true',documentCountry:'',documentNumber:''},
    ]) {
      assert.equal((await reserveGuests(id,[invalid])).error,'invalid_attendees');
    }
    assert.equal((await db.query('select count(*)::int count from public.commerce_orders where event_id=$1',[id])).rows[0].count,0);
  });
  await t.test('a group recipient may upgrade its own verified pass while an unrelated email is refused', async () => {
    const id=await event(5),contacts=[attendee(),attendee()];const {order}=await reserveGuests(id,contacts);
    const {passes}=await fulfill(order),pass=passes[1],selection=[person('bundle')];
    assert.equal((await reserve(id,selection,randomUUID(),pass,service,'outsider@example.test')).error,'email_mismatch');
    const upgraded=await reserve(id,selection,randomUUID(),pass,service,contacts[1].email);assert.ok(upgraded.order);
    const done=await fulfill(upgraded.order);assert.equal(done.passes[0].id,pass.id);assert.equal(done.passes[0].qr_code,pass.qr_code);
    assert.equal((await service.query('select email from public.commerce_attendee_contacts where pass_id=$1',[pass.id])).rows[0].email,contacts[1].email);
  });
});
