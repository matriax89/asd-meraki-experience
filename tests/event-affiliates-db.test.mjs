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
test('event affiliates preserve attribution across reservations, fulfillment and upgrades in isolated PostgreSQL', { skip: !['initdb','pg_ctl'].every(name => existsSync(bin(name))), timeout: 90_000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(),'meraki-affiliates-pg-'));
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
  const affiliate = (name = 'Scuola A', active = true) => ({ id: randomUUID(), name, active });
  const config=()=>({version:1,enabled:true,waitlistEnabled:true,upgradesEnabled:true,activities:[
    {id:'ws',name:'Workshop',kind:'workshop',capacity:100,startsAt:null,salesEnd:null,menuOptions:[]},
    {id:'mc',name:'Masterclass',kind:'masterclass',capacity:100,startsAt:null,salesEnd:null,menuOptions:[]},
  ],packages:[
    {id:'ws',name:'Solo WS',description:'',activityIds:['ws'],prices:[{id:'regular',label:'Standard',amountCents:3000,startsAt:null,endsAt:null}]},
    {id:'bundle',name:'WS + MC',description:'',activityIds:['ws','mc'],prices:[{id:'regular',label:'Standard',amountCents:6000,startsAt:null,endsAt:null}]},
  ],addons:[]});
  const person=(packageId='ws',firstName='Ada')=>({firstName,lastName:'Rossi',packageId,addonIds:[],menuChoices:{}});
  const contact=(firstName='Ada')=>({firstName,lastName:'Rossi',email:'buyer@example.test',phone:'+393331234567',documentType:'codice_fiscale',documentCountry:'IT',documentNumber:'RSSMRA80A01H501U',marketingConsent:false});
  async function event(affiliates=[],advanced=true) {
    const id=randomUUID();
    await db.query(`insert into public.events(id,slug,titolo,data_inizio,prezzo_cents,capacity,commerce_config,affiliates) values($1::uuid,$1::uuid::text,'{"it":"Evento affiliati"}',now()+interval '2 days',3000,100,$2,$3)`,[id,json(advanced?config():null),json(affiliates)]);
    return id;
  }
  async function reserve(id,aff=null,{request=randomUUID(),people=[person()],discount=null,pass=null,client=service}={}) {
    return (await client.query('select public.reserve_event_commerce_affiliate($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result',[
      id,request,'buyer@example.test','it',json(people),pass?.id??null,pass?.qr_code??null,pass?null:json(people.map(p=>contact(p.firstName))),pass?null:'2026-10-18-v1',discount,aff,
    ])).rows[0].result;
  }
  async function legacyReserve(id,aff=null,{request=randomUUID(),discount=null}={}) {
    return (await service.query('select public.reserve_event_ticket_affiliate($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result',[request,id,'buyer@example.test','Ada','Rossi','it',json(contact()),'2026-10-18-v1',discount,aff])).rows[0].result;
  }
  async function fulfill(order,session=`cs_${randomUUID()}`) {
    return (await service.query('select public.fulfill_event_commerce($1,$2,$3,$4,$5) result',[order.id,session,`pi_${session}`,order.amount_cents,order.buyer_email])).rows[0].result;
  }
  async function fulfillLegacy(reservation,session=`cs_${randomUUID()}`) {
    return (await service.query('select public.fulfill_event_ticket($1,$2,$3,$4,$5,$6) result',[reservation.id,reservation.event_id,session,`pi_${session}`,reservation.buyer_email,reservation.amount_cents])).rows[0].result;
  }
  async function saveDiscount(id) {
    const discount={code:'AFF20',name:'Promozione',active:true,startsAt:null,endsAt:null,discountType:'percentage',discountValue:20,minSubtotalCents:0,maxUses:10,targetType:'order',targetIds:[],allowedTierIds:[]};
    assert.ok((await service.query('select public.save_event_discount_code($1,$2) result',[id,json(discount)])).rows[0].result.discount);
  }
  await t.test('event configuration rejects malformed, duplicate and private fields',async()=>{
    const a=affiliate();
    for(const invalid of [null,{},[{}],[{...a,name:''}],[{...a,name:' A '}],[{...a,name:'A\nB'}],[{...a,email:'private@example.test'}],[a,a],[a,{...affiliate(),name:'scuola a'}],[{...a,active:'true'}],[{...a,id:'not-a-uuid'}]]) {
      assert.equal((await service.query('select public.event_affiliates_valid($1) valid',[json(invalid)])).rows[0].valid,false,json(invalid));
    }
    assert.equal((await service.query('select public.event_affiliates_valid($1) valid',[json([a,{...affiliate(),name:a.name,active:false}])])).rows[0].valid,true);
    await assert.rejects(event([a,a]),/events_affiliates_valid/);
  });
  await t.test('browser roles cannot invoke attribution RPCs or read private commerce orders',async()=>{
    for(const role of ['anon','authenticated']) {
      const browser=await connect(role);
      await assert.rejects(reserve(randomUUID(),null,{client:browser}),/permission denied/);
      await assert.rejects(browser.query('select * from public.commerce_orders'),/permission denied/);
      await assert.rejects(browser.query('select public.reserve_event_ticket_affiliate(null,null,null,null,null,null,null,null,null,null)'),/permission denied/);
    }
  });
  await t.test('direct purchases work without affiliates and forged inactive or cross-event IDs create no hold',async()=>{
    const a=affiliate(); const inactive=affiliate('Disattivo',false); const id=await event([a,inactive]);
    const foreign=affiliate('Altro evento'); await event([foreign]);
    for(const selection of [inactive.id,foreign.id,randomUUID()]) assert.equal((await reserve(id,selection)).error,'affiliate_unavailable');
    assert.equal((await db.query('select count(*)::int count from public.commerce_orders where event_id=$1',[id])).rows[0].count,0);
    const direct=(await reserve(id)).order; assert.equal(direct.affiliate_id,null); assert.equal(direct.affiliate_name,null); assert.equal(direct.amount_cents,3000);
    const noAffiliates=await event(); assert.ok((await reserve(noAffiliates)).order); assert.equal((await reserve(noAffiliates,a.id)).error,'affiliate_unavailable');
  });
  await t.test('group attribution and discounts retain exact amounts and create a snapshot on every pass',async()=>{
    const a=affiliate(); const id=await event([a]); await saveDiscount(id);
    const request=randomUUID(); const people=[person(),person('bundle','Luca')];
    const {order}=await reserve(id,a.id,{request,people,discount:'AFF20'});
    assert.equal(order.affiliate_id,a.id); assert.equal(order.affiliate_name,a.name); assert.equal(order.amount_cents,7200);
    assert.equal(order.quote.discountCents,1800); assert.equal(JSON.stringify(order.quote).includes('affiliate'),false);
    const session=`cs_${randomUUID()}`; const paid=await fulfill(order,session);
    assert.equal(paid.outcome,'fulfilled'); assert.equal(paid.passes.length,2);
    for(const pass of paid.passes) { assert.equal(pass.affiliate_id,a.id); assert.equal(pass.affiliate_name,a.name); }
    assert.equal((await fulfill(order,session)).passes[0].id,paid.passes[0].id);
    const after=(await db.query('select affiliate_id,affiliate_name from public.commerce_passes where order_id=$1',[order.id])).rows;
    assert.equal(after.length,2); assert.ok(after.every(pass=>pass.affiliate_name===a.name));
  });
  await t.test('idempotency includes affiliate and frozen names survive rename, removal and deactivation',async()=>{
    const a=affiliate(); const b=affiliate('Scuola B'); const id=await event([a,b]); const request=randomUUID();
    const initial=(await reserve(id,a.id,{request})).order;
    await db.query('update public.events set affiliates=$2 where id=$1',[id,json([{...a,name:'Nuovo nome',active:false},b])]);
    const retry=(await reserve(id,a.id,{request})).order;
    assert.equal(retry.id,initial.id); assert.equal(retry.affiliate_name,'Scuola A');
    assert.equal((await reserve(id,b.id,{request})).error,'invalid_request'); assert.equal((await reserve(id,null,{request})).error,'invalid_request');
    assert.equal((await reserve(id,a.id)).error,'affiliate_unavailable');
    await db.query('update public.events set affiliates=$2 where id=$1',[id,json([b])]);
    assert.equal((await reserve(id,a.id,{request})).order.affiliate_name,'Scuola A');
    const paid=await fulfill(initial); assert.equal(paid.passes[0].affiliate_name,'Scuola A');
  });
  await t.test('upgrades retain original attribution and cannot reassign a direct or affiliated pass',async()=>{
    const a=affiliate(); const b=affiliate('Scuola B'); const id=await event([a,b]);
    const original=(await reserve(id,a.id)).order; const pass=(await fulfill(original)).passes[0];
    await db.query('update public.events set affiliates=$2 where id=$1',[id,json([{...a,name:'Rinominato',active:false},b])]);
    const upgrade=(await reserve(id,b.id,{people:[person('bundle')],pass})).order;
    assert.equal(upgrade.affiliate_id,a.id); assert.equal(upgrade.affiliate_name,a.name); assert.equal(upgrade.amount_cents,3000);
    assert.equal((await fulfill(upgrade)).outcome,'fulfilled');
    const retained=(await db.query('select affiliate_id,affiliate_name from public.commerce_passes where id=$1',[pass.id])).rows[0];
    assert.deepEqual(retained,{affiliate_id:a.id,affiliate_name:a.name});
    const direct=(await fulfill((await reserve(id)).order)).passes[0];
    const directUpgrade=(await reserve(id,b.id,{people:[person('bundle')],pass:direct})).order;
    assert.equal(directUpgrade.affiliate_id,null); assert.equal(directUpgrade.affiliate_name,null);
    assert.equal((await reserve(id,b.id,{people:[person('bundle')],pass:{...pass,qr_code:'wrong-token'}})).error,'upgrade_unavailable');
  });
  await t.test('concurrent attempts with the same key cannot attribute one order to two affiliates',async()=>{
    const a=affiliate(); const b=affiliate('Scuola B'); const id=await event([a,b]); const request=randomUUID();
    const concurrent=await Promise.all([connect('service_role'),connect('service_role')]);
    const results=await Promise.all([reserve(id,a.id,{request,client:concurrent[0]}),reserve(id,b.id,{request,client:concurrent[1]})]);
    assert.equal(results.filter(result=>result.order).length,1); assert.equal(results.filter(result=>result.error==='invalid_request').length,1);
    assert.equal((await db.query('select count(*)::int count from public.commerce_orders where request_id=$1',[request])).rows[0].count,1);
  });
  await t.test('single tickets use the same validation, discount and durable snapshot without a pre-attached Stripe session',async()=>{
    const a=affiliate(); const id=await event([a],false); await saveDiscount(id); const request=randomUUID();
    assert.equal((await legacyReserve(id,randomUUID())).error,'affiliate_unavailable');
    const {reservation}=await legacyReserve(id,a.id,{request,discount:'AFF20'});
    assert.equal(reservation.amount_cents,2400); assert.equal(reservation.affiliate_id,a.id); assert.equal(reservation.affiliate_name,a.name); assert.equal(reservation.stripe_session_id,null);
    await db.query('update public.events set affiliates=$2 where id=$1',[id,json([{...a,name:'Cambiato',active:false}])]);
    assert.equal((await legacyReserve(id,a.id,{request,discount:'AFF20'})).reservation.affiliate_name,a.name);
    assert.equal((await legacyReserve(id,null,{request,discount:'AFF20'})).error,'invalid_request');
    const session=`cs_${randomUUID()}`; const paid=await fulfillLegacy(reservation,session);
    assert.equal(paid.outcome,'fulfilled'); assert.equal(paid.ticket.affiliate_id,a.id); assert.equal(paid.ticket.affiliate_name,a.name);
    assert.equal((await fulfillLegacy(reservation,session)).ticket.id,paid.ticket.id);
    const stored=(await db.query('select affiliate_id,affiliate_name from public.tickets where id=$1',[paid.ticket.id])).rows[0];
    assert.deepEqual(stored,{affiliate_id:a.id,affiliate_name:a.name});
    const direct=(await legacyReserve(id)).reservation; const directPaid=await fulfillLegacy(direct);
    assert.equal(directPaid.ticket.affiliate_id,null); assert.equal(directPaid.ticket.affiliate_name,null);
  });
});
