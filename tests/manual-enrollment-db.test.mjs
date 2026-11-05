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
test("manual cash and POS enrollments with an isolated PostgreSQL cluster", {
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

  const service=await connect('service_role');
  const actor=randomUUID();
  await db.query("insert into auth.users(id) values($1)",[actor]);
  await db.query("insert into public.profiles(id,email,role) values($1,'staff@example.test','admin')",[actor]);
  const config=(capacity=20)=>({version:1,enabled:true,waitlistEnabled:true,upgradesEnabled:true,activities:[
    {id:'ws',name:'Workshop',kind:'workshop',capacity,startsAt:null,salesEnd:null,menuOptions:[]},
    {id:'mc',name:'Masterclass',kind:'masterclass',capacity,startsAt:null,salesEnd:null,menuOptions:[]},
    {id:'dinner',name:'Cena',kind:'dinner',capacity,startsAt:null,salesEnd:null,menuOptions:['Classico','Vegetariano']},
  ],packages:[
    {id:'ws',name:'Workshop',description:'',activityIds:['ws'],prices:[{id:'std',label:'Standard',amountCents:2500,startsAt:null,endsAt:null}]},
    {id:'bundle',name:'Workshop + Masterclass',description:'',activityIds:['ws','mc'],prices:[{id:'std',label:'Standard',amountCents:5000,startsAt:null,endsAt:null}]},
  ],addons:[{id:'cena',name:'Cena',activityId:'dinner',amountCents:2000}]});
  const person=(packageId='ws',name='Ada',dinner=false)=>({firstName:name,lastName:'Rossi',packageId,addonIds:dinner?['cena']:[],menuChoices:dinner?{dinner:'Classico'}:{}});
  const attendee=(p,foreign=false)=>({firstName:p.firstName,lastName:p.lastName,email:`${p.firstName.toLowerCase()}@example.test`,phone:'+393331234567',documentType:foreign?'foreign_id':'codice_fiscale',documentCountry:foreign?'DE':'IT',documentNumber:foreign?'AA1234567':'RSSMRA85T10A562S',marketingConsent:false});
  async function event(capacity=20) {const id=randomUUID();await db.query(`insert into public.events(id,slug,titolo,data_inizio,prezzo_cents,capacity,commerce_config) values($1,$2,'{"it":"Manual test"}',now()+interval '2 days',2500,$3,$4)`,[id,`manual-${id}`,capacity,JSON.stringify(config(capacity))]);return id;}
  function body(eventId,people=[person()],extra={}) {return {actor,request:randomUUID(),eventId,buyer:attendee(people[0]).email,people,attendees:people.map(p=>attendee(p)),total:people.reduce((sum,p)=>sum+(p.packageId==='bundle'?5000:2500)+(p.addonIds.length?2000:0),0),method:'cash',paidAt:new Date().toISOString(),reference:null,fee:0,note:null,discount:null,affiliate:null,upgrade:null,...extra};}
  async function enroll(b,client=service) {return (await client.query('select public.record_manual_commerce_enrollment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) result',[b.actor,b.request,b.eventId,b.buyer,'it',JSON.stringify(b.people),b.attendees===null?null:JSON.stringify(b.attendees),b.total,b.method,b.paidAt,b.reference,b.fee,b.note,b.discount,b.affiliate,b.upgrade])).rows[0].result;}
  async function refund(o,amount,extra={}) {const b={request:randomUUID(),amount,reason:'Restituito in contanti',date:new Date().toISOString(),reference:null,ids:[],expected:amount,used:false,...extra};return (await service.query('select public.record_manual_commerce_refund($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',[actor,b.request,o,b.amount,b.reason,b.date,b.reference,b.ids,b.expected,b.used])).rows[0].result;}
  async function row(table,id) {return (await db.query(`select * from public.${table} where id=$1`,[id])).rows[0];}
  await t.test('private RPCs reject public roles and require a real staff actor',async()=>{
    const anon=await connect('anon');const auth=await connect('authenticated');
    for(const client of [anon,auth]) {await assert.rejects(enroll(body(await event()),client),/permission denied/);await assert.rejects(client.query('select * from public.manual_commerce_refunds'),/permission denied/);}
    await assert.rejects(enroll(body(await event(),[person()],{actor:randomUUID()})),/Staff authorization/);
  });
  await t.test('cash group enrollment creates separate QR passes, contacts, dinner rights and zero fees without Stripe IDs',async()=>{
    const id=await event();const b=body(id,[person('bundle','Ada',true),person('ws','Luca')]);b.attendees[1]=attendee(b.people[1],true);
    const result=await enroll(b);assert.equal(result.replayed,false);assert.equal(result.passIds.length,2);
    const order=await row('commerce_orders',result.orderId);assert.equal(order.state,'fulfilled');assert.equal(order.payment_method,'cash');assert.equal(order.manual_fee_cents,0);assert.equal(order.stripe_session_id,null);assert.equal(order.stripe_payment_intent,null);
    const passes=(await db.query('select * from public.commerce_passes where order_id=$1',[order.id])).rows;
    assert.notEqual(passes[0].qr_code,passes[1].qr_code);assert.equal((await db.query('select count(*)::int n from public.commerce_entitlements where order_id=$1',[order.id])).rows[0].n,4);
    assert.equal((await db.query('select count(*)::int n from public.commerce_attendee_contacts where order_id=$1',[order.id])).rows[0].n,2);
    assert.equal((await db.query('select count(*)::int n from public.marketing_contacts')).rows[0].n,0);
    assert.equal((await row('events',id)).posti_venduti,2);
    const replay=await enroll(b);assert.equal(replay.replayed,true);assert.deepEqual(replay.passIds,result.passIds);
    assert.equal((await enroll({...b,total:b.total+1})).error,'request_conflict');
  });
  await t.test('POS unknown and known fees are recorded and invalid amounts/documents roll back every hold',async()=>{
    let b=body(await event(),[person()],{method:'pos',fee:null});let result=await enroll(b);assert.equal((await row('commerce_orders',result.orderId)).manual_fee_cents,null);
    b=body(await event(),[person()],{method:'pos',fee:45});result=await enroll(b);assert.equal((await row('commerce_orders',result.orderId)).manual_fee_cents,45);
    b=body(await event(),[person()],{total:2499});assert.equal((await enroll(b)).error,'price_changed');
    assert.equal((await db.query('select count(*)::int n from public.commerce_orders where request_id=$1',[b.request])).rows[0].n,0);
    b=body(await event());b.attendees[0].documentNumber='';assert.equal((await enroll(b)).error,'invalid_attendees');
    b=body(await event());b.attendees[0].documentNumber='RSSMRA85T10A562A';assert.equal((await enroll(b)).error,'invalid_attendees');
    b=body(await event());b.attendees[0].marketingConsent=true;assert.equal((await enroll(b)).error,'invalid_attendees');
    assert.equal((await enroll(body(await event(),[person()],{method:'cash',fee:10}))).error,'invalid_manual_payment');
  });
  await t.test('online request IDs cannot be converted to offline payments',async()=>{
    const b=body(await event());const online=(await service.query("select public.reserve_event_commerce_affiliate($1,$2,$3,'it',$4,null,null,$5,'2026-10-18-v1',null,null) result",[b.eventId,b.request,b.buyer,JSON.stringify(b.people),JSON.stringify(b.attendees)])).rows[0].result;
    assert.ok(online.order);assert.equal((await enroll(b)).error,'request_conflict');assert.equal((await row('commerce_orders',online.order.id)).payment_method,'online');
  });
  await t.test('concurrent final seats and duplicate clicks are atomic across independent transactions',async()=>{
    const id=await event(1);const b=body(id);
    const first=await connect('service_role'),second=await connect('service_role');
    const results=await Promise.all([enroll(b,first),enroll({...b,request:randomUUID()},second)]);
    assert.equal(results.filter(r=>r.orderId).length,1);assert.equal(results.filter(r=>r.error==='sold_out').length,1);
    const other=body(await event(1));const duplicate=await Promise.all([enroll(other,first),enroll(other,second)]);assert.equal(duplicate.filter(r=>r.replayed).length,1);assert.equal(duplicate[0].orderId,duplicate[1].orderId);
    const group=body(await event(1),[person(),person('ws','Luca')]);assert.equal((await enroll(group)).error,'sold_out');
    assert.equal((await db.query('select count(*)::int n from public.commerce_orders where request_id=$1',[group.request])).rows[0].n,0);
  });
  await t.test('upgrades keep the same person, original contacts and current affiliate while adding paid rights',async()=>{
    const id=await event();const b=body(id);const original=await enroll(b);const pass=await row('commerce_passes',original.passIds[0]);
    const affiliate=randomUUID();await db.query('update public.commerce_passes set affiliate_id=$1,affiliate_name=$2 where id=$3',[affiliate,'Current Affiliate',pass.id]);
    const up=body(id,[person('bundle')],{attendees:null,total:4500,upgrade:pass.id});up.people[0].addonIds=['cena'];up.people[0].menuChoices={dinner:'Classico'};
    const result=await enroll(up);assert.ok(result.orderId,JSON.stringify(result));assert.deepEqual(result.passIds,[pass.id]);
    const updated=await row('commerce_passes',pass.id);assert.equal(updated.package_id,'bundle');assert.equal(updated.package_paid_cents,5000);assert.equal(updated.affiliate_id,affiliate);
    assert.equal((await row('commerce_orders',result.orderId)).affiliate_id,affiliate);
    assert.equal((await db.query('select count(*)::int n from public.commerce_attendee_contacts where pass_id=$1',[pass.id])).rows[0].n,1);
    assert.equal((await row('events',id)).posti_venduti,1);
    assert.equal((await enroll(up)).replayed,true);
    assert.equal((await enroll(body(id,[person('bundle','SomeoneElse')],{attendees:null,total:2500,upgrade:pass.id}))).error,'invalid_upgrade');
  });
  await t.test('manual partial and full refunds preserve other orders, use a durable ledger, and never touch Stripe refund records',async()=>{
    const id=await event();const original=await enroll(body(id));const passId=original.passIds[0];
    const upgrade=await enroll(body(id,[person('bundle')],{attendees:null,total:2500,upgrade:passId}));
    const refundDate=new Date().toISOString(),request=randomUUID();
    const partial=await refund(original.orderId,500,{request,date:refundDate,expected:2500});assert.equal(partial.availableCents,2000);
    const repeat=await refund(original.orderId,500,{request,date:refundDate,expected:2500});assert.equal(repeat.replayed,true);
    assert.equal((await service.query('select public.meraki_pass_refund_blocked($1) blocked',[passId])).rows[0].blocked,true);
    await assert.rejects(refund(original.orderId,2501,{expected:2000}),/exceeds remaining/);
    await assert.rejects(refund(original.orderId,1,{expected:2500}),/balance changed/);
    const full=await refund(original.orderId,2000,{expected:2000});assert.equal(full.availableCents,0);
    assert.equal((await row('commerce_orders',original.orderId)).state,'refunded');assert.equal((await row('commerce_passes',passId)).status,'paid');assert.equal((await row('events',id)).posti_venduti,1);
    assert.equal((await db.query('select count(*)::int n from public.commerce_entitlements where order_id=$1 and status=$2',[upgrade.orderId,'valid'])).rows[0].n,1);
    await refund(upgrade.orderId,2500);assert.equal((await row('commerce_passes',passId)).status,'refunded');assert.equal((await row('events',id)).posti_venduti,0);
    assert.equal((await db.query('select count(*)::int n from public.commerce_payment_refunds')).rows[0].n,0);
  });
  await t.test('discount caps, allocation and consumption use the same reservation engine and failed amounts release coupon holds',async()=>{
    const id=await event();const code=randomUUID();await db.query("insert into public.event_discount_codes(id,event_id,code,name,discount_type,discount_value,target_type,max_uses) values($1,$2,'STAFF','Staff discount','fixed_amount',500,'order',1)",[code,id]);
    const wrong=body(id,[person('bundle','Ada',true)],{discount:'STAFF',total:6000});assert.equal((await enroll(wrong)).error,'price_changed');
    assert.equal((await db.query('select count(*)::int n from public.event_discount_redemptions where discount_code_id=$1',[code])).rows[0].n,0);
    const paid=await enroll({...wrong,request:randomUUID(),total:6500});assert.ok(paid.orderId);const order=await row('commerce_orders',paid.orderId);
    assert.equal(order.quote.lines.find(line=>line.kind==='addon').totalCents,2000,'dinner always keeps its full price');assert.equal((await row('commerce_passes',paid.passIds[0])).package_paid_cents,4500);
    assert.ok((await db.query('select consumed_at from public.event_discount_redemptions where commerce_order_id=$1',[order.id])).rows[0].consumed_at);
    assert.equal((await enroll(body(id,[person('ws','Luca')],{discount:'STAFF',total:2000}))).error,'discount_exhausted');
  });
  await t.test('pending online upgrades block manual refunds and event cancellation leaves offline funds due until recorded returned',async()=>{
    const id=await event();const original=await enroll(body(id));const pass=await row('commerce_passes',original.passIds[0]);const people=[person('bundle')];
    const pending=(await service.query("select public.reserve_event_commerce_affiliate($1,$2,$3,'it',$4,$5,$6,null,null,null,null) result",[id,randomUUID(),'ada@example.test',JSON.stringify(people),pass.id,pass.qr_code])).rows[0].result;
    assert.ok(pending.order);await assert.rejects(refund(original.orderId,2500),/upgrade payment is in progress/);
    await service.query('select public.begin_meraki_event_cancellation($1,$2,$3)',[id,'Canceled event',actor]);
    assert.equal((await row('commerce_orders',original.orderId)).state,'fulfilled');assert.equal((await db.query('select count(*)::int n from public.manual_commerce_refunds where order_id=$1',[original.orderId])).rows[0].n,0);
    assert.equal((await row('commerce_passes',pass.id)).status,'canceled');const returned=await refund(original.orderId,2500);assert.equal(returned.availableCents,0);
    assert.equal((await row('commerce_passes',pass.id)).status,'canceled');assert.equal((await row('events',id)).posti_venduti,0);
  });
  await t.test('refund admission selection is scoped to its order and used admissions require confirmation',async()=>{
    const a=await enroll(body(await event()));const b=await enroll(body(await event()));
    const rights=(await db.query('select id from public.commerce_entitlements where order_id=$1',[a.orderId])).rows;
    const other=(await db.query('select id from public.commerce_entitlements where order_id=$1',[b.orderId])).rows[0];
    await assert.rejects(refund(a.orderId,10,{expected:2500,ids:[other.id]}),/Invalid refund admissions/);
    await db.query("update public.commerce_entitlements set status='used' where id=$1",[rights[0].id]);
    await assert.rejects(refund(a.orderId,2500),/Confirm used/);
    await refund(a.orderId,2500,{used:true});assert.equal((await row('commerce_passes',a.passIds[0])).status,'refunded');
  });
});
