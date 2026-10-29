import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import pg from 'pg';

const exec = promisify(execFile);
const binaries = process.env.MERAKI_PG_BIN || '/opt/homebrew/bin';
const bin = name => path.join(binaries, name);
const json = JSON.stringify;
test('discounts quote, reserve and redeem atomically in isolated PostgreSQL', { skip: !['initdb','pg_ctl'].every(name => existsSync(bin(name))), timeout: 90_000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(),'meraki-discounts-pg-'));
  const dataDirectory = path.join(directory,'data');
  const listener = createServer();
  await new Promise((resolve,reject) => { listener.once('error',reject); listener.listen(0,'127.0.0.1',resolve); });
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const clients = new Set(); let started = false;
  async function connect(role) {
    const client = new pg.Client({host:'127.0.0.1',port,user:'postgres',database:'postgres'});
    await client.connect(); clients.add(client); if(role) await client.query(`set role ${role}`); return client;
  }
  t.after(async () => { await Promise.allSettled([...clients].map(client => client.end())); if(started) await exec(bin('pg_ctl'),['-D',dataDirectory,'-m','immediate','-w','stop']); await rm(directory,{recursive:true,force:true}); });
  await exec(bin('initdb'),['-D',dataDirectory,'-U','postgres','-A','trust','--no-instructions']);
  await exec(bin('pg_ctl'),['-D',dataDirectory,'-l',path.join(directory,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${directory}`,'-w','start']); started=true;
  const db=await connect();
  await db.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create schema storage; create schema extensions;
    create table auth.users(id uuid primary key); create table storage.buckets(id text primary key,name text,public boolean);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;`);
  const migrationDirectory=new URL('../supabase/migrations/',import.meta.url);
  for(const filename of (await readdir(migrationDirectory)).filter(name => /^\d+.*\.sql$/.test(name)).sort()) await db.query(await readFile(new URL(filename,migrationDirectory),'utf8'));
  const service=await connect('service_role');
  const config=()=>({version:1,enabled:true,waitlistEnabled:true,upgradesEnabled:true,activities:[
    {id:'ws',name:'Workshop',kind:'workshop',capacity:100,startsAt:null,salesEnd:null,menuOptions:[]},
    {id:'mc',name:'Masterclass',kind:'masterclass',capacity:100,startsAt:null,salesEnd:null,menuOptions:[]},
    {id:'dinner',name:'Cena',kind:'dinner',capacity:100,startsAt:null,salesEnd:null,menuOptions:[]},
  ],packages:[
    {id:'ws',name:'Solo WS',description:'',activityIds:['ws'],prices:[{id:'early',label:'Early',amountCents:3000,startsAt:null,endsAt:null}]},
    {id:'mc',name:'Solo MC',description:'',activityIds:['mc'],prices:[{id:'regular',label:'Regular',amountCents:4000,startsAt:null,endsAt:null}]},
    {id:'bundle',name:'WS + MC',description:'',activityIds:['ws','mc'],prices:[{id:'regular',label:'Regular',amountCents:6000,activityAmounts:{ws:2571,mc:3429},startsAt:null,endsAt:null}]},
  ],addons:[{id:'dinner',name:'Cena',activityId:'dinner',amountCents:2000}]});
  const person=(packageId='ws',addonIds=[],firstName='Ada')=>({firstName,lastName:'Rossi',packageId,addonIds,menuChoices:{}});
  const contact=(name='Ada')=>({firstName:name,lastName:'Rossi',email:'buyer@example.test',phone:'+393331234567',documentType:'codice_fiscale',documentCountry:'IT',documentNumber:'RSSMRA80A01H501U',marketingConsent:false});
  async function event(c=config()) { const id=randomUUID(); await db.query(`insert into public.events(id,slug,titolo,data_inizio,prezzo_cents,capacity,commerce_config) values($1::uuid,$1::uuid::text,'{"it":"Evento test"}',now()+interval '2 days',3000,100,$2)`,[id,json(c)]); return id; }
  const input=(overrides={})=>({code:'WS20',name:'Workshop -20%',active:true,startsAt:null,endsAt:null,discountType:'percentage',discountValue:20,minSubtotalCents:0,maxUses:null,targetType:'activity',targetIds:['ws'],allowedTierIds:[],...overrides});
  async function save(id,value=input()) { return (await service.query('select public.save_event_discount_code($1,$2) result',[id,json(value)])).rows[0].result; }
  async function quote(id,people=[person()],code='WS20',client=service,pass=null) { return (await client.query('select public.quote_event_commerce_discount($1,$2,$3,$4,$5) result',[id,json(people),pass?.id??null,pass?.qr_code??null,code])).rows[0].result; }
  async function reserve(id,people=[person()],code='WS20',request=randomUUID(),client=service) { return (await client.query('select public.reserve_event_commerce_discount($1,$2,$3,$4,$5,null,null,$6,$7,$8) result',[id,request,'buyer@example.test','es',json(people),json(people.map(p=>contact(p.firstName))),'2026-10-18-v1',code])).rows[0].result; }
  async function fulfill(order,client=service,session=`cs_${randomUUID()}`) { return (await client.query('select public.fulfill_event_commerce($1,$2,$3,$4,$5) result',[order.id,session,`pi_${session}`,order.amount_cents,order.buyer_email])).rows[0].result; }
  async function stats(id) { return (await service.query('select public.event_discount_code_stats($1) result',[id])).rows[0].result.discounts; }
  async function legacyReserve(id,code,request=randomUUID(),client=service) { return (await client.query('select public.reserve_event_ticket_discount($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[request,id,'buyer@example.test','Ada','Rossi','es',json(contact()),'2026-10-18-v1',code])).rows[0].result; }

  await t.test('private codes, RPCs and redemptions cannot be read by browsers',async()=>{
    for(const role of ['anon','authenticated']) { const client=await connect(role); for(const table of ['event_discount_codes','event_discount_redemptions']) await assert.rejects(client.query(`select * from public.${table}`),/permission denied/); await assert.rejects(client.query('select public.quote_event_ticket_discount($1,$2)',[randomUUID(),'WS20']),/permission denied/); }
  });
  await t.test('activity-only percentage keeps masterclass and dinner intact with explicit bundle allocation',async()=>{
    const id=await event(); assert.ok((await save(id)).discount);
    const solo=await quote(id); assert.equal(solo.quote.totalCents,2400);
    const bundle=await quote(id,[person('bundle',['dinner'])],' ws20 ');
    assert.equal(bundle.quote.subtotalCents,8000); assert.equal(bundle.quote.discountCents,514); assert.equal(bundle.quote.totalCents,7486);
    assert.deepEqual(bundle.quote.lines.map(line=>line.totalCents),[5486,2000]); assert.deepEqual(bundle.quote.lines[0].activityAmounts,{ws:2571,mc:3429});
    assert.equal(bundle.quote.discount.eligibleCents,2571); assert.equal(bundle.quote.discount.code,'WS20');
    const {order}=await reserve(id,[person('bundle',['dinner'])]); assert.equal(order.amount_cents,7486); assert.equal(order.attendees[0].email,'buyer@example.test');
    const paid=await fulfill(order); assert.equal(paid.outcome,'fulfilled'); assert.equal(paid.passes[0].package_paid_cents,5486);
  });
  await t.test('old bundles use exact ordered equal cents; malformed allocations or translations cannot save',async()=>{
    const c=config(); c.packages[2].prices[0].amountCents=6001; delete c.packages[2].prices[0].activityAmounts;
    const id=await event(c); await save(id);
    assert.deepEqual((await quote(id,[person('bundle')])).quote.lines[0].activityAmounts,{ws:3001,mc:3000});
    c.packages[2].prices[0].activityAmounts={ws:3000,mc:3000};
    assert.equal((await service.query('select public.save_commerce_config($1,$2) result',[id,json(c)])).rows[0].result.error,'invalid_config');
    c.packages[2].prices[0].activityAmounts={ws:3001,mc:3000}; c.activities[0].nameTranslations={it:'Workshop',en:'Workshop',de:'Workshop',es:'Taller'};
    assert.equal((await service.query('select public.save_commerce_config($1,$2) result',[id,json(c)])).rows[0].result.saved,true);
    c.activities[0].nameTranslations.fr='Atelier'; assert.equal((await service.query('select public.save_commerce_config($1,$2) result',[id,json(c)])).rows[0].result.error,'invalid_config');
  });
  await t.test('targets, tier restrictions, dates, minima and payment floor are enforced on the server',async()=>{
    const id=await event(); await save(id,input({allowedTierIds:['regular']})); assert.equal((await quote(id)).error,'discount_not_applicable'); assert.ok((await quote(id,[person('bundle')])).quote);
    assert.equal((await save(id,input({code:'BAD',targetIds:['missing']}))).error,'invalid_discount_target');
    await save(id,input({code:'MIN',minSubtotalCents:7000})); assert.equal((await quote(id,[person()],'MIN')).error,'discount_minimum_subtotal');
    await save(id,input({code:'FUTURE',startsAt:new Date(Date.now()+3600000).toISOString()})); assert.equal((await quote(id,[person()],'FUTURE')).error,'discount_unavailable');
    await save(id,input({code:'ENDED',endsAt:new Date(Date.now()-3600000).toISOString()})); assert.equal((await quote(id,[person()],'ENDED')).error,'discount_unavailable');
    await save(id,input({code:'FREE',discountType:'fixed_amount',discountValue:3000,targetType:'order',targetIds:[]})); assert.equal((await quote(id,[person()],'FREE')).error,'discount_minimum_payment');
    assert.equal((await save(id,input({code:'ADDON',targetType:'addon',targetIds:['dinner']}))).error,'invalid_discount_target');
    assert.equal((await save(id,input({code:'EARLYDINNER',targetType:'addon',targetIds:['dinner'],allowedTierIds:['early']}))).error,'invalid_discount_target');
    await save(id,input({code:'PKG',targetType:'package',targetIds:['bundle']})); assert.equal((await quote(id,[person('bundle',['dinner'])],'PKG')).quote.discountCents,1200);
    assert.equal((await quote(id,[person()],'UNKNOWN')).error,'discount_invalid');
    assert.equal((await save(id,input({code:'ALLFREE',discountValue:100}))).error,'invalid_discount');
  });
  await t.test('a single fixed discount spreads exact cents across people and stores each actual paid package amount',async()=>{
    const id=await event(); await save(id,input({discountType:'fixed_amount',discountValue:1002,targetType:'order',targetIds:[]}));
    const people=[person(),person('ws',['dinner'],'Luca')]; const {order}=await reserve(id,people);
    assert.equal(order.amount_cents,6998); assert.equal(order.quote.lines.reduce((sum,line)=>sum+line.discountCents,0),1002);
    const paid=await fulfill(order); assert.equal(paid.outcome,'fulfilled');
    assert.deepEqual(paid.passes.map(pass=>pass.package_paid_cents),order.quote.lines.filter(line=>line.kind==='package').map(line=>line.totalCents));
    assert.equal(paid.passes[0].package_paid_cents,paid.passes[1].package_paid_cents); assert.equal(order.quote.lines.find(line=>line.kind==='addon').totalCents,2000);
  });
  await t.test('idempotent retries freeze the quote and privacy but cannot switch the code',async()=>{
    const id=await event(); const {discount}=await save(id); const request=randomUUID(); const first=await reserve(id,[person()],'ws20',request);
    await save(id,input({id:discount.id,active:false,discountValue:50}));
    const retry=await reserve(id,[person()],'WS20',request); assert.equal(retry.order.id,first.order.id); assert.equal(retry.order.amount_cents,2400);
    assert.equal((await reserve(id,[person()],'OTHER',request)).error,'invalid_request');
    assert.equal((await reserve(id,[person('mc')],'WS20',request)).error,'invalid_request');
    assert.equal((await stats(id))[0].reserved_uses,1);
  });
  await t.test('concurrent holds cannot exceed the usage cap, expiry releases it and a late payment cannot steal it',async()=>{
    const id=await event(); await save(id,input({maxUses:1})); const clients=await Promise.all([connect('service_role'),connect('service_role')]);
    const blocker=await connect(); await blocker.query('begin'); await blocker.query('select id from public.events where id=$1 for update',[id]);
    const attempts=clients.map(client=>reserve(id,[person()],'WS20',randomUUID(),client)); attempts.forEach(p=>p.catch(()=>{}));
    let waiting=0; const deadline=Date.now()+5000;
    while(waiting<2 && Date.now()<deadline) { waiting=(await db.query("select count(*)::int count from pg_stat_activity where wait_event_type='Lock' and query like 'select public.reserve_event_commerce_discount%'")).rows[0].count; if(waiting<2) await new Promise(resolve=>setTimeout(resolve,10)); }
    await blocker.query('rollback'); assert.equal(waiting,2,'both reservations must overlap on the shared event lock');
    const results=await Promise.all(attempts); assert.equal(results.filter(result=>result.order).length,1); assert.equal(results.filter(result=>result.error==='discount_exhausted').length,1);
    const first=results.find(result=>result.order).order; await db.query("update public.commerce_orders set expires_at=now()-interval '1 minute' where id=$1",[first.id]);
    const second=(await reserve(id)).order; assert.ok(second); assert.equal((await fulfill(first)).outcome,'refund_required');
    const session=`cs_${randomUUID()}`; const completed=await fulfill(second,service,session); assert.equal(completed.outcome,'fulfilled');
    assert.equal((await fulfill(second,service,session)).passes[0].id,completed.passes[0].id);
    await service.query('select public.revoke_commerce_payment($1)',[`pi_${session}`]);
    const usage=(await stats(id))[0]; assert.equal(usage.redeemed_uses,1); assert.equal(usage.reserved_uses,0); assert.equal((await reserve(id)).error,'discount_exhausted');
  });
  await t.test('failed holds release usage, caps cannot be lowered below usage and upgrades use actual paid credit',async()=>{
    const id=await event(); const {discount}=await save(id,input({maxUses:2}));
    const first=(await reserve(id)).order; await service.query("select public.transition_commerce_order($1,null,'payment_failed')",[first.id]);
    const second=(await reserve(id)).order; const third=(await reserve(id)).order;
    assert.equal((await save(id,input({id:discount.id,maxUses:1}))).error,'discount_limit_below_usage');
    await db.query("update public.commerce_orders set expires_at=now()-interval '1 minute' where id=$1",[third.id]);
    const paid=await fulfill(second); assert.equal(paid.outcome,'fulfilled');
    assert.equal((await save(id,input({id:discount.id,maxUses:1}))).discount.max_uses,1);
    const pass=paid.passes[0]; assert.equal((await quote(id,[person('bundle')],'WS20',service,pass)).error,'discount_upgrade_unsupported');
    const upgrade=(await service.query('select public.quote_event_commerce($1,$2,$3,$4) result',[id,json([person('bundle')]),pass.id,pass.qr_code])).rows[0].result;
    assert.equal(upgrade.quote.totalCents,3600);
    assert.equal((await save(id,input({id:discount.id,maxUses:0}))).error,'invalid_discount');
  });
  await t.test('simple guest tickets freeze discount totals, cap usage and retain redeemed use after refunds',async()=>{
    const id=await event(null); await save(id,input({targetType:'order',targetIds:[],maxUses:1}));
    const q=(await service.query('select public.quote_event_ticket_discount($1,$2) result',[id,'ws20'])).rows[0].result; assert.equal(q.quote.totalCents,2400);
    const request=randomUUID(); const {reservation}=await legacyReserve(id,'WS20',request); assert.equal(reservation.amount_cents,2400); assert.equal(reservation.discount_quote.discountCents,600); assert.ok(reservation.attendee);
    assert.equal((await legacyReserve(id,'ws20',request)).reservation.id,request); assert.equal((await legacyReserve(id,'WS20')).error,'discount_exhausted');
    const session=`cs_${randomUUID()}`; const result=(await service.query('select public.fulfill_event_ticket($1,$2,$3,$4,$5,$6) result',[request,id,session,`pi_${session}`,'buyer@example.test',2400])).rows[0].result;
    assert.equal(result.outcome,'fulfilled'); assert.equal(result.ticket.amount_cents,2400); assert.equal((await stats(id))[0].redeemed_uses,1);
    await service.query('select public.revoke_event_ticket($1)',[`pi_${session}`]); assert.equal((await legacyReserve(id,'WS20')).error,'discount_exhausted');
  });
  await t.test('legacy and commerce share a cap when an expired simple checkout pays after formulas are enabled',async()=>{
    const id=await event(null); await save(id,input({targetType:'order',targetIds:[],maxUses:1}));
    const {reservation}=await legacyReserve(id,'WS20');
    await db.query("update public.ticket_reservations set expires_at=now()-interval '1 minute' where id=$1",[reservation.id]);
    await service.query('select public.save_commerce_config($1,$2)',[id,json(config())]);
    const {order}=await reserve(id); assert.ok(order);
    const session=`cs_${randomUUID()}`;
    const late=(await service.query('select public.fulfill_event_ticket($1,$2,$3,$4,$5,$6) result',[reservation.id,id,session,`pi_${session}`,'buyer@example.test',2400])).rows[0].result;
    assert.equal(late.outcome,'refund_required'); assert.equal((await stats(id))[0].reserved_uses,1);
    assert.equal((await fulfill(order)).outcome,'fulfilled'); assert.equal((await stats(id))[0].redeemed_uses,1);
  });
  await t.test('refund tombstones win before cap reconciliation and never consume an unused code',async()=>{
    const id=await event(); await save(id,input({maxUses:1})); const first=(await reserve(id)).order;
    await db.query("update public.commerce_orders set expires_at=now()-interval '1 minute' where id=$1",[first.id]);
    const second=(await reserve(id)).order; const session=`cs_${randomUUID()}`;
    await service.query('select public.revoke_commerce_payment($1)',[`pi_${session}`]);
    assert.equal((await fulfill(first,service,session)).outcome,'refunded');
    assert.equal((await stats(id))[0].redeemed_uses,0); assert.equal((await stats(id))[0].reserved_uses,1);
    assert.equal((await fulfill(second)).outcome,'fulfilled');
  });
});
